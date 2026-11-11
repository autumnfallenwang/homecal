#!/usr/bin/env python3
"""HomeCal speaker agent (Phase 24) — runs in Termux on an old Android phone.

The phone is a managed homecal device. It opens every connection itself (no
listener): every poll it POSTs a report to /api/v1/agent/sync and gets back its
desired state — volumes, quiet hours, the wake-ups and reminders to ring at exact
instants, one-off announcements, and the agent version it should run.

It keeps the last desired state on disk and rings scheduled items from it, so
wake-ups still fire with the cluster down. What it played goes into an outbox
that is retried until the cluster acknowledges it.

Files (all under ~/.config/homecal-speaker/ unless noted):
  config.json   {"server": "http://homecal-api.arch.internal"}
  key           the device's hc_ key (mode 600)
  state.json    last desired state
  outbox.json   rang reports not yet acknowledged
  fired.json    ids already played, so nothing rings twice
  bad_versions.json   versions that crashed on start and were rolled back
  agent.log     timestamped heartbeat log (rotated at 256 KB)
  ~/.cache/homecal-speaker/   downloaded sounds

Standard library only. `python agent.py --check` prints the version and exits;
the updater runs a new release that way before swapping it in.
"""

import hashlib
import io
import json
import math
import os
import queue
import shutil
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import wave
from datetime import datetime, timezone

VERSION = "1.0.0"
SCHEMA_VERSION = 1

CONFIG_DIR = os.path.expanduser(os.environ.get("HOMECAL_SPEAKER_HOME", "~/.config/homecal-speaker"))
CACHE_DIR = os.path.expanduser(os.environ.get("HOMECAL_SPEAKER_CACHE", "~/.cache/homecal-speaker"))

#: Scheduled items more than this late are skipped (the phone was off, say).
LATE_GRACE_S = 120
#: How long ids stay in fired.json.
FIRED_KEEP_S = 3 * 24 * 3600
MIN_POLL_S, MAX_POLL_S, OFFLINE_POLL_S = 2, 300, 60
STATUS_EVERY_S = 55
VOLUME_REAPPLY_S = 600
LOG_MAX_BYTES = 256 * 1024
UPDATED_MARK = "updated_from"
ROLLED_BACK_MARK = "rolled_back"


def utcnow():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def parse_iso(s):
    # fromisoformat accepts a trailing Z from Python 3.11.
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ─── Built-in sounds ──────────────────────────────────────────────────────────
# Generated on the phone, so a wake-up has a sound even if no file ever
# downloaded. tools/make_sounds.py writes the same bytes into sounds/ for the
# cluster to serve.

def _tone(freq, seconds, rate=22050, amp=12000):
    n = int(rate * seconds)
    fade = int(rate * 0.01)
    out = []
    for i in range(n):
        env = min(1.0, i / fade, (n - i) / fade) if fade else 1.0
        out.append(int(amp * env * math.sin(2 * math.pi * freq * i / rate)))
    return out


def _silence(seconds, rate=22050):
    return [0] * int(rate * seconds)


def render_builtin(name, rate=22050):
    """WAV bytes for a built-in sound: "beeps" (3 × 880 Hz) or "chime" (two-tone)."""
    if name == "chime":
        samples = _tone(660, 0.35, rate) + _silence(0.05, rate) + _tone(880, 0.6, rate)
    else:
        samples = []
        for _ in range(3):
            samples += _tone(880, 0.25, rate) + _silence(0.2, rate)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return buf.getvalue()


def wav_seconds(path):
    try:
        with wave.open(path, "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except (wave.Error, OSError, EOFError):
        return 3.0


# ─── Small persistence helpers ────────────────────────────────────────────────

def read_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, value):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(value, f)
    os.replace(tmp, path)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def run_cmd(cmd, timeout=90):
    """Run a Termux command; never raises (a missing command is a result)."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {"rc": r.returncode, "out": r.stdout.strip(), "err": r.stderr.strip()}
    except (OSError, subprocess.SubprocessError) as ex:
        return {"rc": 127, "out": "", "err": repr(ex)}


class Http:
    """Tiny JSON-over-HTTP client. The device key rides in x-api-key."""

    def __init__(self, server, key, timeout=20):
        self.server = server.rstrip("/")
        self.key = key
        self.timeout = timeout

    def _url(self, path):
        return path if path.startswith("http") else self.server + path

    def post_json(self, path, body):
        req = urllib.request.Request(
            self._url(path),
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "x-api-key": self.key},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.load(r)

    def get_bytes(self, path):
        req = urllib.request.Request(self._url(path), headers={"x-api-key": self.key})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()


class Agent:
    def __init__(self, http, home=CONFIG_DIR, cache=CACHE_DIR, runner=run_cmd, clock=utcnow,
                 self_path=None, executable=None, sleep=time.sleep):
        self.http = http
        self.home = home
        self.cache = cache
        self.run = runner
        self.clock = clock
        self.sleep = sleep
        self.self_path = self_path or os.path.abspath(__file__)
        self.executable = executable or sys.executable
        os.makedirs(home, exist_ok=True)
        os.makedirs(cache, exist_ok=True)
        self.lock = threading.Lock()
        self.state = read_json(self._p("state.json"), None)
        self.outbox = read_json(self._p("outbox.json"), [])
        self.fired = read_json(self._p("fired.json"), {})
        self.bad_versions = set(read_json(self._p("bad_versions.json"), []))
        self.errors = []
        self.play_queue = queue.Queue()
        self.started = time.time()
        self._status_cache = (0.0, {})
        self._applied_volumes = (None, 0.0)
        self._note_restart()

    # ── paths / logging ──
    def _p(self, name):
        return os.path.join(self.home, name)

    def log(self, msg):
        line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} v{VERSION} {msg}"
        print(f"[homecal-speaker] {line}", flush=True)
        path = self._p("agent.log")
        try:
            if os.path.exists(path) and os.path.getsize(path) > LOG_MAX_BYTES:
                os.replace(path, path + ".1")
            with open(path, "a") as f:
                f.write(line + "\n")
        except OSError:
            pass

    def _note_error(self, msg):
        self.log(f"ERROR {msg}")
        self.errors = (self.errors + [f"{iso(self.clock())} {msg}"])[-10:]

    def _note_restart(self):
        rolled = self._p(ROLLED_BACK_MARK)
        if os.path.exists(rolled):
            with open(rolled) as f:
                bad = f.read().strip()
            os.remove(rolled)
            if bad:
                self.bad_versions.add(bad)
                write_json(self._p("bad_versions.json"), sorted(self.bad_versions))
            self._note_error(f"rolled back from {bad or 'a new version'}: it kept crashing on start")

    # ── status ──
    def collect_status(self):
        now = time.time()
        cached_at, cached = self._status_cache
        if now - cached_at < STATUS_EVERY_S and cached:
            return cached
        status = {"uptimeS": int(now - self.started), "phoneTime": datetime.now().astimezone().isoformat()}
        b = self.run(["termux-battery-status"], timeout=20)
        try:
            bj = json.loads(b["out"]) if b["rc"] == 0 else {}
            status["battery"] = bj.get("percentage")
            status["charging"] = bj.get("plugged", "UNPLUGGED") != "UNPLUGGED"
            status["temperatureC"] = bj.get("temperature")
        except ValueError:
            pass
        w = self.run(["termux-wifi-connectioninfo"], timeout=20)
        try:
            rssi = json.loads(w["out"]).get("rssi") if w["rc"] == 0 else None
            if isinstance(rssi, int) and -127 <= rssi <= 0:
                status["wifiRssi"] = rssi
        except ValueError:
            pass
        v = self.run(["termux-volume"], timeout=20)
        try:
            vols = {x["stream"]: x["volume"] for x in json.loads(v["out"])} if v["rc"] == 0 else {}
            status["volumes"] = {"alarm": vols.get("alarm"), "music": vols.get("music")}
        except (ValueError, KeyError, TypeError):
            pass
        self._status_cache = (now, status)
        return status

    # ── sync ──
    def build_report(self):
        with self.lock:
            rang = list(self.outbox)[-200:]
        return {
            "schemaVersion": SCHEMA_VERSION,
            "agentVersion": VERSION,
            "status": self.collect_status(),
            "rang": rang,
            "errors": list(self.errors),
        }

    def sync_once(self):
        """One sync. Returns seconds until the next one."""
        report = self.build_report()
        try:
            desired = self.http.post_json("/api/v1/agent/sync", report)
        except (urllib.error.URLError, OSError, ValueError) as ex:
            self.log(f"sync failed: {ex!r}; ringing from cached state")
            return OFFLINE_POLL_S
        self.errors = []
        self.apply_desired(desired)
        poll = max(MIN_POLL_S, min(MAX_POLL_S, desired.get("nextPollAfterMs", 60000) / 1000))
        self.log(
            f"sync ok items={len(desired.get('schedule', []))} "
            f"announcements={len(desired.get('announcements', []))} next={poll:.0f}s"
        )
        return poll

    def apply_desired(self, desired):
        acked = set(desired.get("ack", []))
        with self.lock:
            self.state = desired
            write_json(self._p("state.json"), desired)
            if acked:
                self.outbox = [r for r in self.outbox if r["id"] not in acked]
                write_json(self._p("outbox.json"), self.outbox)
        self.apply_volumes(desired.get("settings", {}).get("volumes"))
        self.ensure_sounds(desired.get("sounds", []))
        for a in desired.get("announcements", []):
            self.offer_announcement(a)
        agent = desired.get("agent")
        if agent and agent.get("version") != VERSION:
            self.maybe_update(agent)

    def apply_volumes(self, volumes):
        if not volumes:
            return
        last, at = self._applied_volumes
        if last == volumes and time.time() - at < VOLUME_REAPPLY_S:
            return
        for stream in ("alarm", "music"):
            if stream in volumes:
                self.run(["termux-volume", stream, str(int(volumes[stream]))], timeout=20)
        self._applied_volumes = (dict(volumes), time.time())

    # ── sounds ──
    def sound_path(self, name):
        return os.path.join(self.cache, f"{name}.wav")

    def ensure_sounds(self, sounds):
        for s in sounds:
            path = self.sound_path(s["name"])
            try:
                with open(path, "rb") as f:
                    if sha256_bytes(f.read()) == s["sha256"]:
                        continue
            except OSError:
                pass
            try:
                data = self.http.get_bytes(s["url"])
            except (urllib.error.URLError, OSError) as ex:
                self.log(f"sound {s['name']} download failed: {ex!r}")
                continue
            if sha256_bytes(data) != s["sha256"]:
                self._note_error(f"sound {s['name']} refused: sha256 mismatch")
                continue
            with open(path + ".tmp", "wb") as f:
                f.write(data)
            os.replace(path + ".tmp", path)

    def playable_sound(self, name):
        """A file for the sound, falling back to the built-in tone if needed."""
        if name == "none":
            return None
        path = self.sound_path(name)
        if not os.path.exists(path):
            fallback = os.path.join(self.cache, f"builtin-{name}.wav")
            if not os.path.exists(fallback):
                with open(fallback, "wb") as f:
                    f.write(render_builtin(name))
            return fallback
        return path

    # ── playing ──
    def offer_announcement(self, a):
        if a["id"] in self.fired:
            return
        try:
            if parse_iso(a["expiresAt"]) < self.clock():
                return
        except (KeyError, ValueError):
            return
        self.mark_fired(a["id"])
        self.play_queue.put(a)

    def mark_fired(self, item_id):
        with self.lock:
            self.fired[item_id] = iso(self.clock())
            cutoff = self.clock().timestamp() - FIRED_KEEP_S
            self.fired = {k: v for k, v in self.fired.items() if parse_iso(v).timestamp() >= cutoff}
            write_json(self._p("fired.json"), self.fired)

    def due_items(self):
        """Scheduled items due now and not played yet; marks them fired."""
        now = self.clock()
        with self.lock:
            schedule = list((self.state or {}).get("schedule", []))
        due = []
        for item in schedule:
            if item["id"] in self.fired:
                continue
            try:
                at = parse_iso(item["at"])
            except (KeyError, ValueError):
                continue
            lateness = (now - at).total_seconds()
            if 0 <= lateness <= LATE_GRACE_S:
                due.append(item)
            elif lateness > LATE_GRACE_S:
                # Too late to be useful (the phone was off). Report it as missed once.
                self.mark_fired(item["id"])
                self.record_rang(item["id"], ok=False, error=f"skipped, {int(lateness)}s late")
        for item in due:
            self.mark_fired(item["id"])
        return due

    def language(self):
        return ((self.state or {}).get("settings") or {}).get("language", "en")

    def play(self, item):
        """Sound, then speech. Returns (ok, error)."""
        sound = self.playable_sound(item.get("sound", "beeps"))
        if sound:
            r = self.run(["termux-media-player", "play", sound], timeout=30)
            if r["rc"] != 0:
                return False, f"media player rc={r['rc']} {r['err'][:200]}"
            self.sleep(wav_seconds(sound) + 0.4)
        text = (item.get("text") or "").strip()
        if text:
            r = self.run(["termux-tts-speak", "-s", "ALARM", "-l", self.language(), text], timeout=120)
            if r["rc"] != 0:
                return False, f"tts rc={r['rc']} {r['err'][:200]}"
        return True, None

    def record_rang(self, item_id, ok, error=None):
        entry = {"id": item_id, "at": iso(self.clock()), "ok": bool(ok)}
        if error:
            entry["error"] = error[:500]
        with self.lock:
            self.outbox.append(entry)
            self.outbox = self.outbox[-500:]
            write_json(self._p("outbox.json"), self.outbox)

    def player_loop(self):
        while True:
            item = self.play_queue.get()
            try:
                ok, err = self.play(item)
            except Exception as ex:  # noqa: BLE001 — keep the player alive
                ok, err = False, repr(ex)
            self.log(f"played {item['id']} ok={ok}{' ' + err if err else ''}")
            self.record_rang(item["id"], ok, err)

    def scheduler_loop(self):
        while True:
            try:
                for item in self.due_items():
                    self.play_queue.put(item)
            except Exception as ex:  # noqa: BLE001
                self.log(f"scheduler error {ex!r}")
            self.sleep(1)

    # ── quiet hours (only for the agent's own messages; the cluster filters the rest) ──
    def in_quiet_hours(self):
        now = self.clock()
        windows = ((self.state or {}).get("settings") or {}).get("quietWindows", [])
        for w in windows:
            try:
                if parse_iso(w["start"]) <= now < parse_iso(w["end"]):
                    return True
            except (KeyError, ValueError):
                continue
        return False

    # ── self-update ──
    def maybe_update(self, agent):
        version = agent["version"]
        if version in self.bad_versions:
            return
        try:
            code = self.http.get_bytes(agent["url"])
        except (urllib.error.URLError, OSError) as ex:
            self.log(f"update {version} download failed: {ex!r}")
            return
        if sha256_bytes(code) != agent["sha256"]:
            self._note_error(f"update {version} refused: sha256 mismatch")
            return
        new = self.self_path + ".new"
        with open(new, "wb") as f:
            f.write(code)
        chk = self.run([self.executable, new, "--check"], timeout=60)
        if chk["rc"] != 0 or chk["out"].strip() != version:
            os.remove(new)
            why = (chk["err"].splitlines() or [f"reports {chk['out'].strip()!r}"])[-1]
            self._note_error(f"update {version} refused: self-check failed: {why}")
            self.bad_versions.add(version)
            write_json(self._p("bad_versions.json"), sorted(self.bad_versions))
            return
        shutil.copy2(self.self_path, self.self_path + ".prev")
        os.replace(new, self.self_path)
        with open(self._p(UPDATED_MARK), "w") as f:
            f.write(VERSION)
        self.log(f"applied {version}, restarting")
        self.restart()

    def restart(self):
        os.execv(self.executable, [self.executable, self.self_path])

    def announce_update(self):
        mark = self._p(UPDATED_MARK)
        if not os.path.exists(mark):
            return
        with open(mark) as f:
            old = f.read().strip()
        os.remove(mark)
        self.log(f"started after update from {old}")
        if not self.in_quiet_hours():
            self.play_queue.put({"id": f"update:{VERSION}", "sound": "none",
                                 "text": f"Speaker updated to version {VERSION}"})

    # ── main ──
    def serve_forever(self):
        self.log(f"starting pid {os.getpid()} server {self.http.server}")
        threading.Thread(target=self.player_loop, daemon=True).start()
        threading.Thread(target=self.scheduler_loop, daemon=True).start()
        self.announce_update()
        while True:
            try:
                wait = self.sync_once()
            except Exception as ex:  # noqa: BLE001 — never let the sync loop die
                self._note_error(f"sync loop error {ex!r}")
                wait = OFFLINE_POLL_S
            self.sleep(wait)


def load_config(home=CONFIG_DIR):
    cfg = read_json(os.path.join(home, "config.json"), {})
    server = os.environ.get("HOMECAL_SPEAKER_SERVER") or cfg.get("server")
    try:
        with open(os.path.join(home, "key")) as f:
            key = f.read().strip()
    except OSError:
        key = ""
    return server, key


def main(argv):
    if "--check" in argv:
        print(VERSION)
        return 0
    server, key = load_config()
    if not server or not key:
        print("[homecal-speaker] missing server or key in ~/.config/homecal-speaker", flush=True)
        return 2
    Agent(Http(server, key)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
