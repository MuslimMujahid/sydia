#!/usr/bin/env python3
"""Place SFX at exact beat/VO times from each frame's `- sfx_plan:` line in STORYBOARD.md.

Files come from the bundled media-use SFX library (Pixabay Content License, see assets/sfx/CREDITS.md)
and are written to audio_meta.json as host cues (`"source": "host"`), so audio passes keep them.

usage: python3 scripts/place-sfx.py <bundled-sfx-dir>
"""
import json
import re
import shutil
import sys
from pathlib import Path

lib = Path(sys.argv[1])
manifest = json.load(open(lib / "manifest.json"))
out = Path("assets/sfx")
out.mkdir(parents=True, exist_ok=True)
shutil.copy(lib / "CREDITS.md", out / "CREDITS.md")

VOLUME = {"pop": 0.28, "ping": 0.3, "click": 0.35, "click-soft": 0.35, "whoosh-short": 0.3, "whoosh": 0.32,
          "impact-bass-1": 0.5, "impact-bass-2": 0.45, "chime": 0.3, "sparkle": 0.3, "typing": 0.25,
          "error": 0.32, "notification": 0.28, "whoosh-cinematic": 0.22, "key-press": 0.3}
EXTRA = {}  # v2: every cue is in the storyboard sfx_plan

cues = []
frame = None
for line in open("STORYBOARD.md"):
    h = re.match(r"^## Frame (\d+)", line)
    if h:
        frame = int(h.group(1))
        continue
    m = re.match(r"^- sfx_plan:\s*(.*)$", line)
    if m and frame:
        for tok in m.group(1).split("·"):
            name, at = tok.strip().split("@")
            cues.append((frame, name.strip(), float(at)))
for f, extra in EXTRA.items():
    cues += [(f, n, t) for n, t in extra]

sfx = []
for f, name, at in sorted(cues, key=lambda c: (c[0], c[2])):
    src = lib / f"{name}.mp3"
    shutil.copy(src, out / src.name)
    sfx.append({"frame": f, "file": f"assets/sfx/{src.name}", "offset_s": at,
                "duration_s": manifest[name]["duration"], "volume": VOLUME.get(name, 0.3),
                "source": "host", "name": name})

meta = json.load(open("audio_meta.json"))
meta["sfx"] = sfx
json.dump(meta, open("audio_meta.json", "w"), indent=2)
print(f"placed {len(sfx)} sfx cues")
