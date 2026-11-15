# Game Off 2026 entry — Thoughtcrime Studios

A browser narrative game made for GitHub Game Off 2026. The theme is SHIFT.

You are the night keeper at a barrier gate on a fog-bound causeway. This
afternoon the day keeper opened the gate against the rule and let a
courier cross. The courier's horse came back alone. The auditors arrive
at dawn, and they want one thing: the outgoing log, written by you.

Read the day log. Question the people who come to the gate in the night.
Then write what the record says, knowing that what you write decides
who carries it. About twenty minutes, played entirely at a desk, in
your browser.

## Play it

Open `dist/index.html` in a browser, or serve the folder with any
static file server and open `index.html`. No build step is needed to
play the shipped build in `dist/`.

## Source layout

- `src/logic.js` — the whole game as data and a small state machine:
  the script, the documents, the dawn writing, and the ending rules.
  Pure JavaScript, no DOM, tested in Node.
- `src/main.js` and `src/style.css` — the desk interface.
- `src/audio.js` — the score, synthesized live with WebAudio. Plain
  triads, a tune you can hum, no samples.
- `src/telemetry.js` — the studio's anonymous play-statistics bundle,
  generated from the studio telemetry project. It sends counts, never
  names, and the game has an opt-out in the top bar.
- `tests/run-tests.js` — the logic suite. Run it with
  `node tests/run-tests.js`.
- `tools/build.js` — inlines the source into the single-file build at
  `dist/index.html`. Run it with `node tools/build.js`.

## How it was made

Designed, written, illustrated, and composed with AI assistance, under
a human director who sets the rules and approves what ships. That is
also what we will say on the submission form, because it is true.

## Rights

Copyright 2026 Thoughtcrime Studios. The source is public so the jam
can see how the game is made. All rights reserved unless a file says
otherwise.
