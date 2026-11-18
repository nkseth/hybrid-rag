# Builds compositions/*.html and index.html from src/*.html + voice/cues.json.
# In src files, {c3} = start of phrase 3 of that scene, {c3+1.2} adds an offset, {e3} = end of phrase 3, {D} = scene duration.
# Re-run after changing the script/voice:  python3 build.py
import json, re
from pathlib import Path
here = Path(__file__).parent
cues = json.loads((here / "voice/cues.json").read_text())
(here / "compositions").mkdir(exist_ok=True)

def fill(src, cue):
    def sub(m):
        kind, idx, off = m.group(1) or "D", m.group(2), float(m.group(4) or 0)
        if kind == "D": base = cue["duration"]
        else: base = cue["phrases"][int(idx)]["start" if kind == "c" else "end"]
        return f"{base + off:.3f}".rstrip("0").rstrip(".")
    return re.sub(r"\{(?:([ce])(\d+)|(D))([+-][\d.]+)?\}", sub, src)

hosts, audios, t = [], [], 0.0
for sid, cue in cues.items():
    src = here / "src" / f"{sid}.html"
    if not src.exists(): continue
    (here / "compositions" / f"{sid}.html").write_text(fill(src.read_text(), cue))
    d = cue["duration"]
    hosts.append(f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{t:.2f}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>')
    audios.append(f'      <audio id="vo-{sid}" class="clip" src="assets/vo-{sid}.wav" data-start="{t:.2f}" data-duration="{d}" data-track-index="2" data-volume="1"></audio>')
    t += d

index = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #ffffff; }}
      #bg {{ position: absolute; inset: 0; background: #ffffff; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{t:.2f}" data-width="1920" data-height="1080">
      <div id="bg"></div>
{chr(10).join(hosts)}
{chr(10).join(audios)}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
(here / "index.html").write_text(index)
print(f"built {len(hosts)} scenes, {t:.1f}s")
