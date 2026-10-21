#!/usr/bin/env python3
"""Beat-snap pass for the Sydia intro ("cut to the beat" customization in BRIEF.md).

1. Reads real voice durations from audio_meta.json.
2. Snaps every frame boundary UP to the music's half-bar grid (section starts to a full bar),
   never shortening a frame below its voice + breathing room.
3. Builds a bar-aligned music bed from the 29s catalog loop (intro+phrases, looped phrases,
   outro) whose natural ending lands on the final frame, and points audio_meta.json at it.
4. Pads frame 11's voice so the closing line starts on a downbeat after the headline callback.
5. Writes the snapped durations into STORYBOARD.md (`- duration:` per frame).

usage: python3 scripts/beat-snap.py <audiomap.json>
"""
import json
import math
import re
import subprocess
import sys

AUDIOMAP = sys.argv[1]
amap = json.load(open(AUDIOMAP))
DB = amap["grid"]["downbeats_sec"]          # source downbeats 3.692 … 24.567
BAR = (DB[-1] - DB[0]) / (len(DB) - 1)       # ≈ 2.0875 s
HALF = BAR / 2
ORIGIN = DB[0]                               # composite grid phase (loops are bar-aligned)
LOOP_A, LOOP_B = DB[0], DB[8]                # 8-bar loop body: 3.692 → 20.387
OUTRO_END = 27.0                             # natural end of the track (silence after)

meta = json.load(open("audio_meta.json"))
vo = {v["frame"]: v["duration_s"] for v in meta["voices"]}

# minimum on-screen time per frame: voice + breathing, or the visual beat's own need
need = {
    1: vo[1] + 0.6,
    2: 4.0,              # headline on the surge, music only
    3: vo[3] + 0.5,
    4: vo[4] + 0.5,
    5: vo[5] + 0.7,
    6: vo[6] + 0.9,
    7: vo[7] + 0.5,
    8: 9.0,              # reminder VO + three music-only cards
    9: vo[9] + 1.6,
    10: vo[10] + 1.0,
    11: 7.7,             # callback (music) + closing VO + logo hold
}
FULL_BAR_STARTS = {2, 4}  # section boundaries start on a downbeat


def snap_up(t, step):
    j = math.ceil((t - ORIGIN) / step - 1e-6)
    return ORIGIN + j * step


starts, ends = {}, {}
t = 0.0
for f in range(1, 12):
    starts[f] = t
    end = snap_up(t + need[f], HALF)
    if (f + 1) in FULL_BAR_STARTS:
        end = snap_up(end, BAR)
    ends[f] = end
    t = end
total_min = t

# music bed = A [0, LOOP_B) + n·L + m bars of L + O [LOOP_B, OUTRO_END)
segs_base = LOOP_B + (OUTRO_END - LOOP_B)  # = OUTRO_END
L = LOOP_B - LOOP_A
best = None
for n in range(0, 6):
    for m in range(0, 8):
        bed = OUTRO_END + n * L + (DB[m] - DB[0])
        # the track's drop (hard stop at 25.0 in source) should fall at/after the last VO + hold
        if bed - 1.6 >= total_min and (best is None or bed < best[0]):
            best = (bed, n, m)
bed_len, n, m = best
# final frame stretches so the film ends ~1.6s before the bed's silent tail
ends[11] = round(bed_len - 1.6, 3)
TOTAL = ends[11]

segments = [(0.0, LOOP_B)] + [(LOOP_A, LOOP_B)] * n
if m:
    segments.append((LOOP_A, DB[m]))
segments.append((LOOP_B, OUTRO_END))

# render bed: exact trims, 12ms fades at every seam to avoid clicks
src = meta["bgm"]["path"]
parts, filters = [], []
for i, (a, b) in enumerate(segments):
    fade = f"afade=t=in:d=0.012,afade=t=out:st={b - a - 0.012:.4f}:d=0.012"
    filters.append(f"[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS,{fade}[s{i}]")
    parts.append(f"[s{i}]")
fc = ";".join(filters) + ";" + "".join(parts) + f"concat=n={len(segments)}:v=0:a=1[out]"
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-filter_complex", fc,
     "-map", "[out]", "-ar", "44100", "-b:a", "256k", "assets/bgm/bed.mp3"],
    check=True,
)

# frame 11 voice: start the line on the first downbeat ≥ 1.6s into the frame
f11_start = starts[11]
db_after = snap_up(f11_start + 1.6, BAR)
lead = max(0.0, db_after - f11_start - 0.30)  # the wav carries ~0.3s of its own lead silence
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", "assets/voice/11.raw.wav",
     "-af", f"adelay={int(lead * 1000)}:all=1", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le",
     "assets/voice/11.wav"],
    check=True,
)
for v in meta["voices"]:
    if v["frame"] == 11:
        if "words_raw" not in v:
            v["words_raw"] = v["words"]
        v["words"] = [dict(w, start=round(w["start"] + lead, 3), end=round(w["end"] + lead, 3)) for w in v["words_raw"]]
        v["duration_s"] = round(v.get("raw_duration_s", v["duration_s"]) + lead, 3)
        v["raw_duration_s"] = v.get("raw_duration_s", v["duration_s"] - lead)
        v["lead_s"] = round(lead, 3)
meta["bgm"] = {
    "path": "assets/bgm/bed.mp3",
    "source_path": src,
    "volume": meta["bgm"].get("volume", 0.12),
    "query": meta["bgm"].get("query"),
    "duration_s": round(bed_len, 3),
    "bpm": amap["tempo"]["bpm"],
    "arrangement": [[round(a, 3), round(b, 3)] for a, b in segments],
}
json.dump(meta, open("audio_meta.json", "w"), indent=2)

# write durations into STORYBOARD.md
durs = {f: round(ends[f] - starts[f], 3) for f in starts}
lines = open("STORYBOARD.md").read().split("\n")
cur = None
for i, line in enumerate(lines):
    h = re.match(r"^#{2,3}\s+frame\s+(\d+)", line, re.I)
    if h:
        cur = int(h.group(1))
        continue
    if cur in durs and re.match(r"^\s*-\s+duration\s*:", line):
        lines[i] = f"- duration: {durs[cur]}s"
        durs.pop(cur)
open("STORYBOARD.md", "w").write("\n".join(lines))

print(f"bar {BAR:.4f}s · bed {bed_len:.2f}s (loops n={n}, +{m} bars) · film {TOTAL:.2f}s · f11 voice lead {lead:.2f}s")
for f in range(1, 12):
    print(f"  frame {f:2d}: {starts[f]:7.3f} → {ends[f]:7.3f}  ({ends[f] - starts[f]:.3f}s, need {need[f]:.2f})")
