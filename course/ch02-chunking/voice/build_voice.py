# Generates one narration WAV per scene from voice/script.json, plus voice/cues.json
# (start/end seconds of every phrase, local to its scene). Run with the course venv python.
import json, sys, numpy as np, soundfile as sf
from pathlib import Path
from kokoro_onnx import Kokoro
C = Path.home() / ".cache/hyperframes/tts"
k = Kokoro(str(C / "models/kokoro-v1.0.onnx"), str(C / "voices/voices-v1.0.bin"))
VOICE, SPEED, LEAD, GAP, TAIL = "am_michael", 0.95, 0.6, 0.45, 1.0  # seconds
here = Path(__file__).parent
script = json.loads((here / "script.json").read_text())
only = set(sys.argv[1:])
cues = json.loads((here / "cues.json").read_text()) if (here / "cues.json").exists() else {}
for sid, phrases in script.items():
    if only and sid not in only: continue
    parts, t, sc, sr = [], LEAD, [], 24000
    for p in phrases:
        a, sr = k.create(p, voice=VOICE, speed=SPEED, lang="en-us")
        d = len(a) / sr
        sc.append({"text": p, "start": round(t, 3), "end": round(t + d, 3)})
        parts += [a, np.zeros(int(GAP * sr), dtype=a.dtype)]
        t += d + GAP
    audio = np.concatenate([np.zeros(int(LEAD * sr), dtype=parts[0].dtype)] + parts + [np.zeros(int(TAIL * sr), dtype=parts[0].dtype)])
    sf.write(here.parent / "assets" / f"vo-{sid}.wav", audio, sr)
    cues[sid] = {"duration": round(len(audio) / sr, 2), "phrases": sc}
    print(sid, cues[sid]["duration"])
(here / "cues.json").write_text(json.dumps(cues, indent=1))
