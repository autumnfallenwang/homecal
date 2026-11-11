#!/usr/bin/env python3
"""Freeze agent.py as releases/agent-<VERSION>.py (Phase 24).

The API image serves every file in releases/; a device runs the version pinned
for it, or the latest. A release is immutable: re-running with an unchanged
agent.py is a no-op, and changing agent.py without bumping VERSION is refused.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    src = os.path.join(HERE, "agent.py")
    with open(src, "rb") as f:
        code = f.read()
    m = re.search(rb'^VERSION = "(\d+\.\d+\.\d+)"', code, re.M)
    if not m:
        sys.exit("agent.py has no VERSION")
    version = m.group(1).decode()
    dst = os.path.join(HERE, "releases", f"agent-{version}.py")
    if os.path.exists(dst):
        with open(dst, "rb") as f:
            if f.read() == code:
                print(f"release {version} already up to date")
                return
        sys.exit(f"release {version} exists and differs — bump VERSION in agent.py")
    with open(dst, "wb") as f:
        f.write(code)
    print(f"wrote releases/agent-{version}.py")


if __name__ == "__main__":
    main()
