#!/usr/bin/env bash
# Install (or reinstall) the HomeCal speaker agent on a Termux phone over SSH.
# Run from the k3s box, which already holds the phone's SSH key (memo Part 2).
#
#   tools/install.sh <phone-ip> <server-url> <key-file>
#   e.g. tools/install.sh 192.168.1.245 http://homecal-api.arch.internal ~/kids-speaker.key
#
# <key-file> holds the device's hc_ key from the Devices tab. It is piped over
# SSH into ~/.config/homecal-speaker/key (mode 600) and never echoed. The POC
# agent (~/speaker) is stopped and left on disk.
set -euo pipefail
PHONE="${1:?phone ip}"; SERVER="${2:?server url}"; KEY_FILE="${3:?key file}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(sed -n 's/^VERSION = "\(.*\)"/\1/p' "$HERE/agent.py" | head -n 1)"
RELEASE="$HERE/releases/agent-$VERSION.py"
[ -f "$RELEASE" ] || { echo "no release for $VERSION — run tools/release.py first" >&2; exit 1; }
SSH=(ssh -p 8022 -i "${SPEAKER_SSH_KEY:-$HOME/.ssh/home_speaker_ed25519}" -o BatchMode=yes "speaker@$PHONE")

echo "[install] agent $VERSION → $PHONE, server $SERVER"
"${SSH[@]}" 'mkdir -p ~/homecal-speaker ~/.config/homecal-speaker ~/.termux/boot
  for pid in ~/speaker/run.pid ~/homecal-speaker/run.pid; do
    if [ -f "$pid" ]; then kill "$(cat "$pid")" 2>/dev/null || true; fi
  done
  pkill -f "[p]ython agent.py" 2>/dev/null || true'  # [p]: not this shell's own command line
"${SSH[@]}" 'cat > ~/homecal-speaker/agent.py' < "$RELEASE"
"${SSH[@]}" 'cat > ~/homecal-speaker/run.sh' < "$HERE/phone/run.sh"
"${SSH[@]}" 'cat > ~/.termux/boot/10-speaker && chmod +x ~/.termux/boot/10-speaker ~/homecal-speaker/run.sh' < "$HERE/phone/boot.sh"
printf '{"server": "%s"}\n' "$SERVER" | "${SSH[@]}" 'cat > ~/.config/homecal-speaker/config.json'
"${SSH[@]}" 'umask 077; tr -d "\n\r " > ~/.config/homecal-speaker/key' < "$KEY_FILE"
# Watchdog (memo open item 10): Android's job scheduler re-runs the boot script
# every 15 min, so a Termux killed by MIUI comes back without a reboot.
"${SSH[@]}" 'termux-job-scheduler --job-id 4201 --script ~/.termux/boot/10-speaker \
  --period-ms 900000 --persisted true >/dev/null 2>&1 || echo "[install] watchdog job not registered"'
"${SSH[@]}" 'rm -f ~/homecal-speaker/run.pid; sh ~/.termux/boot/10-speaker'
sleep 5
"${SSH[@]}" 'tail -n 3 ~/.config/homecal-speaker/agent.log 2>/dev/null || tail -n 5 ~/.config/homecal-speaker/agent.out'
