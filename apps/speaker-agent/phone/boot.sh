#!/data/data/com.termux/files/usr/bin/sh
# Installed as ~/.termux/boot/10-speaker. Run by Termux:Boot after a reboot,
# and every 15 min by the termux-job-scheduler watchdog (install.sh). Starts
# sshd and the agent loop if they aren't running; otherwise does nothing.
termux-wake-lock
pgrep -x sshd >/dev/null || sshd
PID_FILE="$HOME/homecal-speaker/run.pid"
if ! { [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; }; then
  nohup sh "$HOME/homecal-speaker/run.sh" >/dev/null 2>&1 &
fi
