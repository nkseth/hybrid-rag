# Chapter 1 review

Creative calls: Storyline B (One Question's Journey). The spine is the real eval question "What caused the billing delay in March 2026?". It ends on the real Playground screenshot. Not built: A (Riya's First Day) and C (Follow the Citation), both in STORYLINES.md.
Voice: Kokoro am_michael at 0.95, about 5.5 min. Timing comes from voice/cues.json. Edit src/*.html, then run `python3 build.py`. compositions/ and index.html are generated.

Real data on screen: the 7 seed doc titles, 11 chunks (2,2,2,2,1,1,1), the top-6 fused RRF scores and order, ranks vector #1 / keyword #1 / graph #5, the actual SYSTEM prompt, 815 input tokens, the actual answer, and grounded 100%.
Illustrative (and labelled as such): the made-up answer in s01, the next-word probabilities in s02, and the bar lengths of the 5 chunks outside the top 6 in s06.
Caveat: the live DB also holds an uploaded PDF, so the screenshot shows 19 vector candidates, while the narration says 11 chunks (the sample corpus only).

Measured: check passes with 0 errors. Kept warnings: small labels on chunks and chips while they fly (in motion, not for reading); the s10 cost formula holds about 4.1 s while the narration reads it.
Looked at: beat sheets, seams, phone sheet. Not heard: the voice was generated and its loudness measured, but nobody listened to it.
No music bed (no music source on this machine).
Weakest shot: s10 (the "why not everything" scene) is the most text-heavy. With more time: a real context-window animation per reason, plus sound effects on the stamps and snaps.
