# Chapter 2: Chunking (SPEC)

GOAL:    A beginner can chunk the 711-character postmortem by hand the way this project does (paragraphs, a 600-character running total, a one-sentence overlap) and explain the size trade-off.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, narrated (Kokoro am_michael 0.95, loudnorm -16 LUFS). 331 s, 13 scenes timed by voice/cues.json.
LOOK:    Same system as Chapter 1. Ground #FFFFFF; panel #F4F4F5; hairline #E4E4E7; ink #09090B; muted #71717A.
         Accent #2563EB = the chunk being built, the overlap and the right answer; #DC2626 = a bad cut and over budget.
         Inter 700 76-120px display, Inter 500 30-40px body, JetBrains Mono for counts and equations. Cards: radius 14, 1.5px hairline, shadow 0 12 32 rgba(9,9,11,.08).
         s12 floods to the app's dark for the real Sources screenshot.
OBJECTS: the postmortem page, set in its five real paragraphs; a dashed cut line (scissors path); a chunk "box" with a 600-character capacity bar (2 px per character);
         paragraph blocks whose widths are their real lengths; a fingerprint (the first 12 hex characters of a SHA-256).
MOTION:  as Chapter 1 (expo.out entries, power3.inOut moves, blur swaps). Counters tick through real values only.
SHOTS:   s01 title → 11 chunks → the page; s02 size problem (drowned sentence, token overflow, orphan fragment); s03 characters, 600/100;
         s04 naive 300 cut through "Ledg|er"; s05 split into 5 paragraphs + lengths; s06 packing 47→190→400→504, 710>600 rejected;
         s07 the 100-character look-back slides to the "Hana Sato…" sentence, 34+2+204=240; s08 the long-paragraph rule and dropping a tiny tail;
         s09 real chunker at 200/600/2000 = 4/2/1 chunks; s10 fingerprint with version label 600 vs 800; s11 where chunking sits in ingestion;
         s12 the real Sources page; s13 recap + next chapter.
BANNED:  as Chapter 1.
QA:      every count and equation matches the real chunker output (scratchpad runs); fingerprints are labelled as computed from the file text.
