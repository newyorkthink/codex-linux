#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-launcher.py PATH/TO/start.sh.template")

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = 'ELECTRON_ARGS=("--class=$CODEX_LINUX_APP_ID")'
new = 'ELECTRON_ARGS=("--class=$CODEX_LINUX_APP_ID" "--app-id=$CODEX_LINUX_APP_ID")'

if new in text:
    raise SystemExit(0)
if text.count(old) != 1:
    raise SystemExit(
        f"expected exactly one current Electron identity line in {path}, found {text.count(old)}"
    )

path.write_text(text.replace(old, new), encoding="utf-8")
