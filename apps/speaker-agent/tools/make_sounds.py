#!/usr/bin/env python3
"""Write the built-in sounds into sounds/ for the API to serve (Phase 24).

Same bytes the agent generates as its offline fallback, so a phone that never
downloaded a sound still rings with the identical tone.
"""
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from agent import render_builtin  # noqa: E402

for name in ("beeps", "chime"):
    path = os.path.join(HERE, "sounds", f"{name}.wav")
    with open(path, "wb") as f:
        f.write(render_builtin(name))
    print(f"wrote sounds/{name}.wav")
