#!/data/data/com.termux/files/usr/bin/sh
# Keep the HomeCal speaker agent running (Phase 24). The agent re-execs itself
# in place when it updates, so this loop only sees crashes and kills.
#
# Crash rollback: if a freshly updated agent dies within 60 s of starting three
# times in a row and the previous version is still on disk, put the previous
# version back and leave a marker naming the bad one. The agent reads the
# marker on start, refuses that version from then on, and reports the rollback.
cd "$HOME/homecal-speaker" || exit 1
CONF="$HOME/.config/homecal-speaker"
mkdir -p "$CONF"
echo $$ > run.pid
fails=0
while true; do
  started=$(date +%s)
  python agent.py >> "$CONF/agent.out" 2>&1
  rc=$?
  ran=$(( $(date +%s) - started ))
  echo "$(date '+%F %T') agent exited rc=$rc after ${ran}s" >> "$CONF/agent.out"
  if [ "$ran" -lt 60 ]; then fails=$((fails + 1)); else fails=0; fi
  if [ "$fails" -ge 3 ] && [ -f agent.py.prev ]; then
    bad=$(sed -n 's/^VERSION = "\(.*\)"/\1/p' agent.py | head -n 1)
    mv agent.py agent.py.bad
    mv agent.py.prev agent.py
    printf '%s' "$bad" > "$CONF/rolled_back"
    echo "$(date '+%F %T') rolled back from $bad" >> "$CONF/agent.out"
    fails=0
  fi
  sleep 5
done
