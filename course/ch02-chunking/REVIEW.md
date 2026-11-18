# Chapter 2 review

Built in the same style as Chapter 1 (one real example worked through, ending on the real app). Voice: Kokoro am_michael 0.95, loudness-normalized to about -16 LUFS (Chapter 1 was -20).
Real data: postmortem paragraph lengths 47/141/208/102/204; packing 47→190→400→504, then 710 > 600; the 100-character look-back starts "rco Silva…" and resolves to "Hana Sato renewed the certificate." (34); chunk 2 = 240; naive 300-character cut lands at "Ledg|er"; the real chunker at 200/600/2000 gives 4/2/1 chunks (190,240,148,230 / 504,240 / 710); PIPELINE_VERSION "bge-small-q8|chunk-600-100b|graph-v2"; Sources page chunk counts.
Illustrative (labelled): the 40-page manual in s02, the over-600 paragraph bar and the word example in s08, and fingerprints computed from the file text (the app hashes parsed text, so the real stored hash may differ).
Check: 0 errors. Kept warnings: dead-stretch holds while the narration explains a finished diagram (lesson pacing), and small labels on moving chunk cards.
Not heard: the voice was generated and measured, but nobody listened to it. No music bed.
Weakest shot: s10 (fingerprint) is abstract. With more time: show a real re-ingest trace with the "skipped: unchanged" message.
