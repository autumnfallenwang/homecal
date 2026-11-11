"""Unit tests for the speaker agent. Termux commands, HTTP and the clock are faked."""

import hashlib
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

import agent  # noqa: E402

T0 = datetime(2026, 11, 10, 11, 0, 0, tzinfo=timezone.utc)


class FakeClock:
    def __init__(self, now=T0):
        self.now = now

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


class FakeRunner:
    """Records Termux commands; answers status calls with canned JSON."""

    def __init__(self, check_out=None, check_rc=0):
        self.calls = []
        self.check_out = check_out
        self.check_rc = check_rc

    def __call__(self, cmd, timeout=90):
        self.calls.append(cmd)
        name = os.path.basename(cmd[0])
        if name == "termux-battery-status":
            return {"rc": 0, "out": json.dumps({"percentage": 87, "plugged": "PLUGGED_AC",
                                                "temperature": 27.5}), "err": ""}
        if name == "termux-wifi-connectioninfo":
            return {"rc": 0, "out": json.dumps({"rssi": -71}), "err": ""}
        if name == "termux-volume" and len(cmd) == 1:
            return {"rc": 0, "out": json.dumps([{"stream": "alarm", "volume": 7},
                                                {"stream": "music", "volume": 2}]), "err": ""}
        if len(cmd) >= 3 and cmd[2] == "--check":
            return {"rc": self.check_rc, "out": self.check_out or "", "err": "SyntaxError: boom"
                    if self.check_rc else ""}
        return {"rc": 0, "out": "", "err": ""}

    def named(self, name):
        return [c for c in self.calls if os.path.basename(c[0]) == name]


class FakeHttp:
    def __init__(self, desired=None, files=None, fail=False):
        self.server = "http://cluster"
        self.desired = desired or {}
        self.files = files or {}
        self.fail = fail
        self.reports = []

    def post_json(self, path, body):
        if self.fail:
            raise urllib.error.URLError("cluster down")
        self.reports.append(body)
        return self.desired

    def get_bytes(self, path):
        if path not in self.files:
            raise urllib.error.URLError("404")
        return self.files[path]


def desired_state(**over):
    base = {
        "schemaVersion": 1, "deviceId": "d1", "name": "Kids' room", "serverTime": agent.iso(T0),
        "nextPollAfterMs": 60000,
        "settings": {"language": "en", "volumes": {"alarm": 10, "music": 8}, "quietWindows": []},
        "agent": None, "sounds": [], "schedule": [], "announcements": [], "ack": [],
    }
    base.update(over)
    return base


class AgentTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = os.path.join(self.tmp.name, "home")
        self.cache = os.path.join(self.tmp.name, "cache")
        self.clock = FakeClock()
        self.runner = FakeRunner()
        self.sleeps = []

    def tearDown(self):
        self.tmp.cleanup()

    def make(self, http, **kw):
        a = agent.Agent(http, home=self.home, cache=self.cache, runner=self.runner,
                        clock=self.clock, sleep=self.sleeps.append, **kw)
        a.restarted = False

        def fake_restart():
            a.restarted = True

        a.restart = fake_restart
        return a


class TestSync(AgentTestCase):
    def test_report_carries_version_status_and_outbox(self):
        http = FakeHttp(desired_state())
        a = self.make(http)
        a.record_rang("routine:r1:2026-11-10", ok=True)
        a.sync_once()
        report = http.reports[0]
        self.assertEqual(report["schemaVersion"], 1)
        self.assertEqual(report["agentVersion"], agent.VERSION)
        self.assertEqual(report["status"]["battery"], 87)
        self.assertTrue(report["status"]["charging"])
        self.assertEqual(report["status"]["wifiRssi"], -71)
        self.assertEqual(report["status"]["volumes"], {"alarm": 7, "music": 2})
        self.assertEqual([r["id"] for r in report["rang"]], ["routine:r1:2026-11-10"])

    def test_acked_reports_leave_the_outbox_and_unacked_stay(self):
        a = self.make(FakeHttp(desired_state(ack=["a"])))
        a.record_rang("a", ok=True)
        a.record_rang("b", ok=True)
        a.sync_once()
        self.assertEqual([r["id"] for r in a.outbox], ["b"])
        # Survives a restart.
        again = self.make(FakeHttp(desired_state()))
        self.assertEqual([r["id"] for r in again.outbox], ["b"])

    def test_poll_interval_follows_the_cluster_within_bounds(self):
        self.assertEqual(self.make(FakeHttp(desired_state(nextPollAfterMs=5000))).sync_once(), 5)
        self.assertEqual(self.make(FakeHttp(desired_state(nextPollAfterMs=10))).sync_once(), 2)
        self.assertEqual(self.make(FakeHttp(desired_state(nextPollAfterMs=10**9))).sync_once(), 300)

    def test_cluster_down_keeps_the_cached_state_and_backs_off(self):
        item = {"id": "routine:r1:2026-11-10", "kind": "routine", "at": agent.iso(T0),
                "sound": "beeps", "text": "Good morning"}
        self.make(FakeHttp(desired_state(schedule=[item]))).sync_once()
        a = self.make(FakeHttp(fail=True))
        self.assertEqual(a.sync_once(), agent.OFFLINE_POLL_S)
        self.assertEqual([i["id"] for i in a.due_items()], ["routine:r1:2026-11-10"])

    def test_volumes_applied_once_until_they_change(self):
        a = self.make(FakeHttp(desired_state()))
        a.sync_once()
        a.sync_once()
        sets = [c for c in self.runner.named("termux-volume") if len(c) == 3]
        self.assertEqual(sets, [["termux-volume", "alarm", "10"], ["termux-volume", "music", "8"]])


class TestScheduler(AgentTestCase):
    def item(self, at, id_="routine:r1:2026-11-10"):
        return {"id": id_, "kind": "routine", "at": agent.iso(at), "sound": "beeps",
                "text": "Good morning"}

    def test_rings_once_at_the_instant(self):
        a = self.make(FakeHttp(desired_state(schedule=[self.item(T0 + timedelta(seconds=30))])))
        a.sync_once()
        self.assertEqual(a.due_items(), [])
        self.clock.advance(31)
        self.assertEqual(len(a.due_items()), 1)
        self.assertEqual(a.due_items(), [])
        # Not again after a restart either.
        self.assertEqual(self.make(FakeHttp()).due_items(), [])

    def test_skips_and_reports_an_item_far_in_the_past(self):
        a = self.make(FakeHttp(desired_state(schedule=[self.item(T0 - timedelta(minutes=10))])))
        a.sync_once()
        self.assertEqual(a.due_items(), [])
        self.assertEqual(len(a.outbox), 1)
        self.assertFalse(a.outbox[0]["ok"])
        self.assertIn("late", a.outbox[0]["error"])

    def test_play_runs_sound_then_speech_on_the_alarm_stream(self):
        a = self.make(FakeHttp(desired_state(settings={"language": "zh", "volumes": {},
                                                        "quietWindows": []})))
        a.sync_once()
        ok, err = a.play(self.item(T0))
        self.assertTrue(ok, err)
        self.assertEqual(len(self.runner.named("termux-media-player")), 1)
        tts = self.runner.named("termux-tts-speak")[0]
        self.assertEqual(tts[:5], ["termux-tts-speak", "-s", "ALARM", "-l", "zh"])
        self.assertEqual(tts[-1], "Good morning")

    def test_missing_sound_file_falls_back_to_the_builtin_tone(self):
        a = self.make(FakeHttp())
        path = a.playable_sound("chime")
        with open(path, "rb") as f:
            self.assertEqual(f.read(), agent.render_builtin("chime"))
        self.assertIsNone(a.playable_sound("none"))

    def test_announcements_play_once_and_never_after_expiry(self):
        fresh = {"id": "announcement:1", "sound": "none", "text": "Dinner",
                 "expiresAt": agent.iso(T0 + timedelta(minutes=2))}
        stale = {"id": "announcement:2", "sound": "none", "text": "Old",
                 "expiresAt": agent.iso(T0 - timedelta(seconds=1))}
        a = self.make(FakeHttp(desired_state(announcements=[fresh, stale])))
        a.sync_once()
        a.sync_once()
        self.assertEqual(a.play_queue.qsize(), 1)
        self.assertEqual(a.play_queue.get()["id"], "announcement:1")


class TestSounds(AgentTestCase):
    def test_downloads_verified_sounds_and_refuses_a_bad_checksum(self):
        good = agent.render_builtin("beeps")
        sounds = [
            {"name": "beeps", "url": "/s/beeps", "sha256": hashlib.sha256(good).hexdigest()},
            {"name": "chime", "url": "/s/chime", "sha256": "0" * 64},
        ]
        a = self.make(FakeHttp(desired_state(sounds=sounds),
                               files={"/s/beeps": good, "/s/chime": b"tampered"}))
        a.sync_once()
        self.assertTrue(os.path.exists(a.sound_path("beeps")))
        self.assertFalse(os.path.exists(a.sound_path("chime")))
        self.assertTrue(any("chime refused" in e for e in a.errors))

    def test_builtin_sounds_are_deterministic_and_timed(self):
        self.assertEqual(agent.render_builtin("beeps"), agent.render_builtin("beeps"))
        a = self.make(FakeHttp())
        self.assertAlmostEqual(agent.wav_seconds(a.playable_sound("beeps")), 1.35, places=2)


class TestUpdate(AgentTestCase):
    def setUp(self):
        super().setUp()
        self.self_path = os.path.join(self.tmp.name, "agent.py")
        with open(self.self_path, "w") as f:
            f.write('VERSION = "1.0.0"\n')
        self.new_code = b'VERSION = "1.1.0"\n'
        self.pin = {"version": "1.1.0", "url": "/api/v1/agent/releases/1.1.0",
                    "sha256": hashlib.sha256(self.new_code).hexdigest()}

    def test_applies_a_verified_release_and_keeps_the_previous_one(self):
        self.runner.check_out = "1.1.0"
        a = self.make(FakeHttp(desired_state(agent=self.pin),
                               files={self.pin["url"]: self.new_code}), self_path=self.self_path)
        a.sync_once()
        self.assertTrue(a.restarted)
        with open(self.self_path, "rb") as f:
            self.assertEqual(f.read(), self.new_code)
        self.assertTrue(os.path.exists(self.self_path + ".prev"))

    def test_refuses_a_checksum_mismatch(self):
        a = self.make(FakeHttp(desired_state(agent=self.pin),
                               files={self.pin["url"]: b"tampered"}), self_path=self.self_path)
        a.sync_once()
        self.assertFalse(a.restarted)
        self.assertTrue(any("sha256 mismatch" in e for e in a.errors))

    def test_refuses_a_release_that_fails_its_self_check_and_remembers_it(self):
        self.runner.check_rc = 1
        http = FakeHttp(desired_state(agent=self.pin), files={self.pin["url"]: self.new_code})
        a = self.make(http, self_path=self.self_path)
        a.sync_once()
        self.assertFalse(a.restarted)
        self.assertIn("1.1.0", a.bad_versions)
        self.assertFalse(os.path.exists(self.self_path + ".new"))
        # No retry loop on the next sync.
        calls = len(self.runner.calls)
        a.sync_once()
        self.assertFalse(any(len(c) >= 3 and c[2] == "--check" for c in self.runner.calls[calls:]))

    def test_rollback_marker_from_run_sh_blocks_that_version(self):
        os.makedirs(self.home, exist_ok=True)
        with open(os.path.join(self.home, agent.ROLLED_BACK_MARK), "w") as f:
            f.write("1.1.0")
        self.runner.check_out = "1.1.0"
        http = FakeHttp(desired_state(agent=self.pin), files={self.pin["url"]: self.new_code})
        a = self.make(http, self_path=self.self_path)
        self.assertIn("1.1.0", a.bad_versions)
        a.sync_once()
        self.assertFalse(a.restarted)
        # The rollback is reported to the cluster in the next sync.
        self.assertTrue(any("rolled back from 1.1.0" in e for e in http.reports[0]["errors"]))


class TestQuietHours(AgentTestCase):
    def test_update_message_is_held_back_in_quiet_hours(self):
        windows = [{"start": agent.iso(T0 - timedelta(hours=1)),
                    "end": agent.iso(T0 + timedelta(hours=1))}]
        a = self.make(FakeHttp(desired_state(settings={"language": "en", "volumes": {},
                                                        "quietWindows": windows})))
        a.sync_once()
        self.assertTrue(a.in_quiet_hours())
        with open(os.path.join(self.home, agent.UPDATED_MARK), "w") as f:
            f.write("0.9.0")
        a.announce_update()
        self.assertEqual(a.play_queue.qsize(), 0)


class TestCli(unittest.TestCase):
    def test_check_prints_the_version(self):
        import io
        from contextlib import redirect_stdout
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(agent.main(["--check"]), 0)
        self.assertEqual(buf.getvalue().strip(), agent.VERSION)

    def test_release_file_matches_the_source(self):
        """A release must exist for VERSION and match agent.py (run tools/release.py)."""
        release = os.path.join(HERE, "releases", f"agent-{agent.VERSION}.py")
        with open(os.path.join(HERE, "agent.py"), "rb") as a, open(release, "rb") as r:
            self.assertEqual(a.read(), r.read())

    def test_served_sounds_match_the_builtin_fallback(self):
        for name in ("beeps", "chime"):
            with open(os.path.join(HERE, "sounds", f"{name}.wav"), "rb") as f:
                self.assertEqual(f.read(), agent.render_builtin(name))


if __name__ == "__main__":
    unittest.main()
