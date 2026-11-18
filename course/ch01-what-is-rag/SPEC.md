# Chapter 1: What is RAG? (SPEC)

GOAL:    A beginner can explain, in their own words, why an AI needs retrieval and what R, A and G each do, using the billing-delay example.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, narrated (Kokoro am_michael, speed 0.95).
TIME:    330 s (13 scenes, timed by voice/cues.json; the voice is the clock). No music bed (no music source on this machine).

LOOK:    The project's own light UI as the medium.
         ground #FFFFFF flat, no texture; panel #F4F4F5; hairline #E4E4E7 1.5px; ink #09090B; muted ink #71717A.
         Meaning colours (only where that meaning is on screen): vector #2563EB, keyword #D97706, graph #0D9488 (from the app's rank chips);
         truth/citation accent #2563EB; wrong/made-up #DC2626 (s01, s02, s09 only).
         Display: Inter 700, 84px, tracking -0.03em. Body: Inter 400/500, 34-40px. Code and prompt: JetBrains Mono 400, 26-30px.
         Cards: radius 14px, 1.5px hairline, shadow 0 12px 32px rgba(9,9,11,.08). No gradients, no glow.
         s12 floods to the app's dark (#0A0A0A) for the real screenshot.

OBJECTS: chat window (title bar with 3 dots, bubbles: user right #09090B with white text, AI left #F4F4F5);
         document = white page 260x340 with a bold title line and grey text lines;
         chunk = small card 200x120 with 3 grey lines and an id;
         database = cylinder (ellipse top + body) 1.5px ink stroke;
         model = rounded block labelled "LLM" with a stack of thin lines (weights);
         prompt = monospace page with sections "rules / passages / question";
         stamp = red bordered rotated box, letter-spaced caps.

MOTION:  enter expo.out 0.7s; move power3.inOut 0.8s; exit power3.in 0.35s; camera power2.inOut 1.0s.
         Word reveals: blur 6px→0 + opacity, 0.07s stagger. Springs: back.out(1.4) for chips/stamps only.
         Every piece appears on the phrase that names it (cues). Nothing drifts after it lands.

SHOTS (scene : hero move : handoff):
  s01 hook: question card types in, chat window answers with an illustrative made-up line, red "MADE UP" stamp : blur swap
  s02 hallucination: model block fed by public-text stream up to a cutoff line; locked private doc; next-word probability bars; title "Hallucination" : the title word stays, rest exits
  s03 open book: two exam sheets, closed vs open, open wins and pages slide onto it : sheet zooms into the R box
  s04 R·A·G: three letters land big, each expands into its step label, then shrink into a pipeline row : pipeline row slides up
  s05 ingestion: 7 real doc titles → split into 11 chunks → drop into database : database becomes the search target
  s06 retrieval: question beam scores 11 chunks, bars, re-sort, top 6 kept, postmortem chunk at top; three method lenses with real ranks (vector #1, keyword #1, graph #5)
  s07 augment: the real prompt builds section by section (real SYSTEM rules, 6 passages, question)
  s08 generate: prompt flows into LLM, real answer types out, [1] links back to passage 1
  s09 compare: split screen, wrong vs right, collapses to the right one
  s10 why not everything / retrain: doc pile buries prompt; size/cost/focus; training loop vs RAG add
  s11 two phases: one diagram grows, phase 1 row then phase 2 row
  s12 real app: colour flood to dark, the real Playground screenshot, camera pans to answer, citation, rank chips, "grounded 100%"
  s13 recap: one line, then next-chapter card

BANNED:  dark void (outside s12), glow/particles, gradients, glass cards, three cards in a row, bullet slides,
         everything fading + sliding up, titles moving after they land, docked logo, corner labels, emoji.
QA:      each scene at its last cue + 1s must read as a finished frame; s06 ranks and s12 numbers match the real app.
