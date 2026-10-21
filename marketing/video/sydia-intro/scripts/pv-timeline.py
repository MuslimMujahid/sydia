#!/usr/bin/env python3
"""v2 (user storyboard) timeline: scene durations in whole music bars, user-recorded VO placed
0.5s into each scene, and a bar-aligned music bed that ends on the track's natural drop.

usage: python3 scripts/pv-timeline.py .hyperframes/audiomap-bgm.json
writes audio_meta.json (v2) and prints the scene table (also saved to .hyperframes/pv-timeline.json)
"""
import json
import subprocess
import sys

amap = json.load(open(sys.argv[1]))
DB = amap["grid"]["downbeats_sec"]
BAR = (DB[-1] - DB[0]) / (len(DB) - 1)
ORIGIN = DB[0]
LOOP_A, LOOP_B, OUTRO_END = DB[0], DB[8], 27.0
LEAD = 0.5

# scene: (id, slug, bars, vo file or None); scene 1 also carries the 3.69s musical intro
SCENES = [
    (1, "01-problem", 4, "scene_1.mp3"),
    (2, "02-intro", 5, "scene_2.mp3"),
    (3, "03-action", 12, "scene_3.mp3"),
    (4, "04-remembers", 8, "scene_4.mp3"),
    (5, "05-knowledge", 14, "scene_5.mp3"),
    (6, "06-proactive", 5, "scene_6.mp3"),
    (7, "07-messaging", 4, "scene_7.mp3"),
    (8, "08-bento", 5, None),
    (9, "09-closing", 6, "scene_9.mp3"),
]


def dur(path):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())


rows, t = [], 0.0
for sid, slug, bars, vo in SCENES:
    start = t
    end = (ORIGIN if sid == 1 else start) + bars * BAR
    row = {"scene": sid, "slug": slug, "start": round(start, 3), "end": round(end, 3),
           "duration": round(end - start, 3), "bars": bars}
    if vo:
        src = f"assets/pv/{vo}"
        d = dur(src)
        out = f"assets/voice-pv/{sid:02d}.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-af",
                        f"adelay={int(LEAD * 1000)}:all=1", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out],
                       check=True)
        row.update({"vo": out, "vo_start_local": LEAD, "vo_end_local": round(LEAD + d, 3)})
        assert LEAD + d <= row["duration"], f"scene {sid}: VO {d:.2f}s does not fit {row['duration']:.2f}s"
    rows.append(row)
    t = end
TOTAL = t

L = LOOP_B - LOOP_A
best = None
for n in range(0, 12):
    for m in range(0, 8):
        bed = OUTRO_END + n * L + (DB[m] - DB[0])
        if bed - 1.4 >= TOTAL and (best is None or bed < best[0]):
            best = (bed, n, m)
bed_len, n, m = best
segments = [(0.0, LOOP_B)] + [(LOOP_A, LOOP_B)] * n + ([(LOOP_A, DB[m])] if m else []) + [(LOOP_B, OUTRO_END)]
src = "assets/bgm/track.mp3"
fil, parts = [], []
for i, (a, b) in enumerate(segments):
    fil.append(f"[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={b - a - 0.012:.4f}:d=0.012[s{i}]")
    parts.append(f"[s{i}]")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-filter_complex",
                ";".join(fil) + ";" + "".join(parts) + f"concat=n={len(segments)}:v=0:a=1[out]",
                "-map", "[out]", "-ar", "44100", "-b:a", "256k", "assets/bgm/bed-pv.mp3"], check=True)
# stretch the last scene so the film ends ~1.4s before the bed's silent tail (on the drop)
rows[-1]["end"] = round(bed_len - 1.4, 3)
rows[-1]["duration"] = round(rows[-1]["end"] - rows[-1]["start"], 3)
TOTAL = rows[-1]["end"]

old = json.load(open("audio_meta.json"))
meta = {
    "voices": [{"frame": r["scene"], "path": r["vo"], "duration_s": round(r["vo_end_local"], 3),
                "source": "user-recorded (PV Storyboard)"} for r in rows if "vo" in r],
    "bgm": {"path": "assets/bgm/bed-pv.mp3", "source_path": src, "volume": 0.3,
            "duration_s": round(bed_len, 3), "bpm": amap["tempo"]["bpm"],
            "arrangement": [[round(a, 3), round(b, 3)] for a, b in segments],
            "query": old.get("bgm", {}).get("query")},
    "sfx": [],
}
json.dump(meta, open("audio_meta.json", "w"), indent=2)
json.dump({"bar": BAR, "origin": ORIGIN, "total": TOTAL, "scenes": rows}, open(".hyperframes/pv-timeline.json", "w"), indent=2)
print(f"bar {BAR:.4f}s · bed {bed_len:.2f}s (n={n}, m={m}) · film {TOTAL:.2f}s")
for r in rows:
    print(f"  S{r['scene']} {r['slug']:<14} {r['start']:7.3f} → {r['end']:7.3f}  ({r['duration']:6.3f}s)  VO {r.get('vo_start_local','—')}–{r.get('vo_end_local','—')}")
