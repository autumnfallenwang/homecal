# Wake-up speaker POC — old Android phone as a k3s-controlled speaker

**Status:** POC passed 2026-10-12 on two phones. **The Xiaomi Mi 8 is the chosen speaker**; the Redmi K40 was reverted to normal use. Over-Wi-Fi maintenance (SSH, agent self-update, start at boot) is also proven on the Mi 8. Nothing is built into homecal yet; this memo is the record of the POC and the input to that design. **Re-run 2026-11-10 (Part 3):** the audio side still works, but the agent had died unnoticed about four weeks earlier. **Built the same day (Part 4):** homecal Phases 23–26 and agent v1.0.0, verified end to end on the Mi 8 against the dev API; not deployed yet.

**Goal:** a speaker in the kids' room that the home k3s cluster can control over the LAN: play a sound, speak a message, hold the daily wake-up alarm. Same idea as the Kindle wall dashboard (Phase 22): the device stays simple and the cluster does the thinking. No vendor cloud assistant in the loop.

## TL;DR

- An Amazon Echo has **no local API**. Every way to script it goes through Amazon's cloud (unofficial, token = full account access, breaks without notice). Ruled out as the controllable device.
- **Part 1, speaker POC:** an old phone running **Termux + a small Python agent**. With the **screen locked**, the k3s box made it speak, play audio served from the cluster, and fire an **on-device scheduled wake-up** (beeps + spoken message). Passed on the Redmi K40 and again on the Mi 8, all confirmed by ear.
- **Part 2, no USB after setup (Mi 8):** Termux:Boot starts SSH (key only) and the agent after a reboot. The agent **pulls new versions from the cluster on its own**, checks the sha256, test-runs the new file, then swaps itself in place. A tampered and a broken release were both refused.
- **Part 3, re-run 2026-11-10:** the agent had been **dead for about four weeks**. MIUI killed Termux (no reboot), most likely within hours of the POC, and nothing restarted it or noticed. After a hand restart, speak / play / scheduled wake-up passed again with the screen asleep. **Keeping the agent alive, and alerting when it isn't, is now the main design problem** (Findings 19–22).
- **Xiaomi gotchas:** autostart must be switched on in **MIUI's own app settings** for Termux, Termux:API and Termux:Boot. Tweaks made over adb work until the next reboot, then MIUI resets them (Findings 12–13). With a **screen-lock PIN**, nothing starts after a reboot until someone unlocks the phone (Finding 15).
- Packages are installed from a **copy of the official Termux repo served by the k3s box**, not from a random internet mirror. The phone still checks Termux's signature (Finding 16).
- Recommended home: **homecal** (a new `speaker` reminder channel, plus Devices / Wake-ups / Say-now UI). Copy the **agent protocol from homeparentcontrol's design** (desired-state polling). Don't create a new home* app.

## Options evaluated

Prices as of Oct 2026.

| Option | Local API | Device-held alarms | Verdict |
|---|---|---|---|
| **Amazon Echo** (already bought) | None. Unofficial cloud APIs only (`alexa-remote2`, `alexa-remote-control`, `alexapy`/Alexa Media Player), via Amazon login cookie | Yes (voice / app) | ❌ Not controllable from the LAN. Fine as a plain voice alarm clock |
| **Google Nest Mini** (~$20–30 used, discontinued) / Google Home Speaker ($99, Gemini) | Google Cast on LAN (`pychromecast`, `catt`, `go-chromecast`): "play this URL" | Voice only, no API | ⚠️ Needs a Google account, and **needs internet to play** (the Cast receiver app loads from Google). **Ignores DHCP DNS** (uses 8.8.8.8), so `*.arch.internal` media URLs fail and must use IPs |
| **Sonos** (~$200) | Unofficial UPnP/SOAP on :1400 (`SoCo`, `node-sonos-http-api`) | Yes (built-in alarms) | ⚠️ Good hardware, but Sonos is moving control to a partner-only API |
| **WiiM / LinkPlay** streamer + powered speaker | `https://<ip>/httpapi.asp?command=…` | No | ⚠️ Self-signed TLS, streamer only |
| **Home Assistant Voice PE** (~$59) / ESPHome boards | ESPHome native API (`aioesphomeapi`), no HA required | Yes (`on_time`) | ✅ Open firmware, no soldering, small built-in speaker plus 3.5 mm out |
| **Squeezebox Radio** (used ~$50–100) + Lyrion Music Server in k3s | Lyrion JSON-RPC | Yes, **with an on-device fallback tone** if the server is down | ✅ Closest to the Kindle idea. Wi-Fi is 2.4 GHz / WPA2 only |
| **Raspberry Pi 4 1GB** + powered speaker | Whatever we write | Yes | ✅ ~$70–90 all-in (~$45 reusing parts). Pi 4 2GB went to **$67.50** on 2026-10-01 (Pi 5 2GB $77.50), 1GB models unchanged. Pi 5 has **no 3.5 mm jack**. Headless setup via Raspberry Pi Imager, no monitor or soldering |
| **Old Android phone** (Termux) | Whatever we write | Yes (agent-held, see Findings 5) | ✅ **$0, chosen.** Speaker, Wi-Fi, a battery that rides out power cuts |

## Devices under test

Read over adb on 2026-10-12, before any changes.

| | Redmi K40 (Part 1 only, reverted) | **Mi 8 (chosen)** |
|---|---|---|
| Model | China model `M2012K11AC` (codename `alioth`) | `MI 8` (codename `dipper`), China ROM (`ro.miui.region=CN`), adb serial `34a28e5a` |
| OS | Android 13 (SDK 33), **HyperOS 1.0** `OS1.0.10.0.TKHCNXM`, locale `zh-CN` | Android 10 (SDK 29), **MIUI 12.5** `V12.5.2.0.QEACNXM` |
| Security patch | 2024-03-01, no longer updated | **2020-12-01**, no longer updated |
| Boot | Bootloader locked, verified boot green (stock, **no root needed**) | Same |
| Battery | health GOOD (cycle count needs root) | health GOOD. Charge counter ~2.8 Ah at 100 % vs 3.4 Ah new, so **roughly 80 % capacity**. 30 °C on the charger |
| Network | `192.168.1.173` on `Verizon_AW`, RSSI −51 dBm. Randomized per-network MAC | `192.168.1.245` on `Verizon_AW_5G` (5260 MHz), **RSSI −72 dBm (weak-ish)**. MAC `92:13:6d:01:76:47` is randomized (locally administered bit set) |
| DNS | `homecal.arch.internal` → `192.168.1.163` resolves on-device ✅ | Not checked; the agent used IPs |
| Volumes (speaker) | music 0/**150** and muted, alarm 5/15, phone in silent mode | music 5/15, alarm 7/15, nothing muted |
| Screen lock | Not checked | **PIN set** (Finding 15) |
| Wireless debugging | Yes (Android 11+) | **No toggle** (Android 10, Finding 11) |
| State | **Not factory reset**. Old apps and personal data present, load avg ~3 when idle | **Not factory reset**. 79 user-installed apps, 14 GB free of 111 GB |

## Part 1 — speaker POC

### Rig

```
aaron-desktop-arch (192.168.1.163, also the k3s node)
  └─ python -m http.server :8765   (temporary)  serves poc.sh, agent.py, beep.wav
                │  phone pulls bootstrap + audio
                ▼
Phone (Redmi 192.168.1.173, later Mi 8 192.168.1.245)
  Termux 0.118.3 + Termux:API 0.53.0 (F-Droid)
  └─ agent.py  :8080  (POC: no auth, binds 0.0.0.0), started by hand in the Termux foreground
       ├─ termux-tts-speak -s ALARM   speech
       ├─ termux-media-player         audio files / URLs (downloaded first)
       ├─ termux-volume               stream volumes
       ├─ am start SET_ALARM          Clock-app alarm (screen-on only, see Findings 4)
       └─ scheduler thread            on-device daily schedule, ~/.config/poc-agent/
```

### Agent API

| Endpoint | Does |
|---|---|
| `GET /status` | Phone local time (with TZ) and battery JSON. From v0.2.0 also `version`, `pid`, `uptime_s` and the last update-log lines |
| `GET /say?text=…[&stream=ALARM\|MUSIC\|NOTIFICATION]` | Speak via Android TTS. Default **ALARM** stream |
| `GET /play?url=…` | Download the URL, then play it (music stream) |
| `GET /volume?stream=music\|alarm\|notification&level=N` | Set a stream volume. Ranges are device-specific: Redmi music is **0–150**, Mi 8 music 0–15; alarm 1–15 on both |
| `GET /alarm?hour=&minute=&message=[&days=2,3,4,5,6]` | Create a real alarm in the Clock app (`SET_ALARM`, `SKIP_UI`) |
| `GET /schedule[?time=HH:MM&text=…&url=…]` | List / add an agent-held daily wake-up (plays `url`, then speaks `text`) |
| `GET /unschedule?id=…` | Remove a schedule entry |
| `GET /fired` | Log of schedule entries that went off |
| `GET /update` | v0.2.0+: check the release manifest now instead of waiting for the next 60 s poll |
| `GET /ping` | v0.3.0 only: the endpoint the fake update added, to prove new code is running |

Full source in Appendix A.

### Results — Redmi K40

All times EDT, 2026-10-12. "Heard" = confirmed by a person in the room.

| Time | Test | Screen | Result |
|---|---|---|---|
| 14:56 | Unknown path (→ 404) from the k3s box | on | ✅ 19 ms round trip |
| 14:57 | `/status` (first Termux:API call) | on | ❌ hung, then ✅ 0.4 s after the autostart fix (Findings 3) |
| 14:57 | `/volume` music 90/150, alarm 10/15 | on | ✅ verified with `cmd media_session volume --get` |
| 14:57 | `/play` beep.wav served from the k3s box | on | ✅ heard |
| 14:57 | `/alarm` → Clock alarm 15:00 | on | ✅ created (`next_alarm_formatted` = 周一下午3:00), **rang at 15:00** |
| 14:58 | `/say` on the default NOTIFICATION stream | on | ❌ silent (phone in silent mode, Findings 6) |
| 15:02 | `/say` on the ALARM stream | **off** | ✅ heard |
| 15:02 | `/play` beep.wav | **off** | ✅ heard |
| 15:02 | `/alarm` | **off** | ❌ `InvocationTargetException`, no alarm created (Findings 4) |
| 15:06→15:09 | `/schedule?time=15:09` (beeps + "Good morning! Time to get up.") | **off** | ✅ fired 15:09:13, **heard**, `/fired` logged `rc=0` |
| 15:13 | adb over Wi-Fi, USB unplugged | off | ✅ adb and agent both still reachable |

### Results — Mi 8 (same agent and bootstrap)

| Time | Test | Screen | Result |
|---|---|---|---|
| 17:22 | `adb install` Termux + Termux:API | on | ✅ first try |
| 17:23 | Autostart op `10008` + battery whitelist over adb **before** first launch | — | ✅ (but see Finding 12: reset at reboot) |
| 17:25–17:34 | `poc.sh` → `pkg install python termux-api` | on | ✅ (`pkg` picked mirror `mirrors.cernet.edu.cn`, Finding 16) |
| 17:35 | `/status` (first Termux:API call) | — | ✅ no hang, thanks to the up-front autostart op |
| 17:35 | `/volume` music 10/15, `/say` ALARM, `/play` beep.wav | **off** | ✅ both heard |
| 17:35→17:39 | `/schedule?time=17:39` (beeps + "Good morning! This is the locked screen test.") | **off** | ✅ fired 17:39:11, **heard**, `rc=0` |

**Conclusion:** with the screen locked, the cluster can make the phone speak and play sounds, and the phone can hold and fire its own wake-up schedule. That covers what the job needs, on both phones.

## Part 2 — Wi-Fi maintenance POC (Mi 8)

Question: Android 10 has no Wireless debugging toggle. Can the Mi 8 still be updated and maintained without USB after the first install?

### Rig

```
aaron-desktop-arch (192.168.1.163)
  └─ python -m http.server :8765  (temporary)
       ├─ setup-boot.sh, run.sh, boot-speaker.sh, home_speaker.pub
       ├─ release/manifest.json  {"version", "url", "sha256"}   ← "publishing" = editing this file
       ├─ release/agent-<version>.py
       └─ termux-main/   partial copy of the official Termux apt repo (Appendix C)
  ~/.ssh/home_speaker_ed25519   key for SSH into the phone

Mi 8 (192.168.1.245), Termux + Termux:API + Termux:Boot 0.8.1 (F-Droid)
  Termux:Boot ─► ~/.termux/boot/10-speaker
                   ├─ termux-wake-lock
                   ├─ sshd :8022       key only (password + keyboard-interactive off)
                   └─ run.sh           restarts the agent if it crashes
                        └─ agent.py :8080
                             ├─ (Part 1 API)
                             └─ updater thread: every 60 s GET manifest
                                  version differs → download → sha256 check →
                                  run new file with --check (must print the manifest version) →
                                  keep agent.py.prev → swap → os.execv (same PID) →
                                  speak "Speaker updated to version X"
```

### Results

| Time | Test | Result |
|---|---|---|
| 19:04 | `setup-boot.sh`: `apt-get` with a local-only source list → openssh from the k3s box's repo copy | ✅ 8 `.deb`s fetched from 192.168.1.163 (the other 9 of 17 were already installed), **nothing from the internet**. apt accepted the signed index |
| 19:05 | Agent v0.2.0 started by the boot script, polling the manifest every 60 s | ✅ |
| 19:06 | USB unplugged. SSH over Wi-Fi with the key | ✅ Password login refused. Keyboard-interactive then switched off over SSH and checked refused |
| 19:07:08 | **Fake update:** manifest → 0.3.0 on the k3s box only, phone not contacted | ✅ Phone polled at 19:07:09, applied at 19:07:10, running 0.3.0 at 19:07:11 with the **same PID** (exec in place). "Speaker updated to version 0.3.0" **heard**. New `/ping` answers. A schedule entry added before the update was kept |
| 19:07:25 | Tampered 0.4.0: manifest sha256 doesn't match the served file (via `/update`) | ✅ Refused (`sha256 mismatch`), stayed on 0.3.0 |
| 19:07:25 | Broken 0.4.0: correct sha256, syntax error in the code | ✅ Refused by `--check` (`SyntaxError: expected ':'`), running agent untouched |
| local | Rollback by pinning 0.2.0 in the manifest | ✅ Local simulation with stubbed Termux commands only, not repeated on the phone |
| 19:08 | **Reboot 1** (unlock after ~1 min) | ❌ Nothing came back. MIUI had reset the adb-set autostart op; `am_broadcast_discard_app … BOOT_COMPLETED … com.termux.boot/.BootReceiver` at 19:10:17 (Finding 12) |
| ~19:22 | **Reboot 2**, after Autostart + Battery saver for Termux:Boot were set in MIUI's settings | ❌ Termux:Boot ran, but MIUI blocked it from starting Termux: `MIUILOG-AutoStart … Reject caller= com.termux.boot callee= com.termux … TermuxService` (Finding 13) |
| 19:27:46 | **Reboot 3**, after Autostart + Battery saver were also set for Termux and Termux:API | ✅ Unlock 19:31:40 → BOOT_COMPLETED dispatched 19:32:02 → `10-speaker` ran 19:32:25 → agent **v0.3.0** and sshd up 19:32:33, with nobody opening Termux. `/say` after reboot `rc=0` (Termux:API works); SSH works |

**Conclusion:** after a one-time USB setup, the Mi 8 needs no cable. Agent code updates arrive by itself pulling from the cluster, with bad releases refused before anything is swapped. Packages and debugging go over SSH. Everything comes back after a reboot, as long as MIUI's autostart switches are on and the phone gets unlocked once (or has no PIN).

## Part 3 — Re-run after four weeks (2026-11-10)

Question: four weeks after the POC, with nobody touching the Mi 8, is it still a working speaker?

**No.** The phone sat on the charger the whole time and never rebooted, but nothing in Termux was running. Any wake-up scheduled in those four weeks would have been missed, and nothing would have told anyone.

### What was found

| Check | Result |
|---|---|
| Ping, ARP | ✅ `192.168.1.245`, MAC `92:13:6d:01:76:47`, still the Mi 8 |
| Agent `:8080`, sshd `:8022` | ❌ connection refused |
| adb (USB, enumerates as `18d1:4ee7`) | `unauthorized` until the phone was unlocked, then authorized |
| `uptime` | `up 28 days, 16:05`: **no reboot** since reboot 3 (2026-10-12 19:27 EDT) |
| Termux processes | **none** (`ps -A \| grep termux` empty) |
| MIUI autostart op `10008` | still `allow` on all three apps |
| Battery | 100 %, on AC the whole time |
| logcat | oldest `events` entry 2026-11-09 08:11, too recent to show the kill |
| `~/speaker/agent.log` (read over SSH after the restart) | last line `2026-10-12 20:06:04` (a router probe). **No `agent exited … restarting` line** from `run.sh` |

`run.sh` died together with the agent, so the whole Termux app was killed; the agent didn't crash (Finding 19). The log can't pin the time, because a healthy idle agent writes nothing (Finding 22). It also has no `update check failed` lines, which the agent writes every 60 s once the update server is unreachable. So it was most likely killed before the October temporary server went away, i.e. the same evening. Unproven.

### Recovery

1. Unlock the phone (the PIN is still on). adb became authorized.
2. `adb shell am start -n com.termux/.app.TermuxActivity`. `adb shell input text` is still refused (`INJECT_EVENTS`, Finding 2).
3. Typed in Termux by hand: `sh ~/.termux/boot/10-speaker`. The agent answered `/status` 27 s later.

There is no remote way back once Termux is dead (Finding 20).

### Results

All times EST (DST ended 2026-11-01). Screen asleep for every test (`mWakefulness=Asleep`), phone on the charger. `beep.wav` was regenerated for this run (three 880 Hz beeps, Python `wave`) and served by a temporary `http.server` on `192.168.1.163:8765`. "Heard" = confirmed by a person in the room.

| Time | Test | Result |
|---|---|---|
| 10:36:24 | `/status` | ✅ v0.3.0, `2026-11-10 10:36:24 EST` (DST change handled), battery 100 % FULL, 26 °C. Update log from October intact |
| 10:36 | Read volumes (`termux-volume` over SSH) | music **2/15** (the POC left it at 10, Finding 21), alarm 7/15, nothing muted |
| 10:37:34 | `/volume` music 10 | ✅ 0.1 s |
| 10:37:34 | `/say` on ALARM | ✅ **heard**. Reply after 8.0 s (the agent answers when TTS finishes) |
| 10:37:42 | `/play` beep.wav from the k3s box | ✅ **heard**, 0.2 s |
| 10:37:47→10:40 | `/schedule?time=10:40` (beeps + "Good morning! This is the scheduled wake-up test.") | ✅ fired: beep fetched 10:40:14, `/fired` logged 10:40:20 `rc=0`. Not confirmed by ear |
| 10:36 | SSH `:8022` with the key | ✅ The host key wasn't in aaron-desktop-arch's `known_hosts`; accepted on first use (ED25519 `SHA256:uaxyc48O1TUQg2U8zIYHbGyn3ZQEBV7b5SODONeM03g`) |
| 10:33 | Wi-Fi | `Verizon_AW_5G`, 5580 MHz, −72 dBm, same as in October |

Afterwards: the test entry was unscheduled, music set back to 2/15, and the temporary server stopped.

**Conclusion:** the audio side works exactly as in Part 1. What failed is staying alive: MIUI killed Termux, nothing brought it back, and nothing told anyone. That, not audio, is what the build has to solve first.

## Part 4 — v1 agent end to end (2026-11-10)

Phases 23–26 built in homecal (see `docs/design-plan.md`), then run against the real Mi 8. Dev API on aaron-desktop-arch `192.168.1.163:3001` with email disabled (alerts logged instead of sent), web UI on `:3000`, screen asleep, all times EST.

| Time | Step | Result |
|---|---|---|
| 12:01 | Register "Kids' room speaker" on the Devices tab (plays for the test kid) | ✅ key shown once, auto-selected |
| 12:02 | Rotate the key via the API straight into a mode-600 file (kept out of logs) | ✅ old key refused, new key works |
| 12:03:13 | `tools/install.sh 192.168.1.245 http://192.168.1.163:3001 <key-file>` | ✅ POC agent stopped, v1.0.0 started under the new `run.sh`, first sync OK, watchdog job 4201 registered (15 min, persisted) |
| 12:03:16 | Status in the cluster | ✅ online, 100 % charging, −76 dBm, v1.0.0; volumes set to alarm 10 / music 8 on the next sync |
| 12:03:52 | Say now from the drawer | ✅ played, `ok=True`. Arrived 21 s later because the phone was still on its 60 s cadence when the drawer opened; afterwards it polled every 5 s |
| 12:05 | Wake-up "Good morning Carol! Time to get up." at 12:08, weekdays, made in the UI | ✅ on the phone within seconds; **no Nov 11 occurrence** (Veterans Day, holiday skip); briefing updated to "Today: Piano practice at 12:25 PM." once that event existed |
| 12:08:00 | Wake-up | ✅ rang on time (log 12:08:11 after beeps + speech), `routine_runs` ok, shown as "Rang today 12:08 PM" |
| 12:06 | Event "Piano practice" 12:25 with a 15-min **Speaker** reminder (email off), made in the event dialog | ✅ one speaker-channel row; on the phone as "Piano practice starts in 15 minutes." |
| 12:10:00 | Speaker reminder | ✅ rang (log 12:10:06), row stamped sent at the next sync |
| 12:11 | Self-update: a temporary `agent-1.0.1.py` bundled, API restarted | ✅ applied 12:11:26, **same PID** (exec in place), `agent.py.prev` kept, spoke "Speaker updated to version 1.0.1" |
| 12:14 | Rollback: pin 1.0.0 in the drawer | ✅ back on 1.0.0 at 12:14:28; temporary release removed and the pin cleared afterwards |
| 12:14:59 | **Watchdog:** `adb shell am force-stop com.termux` (stand-in for MIUI's clean-up) | ✅ stale 12:17:32 → **offline alert 12:19:50** → Android's job scheduler started `TermuxService` at 12:31:43 → boot script brought back sshd, `run.sh` and the agent → **recovery alert 12:31:50**. ~17 min outage, nobody touched the phone |
| 12:33 | Cleanup | ✅ test routine deleted, phone's cached schedule confirmed empty |

**Conclusion:** the liveness gaps from Part 3 are closed in practice. The cluster notices a dead speaker within 5 minutes, and the watchdog restarts a killed Termux within about 15–20 minutes, with no reboot and no hand at the phone. Wake-ups and reminders ring from the phone's own schedule; updates and rollbacks need no cable.

**Still open:** the speaker is not deployed (it points at the dev API until Phases 23–26 ship), and the P6 go-live gate (5 straight days of real wake-ups) hasn't started. During a watchdog gap the phone can't ring; the 30-minute "may not ring" email covers a wake-up that falls inside one.

## Findings

1. **Xiaomi USB debugging is easy to get half-on.** With USB debugging really active the phone enumerates as `2717:ff48` with an adb interface. We first saw `2717:ff40` (MTP only), meaning the toggle hadn't stuck: Xiaomi shows a countdown warning that has to be confirmed. The Mi 8 also showed `ff40` until USB debugging was turned on.
2. **`adb install` → `INSTALL_FAILED_USER_RESTRICTED`** on the Redmi until Developer options → **Install via USB** is on. That toggle needs a Mi account login, sometimes a SIM. The fallback is `adb push` to `/sdcard/Download` and tapping the APK. On the Mi 8 `adb install` worked first try. `adb shell input` is blocked (`INJECT_EVENTS`) on both unless **USB debugging (Security settings)** is on, so Termux commands were typed by hand.
3. **Termux:API calls hang forever on MIUI/HyperOS.** logcat:
   ```
   WakePathChecker: MIUILOG-AutoStart, Service/Provider/Broadcast Reject ... caller= com.termux callee= com.termux.api
   BroadcastQueueInjector: Unable to launch app com.termux.api/... process is not permitted to wake path
   ```
   **Quick fix over adb:** `adb shell cmd appops set com.termux.api 10008 allow` (and the same for `com.termux`). `10008` is MIUI's private AUTO_START op. **This only lasts until the next reboot** (Finding 12). The lasting fix is the Autostart switch in MIUI's app settings.
4. **Clock alarms can't be created from the background on this ROM.** `SET_ALARM` via Termux's `am` works when Termux is in the foreground. With the screen locked it throws inside `AppOpsManager.readAndLogNotedAppops` → `SyncNotedAppOp` validation, apparently because MIUI's private op (background start, `10021`) is out of the AOSP op range. Granting `SYSTEM_ALERT_WINDOW` and `10021` didn't help. (Redmi; not retried on the Mi 8.)
5. **So the agent holds the alarms itself.** A scheduler thread plus a JSON file on the phone. That is also the right design: alarms survive a cluster outage and don't depend on the Clock app. It is reliable while the phone is **on the charger** (Doze doesn't engage while charging) and Termux holds `termux-wake-lock`. The schedule file also survives agent updates.
6. **The Redmi was in silent mode.** NOTIFICATION and RING are muted, and `termux-volume notification 10` is a no-op (stays 0). Speak on the **ALARM** stream, which plays through silent/DND as a wake-up should. `termux-media-player` has no stream option and always uses MUSIC, which was muted at 0 until `/volume` raised it.
7. **Battery/background settings over adb** (`dumpsys deviceidle whitelist +…`, `cmd appops set … RUN_ANY_IN_BACKGROUND allow`, `appops set com.termux SYSTEM_ALERT_WINDOW allow`) take effect immediately, but on the Mi 8 the whitelist and `RUN_ANY_IN_BACKGROUND` were **gone after a reboot**. Set **Battery saver → No restrictions** in MIUI's app settings instead. Locking Termux in recents is still not done.
8. **Wireless adb works without pairing** (Redmi, Android 13) when the host key was already "always allow"-ed over USB. Arch's `android-tools` adb has **no mDNS** (`adb mdns` unsupported) and `service.adb.tls.port` was empty, so the port was found with `adb shell ss -ltn` (adbd on `*:41807`). The port is random and wireless debugging turns off on reboot or network change. **Maintenance channel only**, not for normal operation.
9. **The phone's clock and timezone are correct in Termux Python** (`2026-10-12 15:06:33 EDT`), unlike the Kindle browser's UTC-only JS clock.
10. **The Redmi resolves `*.arch.internal` through the router**, so the agent can call `speaker.arch.internal` / `homecal-api.arch.internal` by name.
11. **Android 10 has no Wireless debugging toggle** (it arrived in Android 11). On the Mi 8 adb is USB-only; `adb tcpip 5555` over USB gives Wi-Fi adb until the next reboot. Routine maintenance doesn't need adb: agent code self-updates, and packages and debugging go over SSH.
12. **MIUI resets autostart and background state at boot.** After reboot 1, the adb-set `10008` op was back to `ignore` for Termux:Boot and gone for Termux / Termux:API, `RUN_ANY_IN_BACKGROUND` was `ignore`, and the `deviceidle` whitelist was empty. MIUI keeps its own record (Security app) and re-applies it. **Settings made in MIUI's app settings page persist**; adb tweaks are fine only for a quick test. The Redmi was never rebooted, so its Finding 3 fix was never tested past a reboot.
13. **Termux:Boot needs Autostart on all three apps.** Termux:Boot to receive the boot broadcast; **Termux**, because Termux:Boot starting `TermuxService` is a cross-app "wake path" that MIUI checks on the callee; and Termux:API for the agent's speech and volume calls. With only Termux:Boot allowed, logcat showed `Reject caller= com.termux.boot callee= com.termux classname=com.termux.app.TermuxService action=com.termux.service_execute`.
14. **Boot is slow, not instant.** BOOT_COMPLETED is an ordered broadcast delivered to receivers one at a time. On reboot 3 it was queued at unlock (19:31:40), dispatched 22 s later, reached Termux:Boot after 45 s, and the agent answered after **~53 s**.
15. **A screen-lock PIN blocks everything until the first unlock.** Android's file-based encryption keeps app data locked and only sends BOOT_COMPLETED after the first unlock. Wi-Fi itself connected before the unlock (reboot 1: back on Wi-Fi at 19:09:28, agent down). **With a PIN, after a power cut or crash-reboot nothing runs and no alarm fires until someone unlocks the phone.** For a shelf speaker, set Screen lock → None.
16. **Termux's `pkg` uses a random mirror.** Python and Termux:API were installed from `https://mirrors.cernet.edu.cn/termux/apt/termux-main` (a Chinese university mirror, recorded in `$PREFIX/etc/apt/sources.list`). Termux signs its packages and apt checks the signature, so a mirror can't change their contents. For control and locality, Part 2 installs with **`apt-get`** and a **local-only source list** (`-o Dir::Etc::SourceList=… -o Dir::Etc::SourceParts=-`) pointing at a partial copy of the official repo on the k3s box. The signed `InRelease` and `Packages` files are copied byte-for-byte, so the phone's apt still verifies them. Don't use `pkg` there: it re-runs its mirror selection. The Termux CDN answers Python's default user agent with **403**, so the copy is downloaded with curl.
17. **Self-update by exec in place works cleanly.** `os.execv` keeps the PID. Python sockets are not inherited across exec, so the listener closes, and `ThreadingHTTPServer` rebinds `:8080` immediately (SO_REUSEADDR). Daemon threads and the in-memory state restart; on-disk state (schedule, logs) carries over. The pre-swap `--check` must print the **manifest's** version, so a mislabeled release can't cause an endless update loop.
18. **Termux:Boot install doubles as a signer check.** It shares Termux's `sharedUserId`, so Android only installs it if it has the same signer as the installed Termux. F-Droid 0.8.1 installed fine next to F-Droid Termux.
19. **MIUI kills Termux as a whole, without a reboot.** Some time after 2026-10-12 20:06, the whole Termux process tree (agent and `run.sh`) disappeared. The phone was on the charger, with Autostart on and Battery saver at No restrictions for all three apps. `run.sh` can only restart the agent while Termux itself is alive. The most likely cause is MIUI's background clean-up, since Termux was not locked in recents. logcat didn't go back far enough to confirm.
20. **Once Termux is dead, it only comes back by hand.** Termux:Boot runs only on BOOT_COMPLETED. adb can open Termux but can't type in it (Finding 2). Termux's `RUN_COMMAND` intent is meant for other apps that hold its permission (with `allow-external-apps=true`); not tried from adb. A watchdog that Android itself re-runs is needed. Candidate: `termux-job-scheduler` (Termux:API's JobService, minimum period 15 min, `--persisted true` survives reboots). Untested.
21. **Volume drifted.** Music was 2/15, not the 10/15 the POC left. Unknown what changed it. The production agent should re-apply volumes from the desired state on every sync tick, not trust what the phone has.
22. **The POC agent can't date its own death.** It logs requests and failures only, so a healthy idle agent writes nothing. Even the `update check failed` lines (every 60 s with no update server) carry no timestamp; counting them after the last `listening on` line gives the time to within about a minute. Production needs a real heartbeat: last check-in recorded by the cluster on every sync tick, plus a timestamped local log line.
23. **`cmd media_session volume … --get` doesn't work on the Mi 8** (`No shell command implementation`, Android 10); it did on the Redmi. Read volumes with `termux-volume` over SSH instead.
24. **`termux-job-scheduler` revives a force-stopped Termux.** The persisted 15-minute job belongs to Termux:API, so it survives `am force-stop com.termux` and starts `TermuxService` again (Part 4). Android adds some slack: the agent was back 17 min after the kill. Its constraints are "network available" and "battery not low", both always true on the charger.
25. **`pkill -f` over SSH can kill its own session.** `pkill -f "python agent.py"` inside `ssh … '…'` matches the remote shell's own command line. Use `pkill -f "[p]ython agent.py"`; `tools/install.sh` does.

## Operating constraints

- **Security:** the Mi 8's patch level is **2020-12**, worse than the Redmi's. Keep it on the LAN. SSH is key-only. The POC agent still listens on `:8080` with **no auth**; in production the agent makes **outbound calls only** and authenticates with a device key.
- **Power:** must live on a wall charger. Off the charger, Doze and the wake lock drain the battery and the timing guarantees go away. The Mi 8 battery is at ~80 %; check now and then for swelling.
- **Power cuts / reboots:** with a PIN, nothing runs until someone unlocks (Finding 15). Without one, the agent is back about a minute after boot.
- **Xiaomi settings live in MIUI's UI:** Autostart **on** and Battery saver **No restrictions** for Termux, Termux:API and Termux:Boot. adb tweaks don't survive a reboot (Findings 12–13).
- **Xiaomi task killing:** swiping Termux away or using "clean up" kills the agent. In practice it was killed with nobody touching it and stayed dead for about four weeks (Part 3, Finding 19). Lock Termux in recents, but don't rely on that alone (Open items 10–11).
- **Wi-Fi:** −72 dBm where the Mi 8 sat during the test. Alarms don't depend on Wi-Fi (they're held on the phone), but pushes and updates do.
- **Shared use as a phone:** possible but not recommended. Announcements mix over media and speak through silent mode, some apps (often banking) refuse to run with Developer options on, and personal data from the previous owner is still on it.
- **Survival is the main risk, and it already failed once.** The agent did not survive the four weeks after the POC (Part 3). See Open items 1, 10 and 11.

## Target architecture

Pull model, consistent with the Kindle (pulls `/dash`) and with Argo CD:

```
git push ─► GHA ─► GHCR ─► arch-infra tag bump ─► Argo CD
                                                      │
k3s  homecal (homecal.arch.internal / homecal-api.arch.internal)
  ├─ Web: Devices tab (Kindle + speaker: last check-in, battery, agent version, volume)
  │       Wake-ups (per-member recurring events with a `speaker` reminder) · Say now
  ├─ reminder-scheduler: new channel "speaker" next to "email" / "push"
  ├─ GET  /api/v1/agent/desired      ← agent sync tick (schedule, volume, pending
  │                                     announcements, pinned agent version + sha256)
  ├─ POST /api/v1/speaker/announce   ← homework / homeparentcontrol / anything
  └─ GET  /api/v1/agent/<version>    ← agent code shipped inside the homecal-api image
                     ▲  outbound HTTP only, hc_ device key (existing apikeys / service-account flow)
  (plus a small Termux package repo copy, see Open items 6)

Mi 8 (Termux): agent = sync loop + local scheduler + speak/play
  ├─ caches last desired state on disk, so alarms fire with the cluster down
  ├─ self-update: pinned version → download → sha256 → --check → swap → exec   (proven in Part 2)
  └─ Termux:Boot starts agent + sshd (:8022, key auth) after reboot           (proven in Part 2)
```

**Why homecal:** it already has members and recurring events (`series`), a reminder scheduler with per-reminder **channels** (`email`, `push`), household-device auth (`hc_` keys via `?key=` for the Kindle, `apikeys`), a `devices` table, server-side timezone handling, and `today.ts` / digest / `llm.ts` for writing the spoken morning briefing. Keep the code in its own modules (`routes/speaker.ts`, `services/speaker-*.ts`) so it can be split out later.

**Agent protocol: copy homeparentcontrol's design** (`homeparentcontrol/docs/design-decisions.md`):
- A.5: polling with a server-driven adaptive cadence of 60/15/5 s (`next_poll_after_ms`), no push. "Say now" lands within ~5 s.
- A.6: desired state, not commands.
- A.26: the sync tick is the heartbeat.
- Agent version pinned inside the desired state. The POC's `release/manifest.json` is a stand-in for that field.
- A.21: device keys hang off one `isService` user per household.

**Updates over Wi-Fi after setup:**

| Change | Path | Touch the phone? |
|---|---|---|
| Alarms, volume, messages | homecal UI → desired state → next tick | No |
| Agent code | `git push` → Argo → pinned version in desired state → agent self-update (pinning an older version rolls the phone back too) | No (proven in Part 2) |
| Termux packages, debugging | SSH to Termux :8022; `apt-get` from the cluster's repo copy | No |
| Termux / Termux:API / Termux:Boot APKs | Android 10: USB, or download on the phone and tap Install | Rarely |
| MIUI Autostart / Battery saver, screen lock, factory reset | On device | Yes, one-time |

## Open items

1. **Multi-day test**, once items 10 and 11 are in place. Mi 8 on the charger, a daily morning schedule entry, check `/fired` over several days. Part 3 showed that without them it doesn't survive.
2. **Screen lock → None** on the Mi 8, so it recovers from power cuts unattended (Finding 15). Decision pending.
3. **Factory reset or not.** A reset clears the 79 old apps and the previous owner's data. Afterwards redo: Developer options + USB debugging, the three APKs, MIUI Autostart + Battery saver for all three, then the setup script.
4. **Router reservation + name.** Set Wi-Fi → Privacy → **Use device MAC** first (the current MAC is randomized), then reserve `192.168.1.245`. Consider a spot with better signal than −72 dBm, or the 2.4 GHz network.
5. ~~**Device key auth** on every agent call. Remove the open `:8080` listener once the pull model lands.~~ Done in Phase 24: agent v1 has no listener and sends its device key on every sync.
6. **Termux repo copy as a cluster service:** a small k3s static server (plus a job that rebuilds it with Appendix C) holding everything the phone needs: `python`, `termux-api`, `openssh` and their dependencies. Then reinstall Python and Termux:API from it, and have the setup script install all three from it in one go.
7. ~~**Crash rollback and quiet hours.**~~ Done in Phase 24 (`phone/run.sh` restores `agent.py.prev` after three quick crashes; the agent refuses that version from then on and reports it; no update speech in quiet hours).
8. ~~**Design note + build in homecal**~~ Done: Phases 23–26 (`docs/design-plan.md`). The sync endpoint became `POST /api/v1/agent/sync`.
9. (Optional) Better voice: Piper TTS in-cluster rendering WAV, played via `/play`, instead of the phone's built-in TTS.
10. ~~**Watchdog that brings Termux back without a reboot** (Finding 20).~~ Done and verified (Part 4, Finding 24).
11. ~~**Offline alert from the cluster** (Finding 22).~~ Done in Phase 23, verified in Part 4.

## State of the rig when this was written

Updated 2026-11-10 after Part 4.

- **Redmi K40: reverted** to normal use on 2026-10-12. Termux and Termux:API uninstalled (removing the agent, its data and the app-ops changes), the copied APKs deleted from `/sdcard/Download`, battery-whitelist entries removed, music/alarm volume restored to 0/150 and 5/15. By hand: the POC Clock alarm deleted, USB debugging authorizations revoked, Developer options off.
- **Mi 8:** Termux, Termux:API, Termux:Boot installed. `~/.termux/boot/10-speaker` (from `apps/speaker-agent/phone/boot.sh`) starts sshd `:8022` (key only, `~/.ssh/home_speaker_ed25519` on aaron-desktop-arch) and `~/homecal-speaker/run.sh` → **agent v1.0.0** (no listener). It is also re-run every 15 min by `termux-job-scheduler` job 4201. Config in `~/.config/homecal-speaker/`: server `http://192.168.1.163:3001` (the **dev** API) and a dev device key. With the dev API gone it logs failed syncs and holds an empty schedule. Volumes alarm 10 / music 8. The POC agent's files are still in `~/speaker/`, unused. MIUI Autostart + Battery saver set for all three apps. **Termux not confirmed locked in recents. The screen-lock PIN is still on.** USB debugging on, adb authorized for aaron-desktop-arch.
- **No file server.** Agent releases and sounds are now served by the homecal API (`/api/v1/agent/releases`, `/api/v1/agent/sounds`). After deploy: register the speaker in prod and re-run `apps/speaker-agent/tools/install.sh 192.168.1.245 http://homecal-api.arch.internal <key-file>`. The termux-main repo copy (Appendix C) is still only rebuildable by hand.

## Appendix A — `agent.py` v0.2.0 (sha256 `5dae6c6c…f0f37c9e`)

This is the Part 2 agent. The Part 1 agent that ran on the Redmi and first on the Mi 8 (sha256 `6a304f3b…4c033800`) is this file **without** `VERSION` / `MANIFEST_URL` / `CHECK_EVERY` / `SELF` / `UPDATE_LOG` / `UPDATED_MARK` / `STARTED` / `_update_lock`, the `hashlib` / `shutil` / `sys` imports, `_tail` and the extra `/status` fields (its `/fired` read the log file directly), the whole "Self-update" section, the `/update` route, and the `--check`, updater and announce lines at startup. Its docstring and startup log line were worded slightly differently.

```python
#!/usr/bin/env python3
"""POC speaker agent for Termux, with self-update over Wi-Fi.

Exposes a tiny HTTP API on the LAN so another machine can make this phone
speak, play a sound, change volume, and hold daily wake-up alarms.

  GET /status
  GET /say?text=Good+morning[&stream=ALARM|MUSIC|NOTIFICATION]
  GET /play?url=http://host/file.mp3
  GET /volume?stream=music|alarm&level=0-15
  GET /alarm?hour=6&minute=30&message=Wake+up[&days=2,3,4,5,6]   (Calendar: Sun=1 ... Sat=7)
  GET /schedule[?time=06:30&text=Good+morning&url=http://host/sound.wav]   (list / add; daily)
  GET /unschedule?id=<id>
  GET /fired      (log of schedule entries that went off)
  GET /update     (check the release manifest now instead of waiting for the next poll)

Self-update: every CHECK_EVERY seconds the agent reads MANIFEST_URL
({"version", "url", "sha256"}). If the version differs from its own it downloads
the file, checks the sha256, runs the new file with --check (must import cleanly
and report the manifest's version), keeps the old file as agent.py.prev, swaps
the new one in and re-execs itself. Pinning an older version in the manifest
rolls back the same way.

POC only: no auth, binds to all interfaces.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

VERSION = "0.2.0"
PORT = 8080
MANIFEST_URL = os.environ.get("SPEAKER_MANIFEST", "http://192.168.1.163:8765/release/manifest.json")
CHECK_EVERY = 60
SELF = os.path.abspath(__file__)
CACHE = os.path.expanduser("~/.cache/poc-agent")
STATE = os.path.expanduser("~/.config/poc-agent")
SCHEDULE_FILE = os.path.join(STATE, "schedule.json")
FIRE_LOG = os.path.join(STATE, "fired.log")
UPDATE_LOG = os.path.join(STATE, "update.log")
UPDATED_MARK = os.path.join(STATE, "updated_from")
STARTED = time.time()
os.makedirs(CACHE, exist_ok=True)
os.makedirs(STATE, exist_ok=True)
_lock = threading.Lock()
_update_lock = threading.Lock()


def run(cmd, timeout=90):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return {"rc": r.returncode, "out": r.stdout.strip(), "err": r.stderr.strip()}


def _tail(path, n):
    try:
        with open(path) as f:
            return f.read().splitlines()[-n:]
    except FileNotFoundError:
        return []


def status(q):
    return {
        "ok": True,
        "version": VERSION,
        "pid": os.getpid(),
        "uptime_s": int(time.time() - STARTED),
        "time": time.strftime("%Y-%m-%d %H:%M:%S %Z"),
        "battery": json.loads(run(["termux-battery-status"])["out"] or "{}"),
        "updates": _tail(UPDATE_LOG, 5),
    }


def say(q):
    text = q.get("text", ["Hello from the speaker"])[0]
    # ALARM stream by default: still audible when the phone is on silent / DND
    stream = q.get("stream", ["ALARM"])[0].upper()
    return {"said": text, "stream": stream, **run(["termux-tts-speak", "-s", stream, text])}


def play(q):
    url = q["url"][0]
    path = os.path.join(CACHE, "clip" + (os.path.splitext(urlparse(url).path)[1] or ".mp3"))
    urllib.request.urlretrieve(url, path)
    return {"playing": url, **run(["termux-media-player", "play", path])}


def volume(q):
    stream = q.get("stream", ["music"])[0]
    level = q["level"][0]
    return {"stream": stream, "level": level, **run(["termux-volume", stream, level])}


def alarm(q):
    cmd = [
        "am", "start", "-a", "android.intent.action.SET_ALARM",
        "--ei", "android.intent.extra.alarm.HOUR", q["hour"][0],
        "--ei", "android.intent.extra.alarm.MINUTES", q.get("minute", ["0"])[0],
        "--es", "android.intent.extra.alarm.MESSAGE", q.get("message", ["POC alarm"])[0],
        "--ez", "android.intent.extra.alarm.SKIP_UI", "true",
    ]
    if "days" in q:
        cmd += ["--eial", "android.intent.extra.alarm.DAYS", q["days"][0]]
    return run(cmd)


# --- On-device schedule: the agent itself holds wake-up alarms, so they fire with
# the screen locked and without the cluster. Entries repeat daily at HH:MM.

def _load():
    try:
        with open(SCHEDULE_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def _save(entries):
    with open(SCHEDULE_FILE + ".tmp", "w") as f:
        json.dump(entries, f, indent=2)
    os.replace(SCHEDULE_FILE + ".tmp", SCHEDULE_FILE)


def schedule(q):
    with _lock:
        entries = _load()
        if "time" in q:
            hh, mm = (int(x) for x in q["time"][0].split(":"))
            entries.append({
                "id": int(time.time()),
                "time": f"{hh:02d}:{mm:02d}",
                "text": q.get("text", ["Good morning! Time to get up."])[0],
                "url": q.get("url", [None])[0],
                "last_fired": None,
            })
            _save(entries)
        return {"now": time.strftime("%H:%M:%S"), "entries": entries}


def unschedule(q):
    with _lock:
        entries = [e for e in _load() if str(e["id"]) != q["id"][0]]
        _save(entries)
        return {"entries": entries}


def fired(q):
    return {"log": _tail(FIRE_LOG, 50)}


def _fire(entry):
    if entry.get("url"):
        play({"url": [entry["url"]]})
        time.sleep(3)
    result = say({"text": [entry["text"]]})
    with open(FIRE_LOG, "a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} fired {entry['id']} {entry['time']} rc={result['rc']}\n")


def _scheduler():
    while True:
        now, today = time.strftime("%H:%M"), time.strftime("%Y-%m-%d")
        with _lock:
            entries = _load()
            due = [e for e in entries if e["time"] == now and e.get("last_fired") != today]
            for e in due:
                e["last_fired"] = today
            if due:
                _save(entries)
        for e in due:
            try:
                _fire(e)
            except Exception as ex:  # keep the loop alive
                print(f"[poc-agent] fire failed: {ex!r}", flush=True)
        time.sleep(15)


# --- Self-update

def _log_update(msg):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} v{VERSION} {msg}"
    print(f"[poc-agent] {line}", flush=True)
    with open(UPDATE_LOG, "a") as f:
        f.write(line + "\n")


def _restart():
    os.execv(sys.executable, [sys.executable, SELF])


def check_update(q=None):
    with _update_lock:
        with urllib.request.urlopen(MANIFEST_URL, timeout=20) as r:
            m = json.load(r)
        if m["version"] == VERSION:
            return {"version": VERSION, "update": "none"}
        with urllib.request.urlopen(m["url"], timeout=60) as r:
            code = r.read()
        got = hashlib.sha256(code).hexdigest()
        if got != m["sha256"]:
            _log_update(f"REFUSED {m['version']}: sha256 {got[:12]} != manifest {m['sha256'][:12]}")
            return {"version": VERSION, "update": "refused", "reason": "sha256 mismatch"}
        new = SELF + ".new"
        with open(new, "wb") as f:
            f.write(code)
        chk = subprocess.run([sys.executable, new, "--check"], capture_output=True, text=True, timeout=60)
        if chk.returncode != 0 or chk.stdout.strip() != m["version"]:
            os.remove(new)
            why = (chk.stderr.strip().splitlines() or [f"reports {chk.stdout.strip()!r}"])[-1]
            _log_update(f"REFUSED {m['version']}: self-check failed: {why}")
            return {"version": VERSION, "update": "refused", "reason": why}
        shutil.copy2(SELF, SELF + ".prev")
        os.replace(new, SELF)
        with open(UPDATED_MARK, "w") as f:
            f.write(VERSION)
        _log_update(f"applied {m['version']}, restarting")
        threading.Timer(1, _restart).start()  # let the HTTP reply go out first
        return {"version": VERSION, "update": "applied", "to": m["version"]}


def _updater():
    time.sleep(10)
    while True:
        try:
            check_update()
        except Exception as ex:  # cluster down or manifest broken: keep running as-is
            print(f"[poc-agent] update check failed: {ex!r}", flush=True)
        time.sleep(CHECK_EVERY)


def _announce_update():
    try:
        with open(UPDATED_MARK) as f:
            old = f.read().strip()
        os.remove(UPDATED_MARK)
    except FileNotFoundError:
        return
    _log_update(f"started after update from {old}")
    time.sleep(2)
    say({"text": [f"Speaker updated to version {VERSION}"]})


ROUTES = {
    "/status": status, "/say": say, "/play": play, "/volume": volume, "/alarm": alarm,
    "/schedule": schedule, "/unschedule": unschedule, "/fired": fired, "/update": check_update,
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        fn = ROUTES.get(u.path)
        if fn is None:
            return self._send(404, {"error": "unknown path", "paths": sorted(ROUTES)})
        try:
            self._send(200, fn(parse_qs(u.query)))
        except KeyError as e:
            self._send(400, {"error": f"missing parameter {e}"})
        except Exception as e:  # POC: surface everything to the caller
            self._send(500, {"error": repr(e)})

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    if "--check" in sys.argv:  # used by the updater before swapping this file in
        print(VERSION)
        sys.exit(0)
    threading.Thread(target=_scheduler, daemon=True).start()
    threading.Thread(target=_updater, daemon=True).start()
    threading.Thread(target=_announce_update, daemon=True).start()
    print(f"[poc-agent] v{VERSION} pid {os.getpid()} listening on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
```

v0.3.0, the fake update (sha256 `96613394…152a184c`), was generated from it with `sed`:

```diff
--- agent-0.2.0.py
+++ agent-0.3.0.py
@@ -12,6 +12,7 @@
   GET /schedule[?time=06:30&text=Good+morning&url=http://host/sound.wav]   (list / add; daily)
   GET /unschedule?id=<id>
   GET /fired      (log of schedule entries that went off)
+  GET /ping       (added in 0.3.0)
   GET /update     (check the release manifest now instead of waiting for the next poll)
 
 Self-update: every CHECK_EVERY seconds the agent reads MANIFEST_URL
@@ -35,7 +36,7 @@
 from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
 from urllib.parse import parse_qs, urlparse
 
-VERSION = "0.2.0"
+VERSION = "0.3.0"
 PORT = 8080
 MANIFEST_URL = os.environ.get("SPEAKER_MANIFEST", "http://192.168.1.163:8765/release/manifest.json")
 CHECK_EVERY = 60
@@ -151,6 +152,10 @@
         return {"entries": entries}
 
 
+def ping(q):
+    return {"pong": True, "version": VERSION}
+
+
 def fired(q):
     return {"log": _tail(FIRE_LOG, 50)}
 
@@ -249,7 +254,7 @@
 
 ROUTES = {
     "/status": status, "/say": say, "/play": play, "/volume": volume, "/alarm": alarm,
-    "/schedule": schedule, "/unschedule": unschedule, "/fired": fired, "/update": check_update,
+    "/schedule": schedule, "/unschedule": unschedule, "/fired": fired, "/update": check_update, "/ping": ping,
 }
 
 
```

The two bad 0.4.0 releases were also `sed` copies: one with only the version bumped (served with a manifest checksum that doesn't match it), one with the version bumped and `def say(q):` changed to `def say(q)`.

## Appendix B — Termux scripts

### `poc.sh` (Part 1 bootstrap)

Run in Termux with `curl -fsSL 192.168.1.163:8765/poc.sh | bash`.

```bash
#!/data/data/com.termux/files/usr/bin/bash
# One-shot POC bootstrap for Termux: install deps, fetch the agent, run it.
set -e
SRC="http://192.168.1.163:8765"

echo "[poc] installing python + termux-api (takes a minute or two)..."
yes | pkg install python termux-api

curl -fsSL "$SRC/agent.py" -o ~/agent.py
termux-wake-lock

echo "[poc] agent starting on port 8080 - keep Termux open"
exec python ~/agent.py
```

Installed by it on 2026-10-12: Termux packages `python 3.14.6`, `termux-api 0.60.0`.

### `setup-boot.sh` (Part 2 setup)

Run in Termux after stopping the Part 1 agent (CTRL+C) with `curl -fsSL 192.168.1.163:8765/setup-boot.sh | bash`. Expects `python` and `termux-api` from `poc.sh`. The run on the Mi 8 used a version without the `KbdInteractiveAuthentication` line; that setting was applied over SSH right after.

```bash
#!/data/data/com.termux/files/usr/bin/bash
# Make the POC speaker self-starting and maintainable over Wi-Fi:
# sshd on :8022 (key only) + the updatable agent, both started by Termux:Boot.
set -e
SRC="http://192.168.1.163:8765"

pkill -f 'python.*agent.py' || true    # stop the hand-started POC agent
mkdir -p ~/.ssh ~/speaker ~/.termux/boot

# Packages come only from the k3s box's copy of the official Termux repo (not an
# internet mirror). apt still verifies Termux's signature on the index.
echo "deb $SRC/termux-main stable main" > ~/speaker/local-apt.list
LOCAL="-o Dir::Etc::SourceList=$HOME/speaker/local-apt.list -o Dir::Etc::SourceParts=-"
echo "[setup] installing openssh from $SRC/termux-main ..."
apt-get $LOCAL update
apt-get $LOCAL -y install openssh

chmod 700 ~/.ssh
curl -fsSL "$SRC/home_speaker.pub" -o ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
sed -i '/^PasswordAuthentication/d' $PREFIX/etc/ssh/sshd_config
sed -i '/^KbdInteractiveAuthentication/d' $PREFIX/etc/ssh/sshd_config
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' >> $PREFIX/etc/ssh/sshd_config

curl -fsSL "$SRC/release/agent-0.2.0.py" -o ~/speaker/agent.py
echo "5dae6c6c7d638b2d5f5add693613b4bf07bdde908c7f1fd008ad11a3f0f37c9e  $HOME/speaker/agent.py" | sha256sum -c
curl -fsSL "$SRC/run.sh" -o ~/speaker/run.sh
curl -fsSL "$SRC/boot-speaker.sh" -o ~/.termux/boot/10-speaker
chmod +x ~/speaker/run.sh ~/.termux/boot/10-speaker

sh ~/.termux/boot/10-speaker
sleep 3
curl -s localhost:8080/status | grep -o '"version": "[^"]*"' && echo "[setup] done - you can unplug the USB cable"
```

### `run.sh` (→ `~/speaker/run.sh`)

```sh
#!/data/data/com.termux/files/usr/bin/sh
# Keep the speaker agent running. The agent re-execs itself in place when it
# updates, so this loop only restarts it after a crash or kill.
cd ~/speaker || exit 1
echo $$ > run.pid
while true; do
  python agent.py >> agent.log 2>&1
  echo "$(date '+%F %T') agent exited rc=$?, restarting in 5s" >> agent.log
  sleep 5
done
```

### `boot-speaker.sh` (→ `~/.termux/boot/10-speaker`)

```sh
#!/data/data/com.termux/files/usr/bin/sh
# Run by Termux:Boot after the phone boots (setup also runs it once by hand).
# Starts sshd (port 8022, key only) and the agent loop if they aren't running.
termux-wake-lock
pgrep -x sshd >/dev/null || sshd
if ! { [ -f ~/speaker/run.pid ] && kill -0 "$(cat ~/speaker/run.pid)" 2>/dev/null; }; then
  nohup sh ~/speaker/run.sh >/dev/null 2>&1 &
fi
```

### Release manifest

"Publishing" a version means pointing `release/manifest.json` at it:

```bash
R=release; V=0.3.0
printf '{"version": "%s", "url": "http://192.168.1.163:8765/%s/agent-%s.py", "sha256": "%s"}\n' \
  $V $R $V $(sha256sum $R/agent-$V.py | cut -d' ' -f1) > $R/manifest.json
```

## Appendix C — `build-termux-repo.py` (local Termux repo copy)

`python3 -I build-termux-repo.py termux-main openssh`, then serve the directory over HTTP. Re-running it into an empty directory reproduced exactly the file set the phone used (17 packages, 7.7 MB): `ca-certificates krb5 ldns libandroid-glob libandroid-support libc++ libdb libedit libresolv-wrapper ncurses openssh openssh-sftp-server openssl readline resolv-conf termux-auth zlib`.

```python
#!/usr/bin/env python3
"""Build a partial copy of the official Termux apt repo for the LAN.

Copies the signed index (InRelease + aarch64 Packages*) byte-for-byte, then
downloads only the given packages and their recursive dependencies. Phones point
apt at the copy; apt verifies Termux's signature on InRelease as usual, so the
copy can't alter anything without the install failing.

  python3 -I build-termux-repo.py OUT_DIR openssh [more packages...]
"""
import hashlib
import os
import re
import subprocess
import sys

BASE = "https://packages-cf.termux.dev/apt/termux-main"
INDEX = ["Packages", "Packages.gz", "Packages.bz2", "Release"]


def fetch(url, dst):
    # curl, not urllib: the Termux CDN answers Python's default user agent with 403
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(["curl", "-fsS", "-o", dst, url], check=True)
    with open(dst, "rb") as f:
        return f.read()


def main(out, roots):
    inrel = fetch(f"{BASE}/dists/stable/InRelease", f"{out}/dists/stable/InRelease").decode()
    signed = {p: (h, int(n)) for h, n, p in re.findall(r"^ ([0-9a-f]{64}) +(\d+) (\S+)$", inrel, re.M)}
    for f in INDEX:
        p = f"main/binary-aarch64/{f}"
        data = fetch(f"{BASE}/dists/stable/{p}", f"{out}/dists/stable/{p}")
        assert (hashlib.sha256(data).hexdigest(), len(data)) == signed[p], f"index mismatch: {p}"

    pkgs, provides = {}, {}
    with open(f"{out}/dists/stable/main/binary-aarch64/Packages") as f:
        for stanza in f.read().split("\n\n"):
            d = dict(re.findall(r"^([\w-]+): (.*)$", stanza, re.M))
            if not d:
                continue
            pkgs.setdefault(d["Package"], []).append(d)
            for v in re.split(r",\s*", d.get("Provides", "")):
                if v:
                    provides.setdefault(v.split()[0], set()).add(d["Package"])

    need, todo = set(), list(roots)
    while todo:
        name = todo.pop()
        for real in ([name] if name in pkgs else sorted(provides.get(name, []))):
            if real in need:
                continue
            need.add(real)
            for d in pkgs[real]:
                for field in ("Depends", "Pre-Depends"):
                    for alt in re.split(r",\s*", d.get(field, "")):
                        for a in alt.split("|"):
                            a = a.strip().split(" ")[0]
                            if a and (a in pkgs or a in provides):
                                todo.append(a)

    total = 0
    for name in sorted(need):
        for d in pkgs[name]:
            data = fetch(f"{BASE}/{d['Filename']}", f"{out}/{d['Filename']}")
            assert hashlib.sha256(data).hexdigest() == d["SHA256"] and len(data) == int(d["Size"]), name
            total += len(data)
    print(f"{len(need)} packages, sha256-verified against the signed index, {total / 1e6:.1f} MB:")
    print(" ".join(sorted(need)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:] or ["openssh"])
```

## Appendix D — Setup runbook

Host side (Arch): `sudo pacman -S --needed android-tools android-udev`.

On the phone (one-time, by hand):
1. Settings → About phone → tap **MIUI version** (HyperOS: **OS version**) ×7. Then Additional settings → Developer options → **USB debugging** (wait out the countdown) + **Install via USB**.
2. Plug in, accept the RSA prompt ("always allow").

Over adb:
```bash
# APKs (F-Droid builds; Termux and its plugins must come from the same signer)
curl -fsSLO https://f-droid.org/repo/com.termux_1002.apk        # Termux 0.118.3
curl -fsSLO https://f-droid.org/repo/com.termux.api_1002.apk    # Termux:API 0.53.0
curl -fsSLO https://f-droid.org/repo/com.termux.boot_1000.apk   # Termux:Boot 0.8.1
sha256sum com.termux*.apk
# e6265a57eb5ca363808488e3b01955958bed93bc0c8a0d281849b363b11027ec  com.termux_1002.apk
# 4497dbbf81906df52e59ed387a5223d225aa0de3aca817cc557a621e4dadda44  com.termux.api_1002.apk
# 6f7cf9b94f539d3efd4af3544ff819947b49395275d8cfa7e5f80de14f3d9cf8  com.termux.boot_1000.apk
for a in com.termux_1002.apk com.termux.api_1002.apk com.termux.boot_1000.apk; do adb install $a; done

# Immediate effect only; MIUI resets these at reboot (Finding 12). Set them in the UI below too.
for p in com.termux com.termux.api com.termux.boot; do
  adb shell cmd appops set $p 10008 allow
  adb shell dumpsys deviceidle whitelist +$p
done

adb shell am start -n com.termux.boot/.BootActivity   # run once so Android delivers its boot broadcast
adb shell am start -n com.termux/.app.TermuxActivity
```

On the phone, in MIUI's app settings, for **Termux, Termux:API and Termux:Boot** (all three):
- **Autostart → ON**
- **Battery saver → No restrictions**

`adb shell am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:com.termux` opens the right page (change the package name for the others). Optionally set Screen lock → None.

In Termux (typed by hand; input injection is blocked): `poc.sh`, then `setup-boot.sh` (Appendix B). On the k3s box beforehand: `ssh-keygen -t ed25519 -f ~/.ssh/home_speaker_ed25519`, build the repo copy (Appendix C), publish `release/` with a manifest.

Day-to-day, over Wi-Fi:
```bash
ssh -p 8022 -i ~/.ssh/home_speaker_ed25519 speaker@192.168.1.245     # any user name works in Termux
curl -s 192.168.1.245:8080/status                                    # version, pid, uptime, last update lines
curl -s 192.168.1.245:8080/update                                    # check the manifest now

# Termux killed but no reboot (Part 3): needs a hand at the phone
adb shell am start -n com.termux/.app.TermuxActivity                 # then type in Termux: sh ~/.termux/boot/10-speaker
```

Wireless adb (Android 11+ only, e.g. the Redmi; after Developer options → Wireless debugging):
```bash
adb shell ss -ltn                  # find adbd's TLS port (no mDNS in Arch adb)
adb connect 192.168.1.173:<port>   # no pairing needed if the key was already authorized over USB
```

Diagnostics that were useful:
```bash
adb shell dumpsys audio | grep -A2 STREAM_                          # mute state per stream
adb shell cmd media_session volume --stream 3 --get                 # current/max (3=music 4=alarm 5=notification). Redmi only; Mi 8: termux-volume over SSH
adb shell uptime                                                     # did it reboot?
adb shell 'ps -A | grep termux'                                      # is Termux alive at all? (empty = killed, Finding 19)
adb shell 'dumpsys wifi | grep -m1 rssi='                            # Wi-Fi network, frequency and signal
adb shell settings get system next_alarm_formatted                  # did the Clock alarm land?
adb shell dumpsys power | grep mWakefulness                         # screen on/off during tests
adb shell cmd appops get com.termux.boot 10008                      # MIUI autostart: allow / ignore
adb logcat -d -b all | grep -E 'MIUILOG-AutoStart|BroadcastQueueInjector|am_broadcast_discard_app'  # Xiaomi blocking app wakeups
adb shell dumpsys activity broadcasts | grep -A3 'BOOT_COMPLETED'   # is the boot broadcast still being delivered?
adb shell getprop sys.user.0.ce_available                           # true once the phone has been unlocked since boot
adb shell locksettings get-disabled   # "Credential can't be null or empty" = a PIN/password is set (Android 10)
adb exec-out screencap -p > screen.png                              # see the phone screen
```

## Sources

- Raspberry Pi pricing: [OMG! Ubuntu, Oct 2026](https://www.omgubuntu.co.uk/2026/10/raspberry-pi-2gb-costs-how-much-now) · [Raspberry Pi: more memory-driven price rises](https://www.raspberrypi.com/news/more-memory-driven-price-rises/) · [The Register, Feb 2026](https://www.theregister.com/2026/02/02/raspberry_pi_ram_shortage_price_hike/) · [Zero 2 W launch](https://www.raspberrypi.com/news/new-raspberry-pi-zero-2-w-2)
- Google: [Nest Mini / Nest Audio discontinued](https://androidcentral.com/accessories/smart-home/new-google-home-speaker-incoming-googles-old-nest-devices-are-quietly-disappearing) · [Google Home Speaker](https://the-gadgeteer.com/2026/06/17/new-google-home-speaker-things-to-know/) · [Cast ignores local DNS (HA docs mirror)](https://www.hasscn.top/home-assistant/integrations/cast) · [Netgate thread](https://forum.netgate.com/post/414203)
- Sonos: [SoCo](https://soco.readthedocs.io/en/latest/) · [TapHome local UPnP, 2026](https://taphome.com/en/compatibility/sonos/) · [openHAB: Sonos API change](https://community.openhab.org/t/sonos-after-change-to-new-api/144106)
- WiiM: [HTTP API command list](https://forum.wiimhome.com/threads/wiim-http-api-command-list-for-using-your-browser-as-a-remote.9704/)
- ESPHome / Voice PE: [Voice PE](https://www.home-assistant.io/voice-pe/) · [Voice chapter 10](https://www.home-assistant.io/blog/2025/06/25/voice-chapter-10/)
- Alexa unofficial APIs: [alexa-remote](https://github.com/Apollon77/alexa-remote/) · [alexa-remote2](https://npmjs.com/package/alexa-remote2) · [alexa_media_player](https://github.com/alandtse/alexa_media_player/wiki)
- Termux on F-Droid: `https://f-droid.org/api/v1/packages/com.termux`, `…/com.termux.api`, `…/com.termux.boot`
- Termux apt repo: `https://packages-cf.termux.dev/apt/termux-main` (`dists/stable/InRelease`, signed)
