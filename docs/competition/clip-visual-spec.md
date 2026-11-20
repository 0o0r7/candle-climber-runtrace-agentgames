# Clip visual spec — caption bar under the frame

**Decision (2026-11-20):** narration is withdrawn. The clips carry the real gameplay
audio and a graphic caption bar below the frame. This file replaces the narration
requirements in `caption-pipeline.md`; the Super Z handoff documents are historical.

Why the simpler option is the stronger one:

- **The sound is part of the evidence.** The audio is synthesised by the engine itself
  (`src/game/cc/sound.ts`, WebAudio oscillators, no audio assets). A clip that plays the
  engine's own output is showing the artifact; a clip with a voice reading a claim about
  the artifact is showing a second artifact.
- **Autoplay is muted.** On the timeline a viewer meets these clips silent. Burned-in
  text was always the channel that carries the claim — narration was paying for a
  channel most viewers never hear.
- **It removes a whole risk chain**: no synthesis licence, no watermark question, no
  biometric voice sample, no per-cue audio manifest, no A/V sync check. Every one of
  those was a way for the entry to fail for reasons unrelated to the product.
- **Shorter path to publication.** The critical path is now capture → bar → publish.

## Frame geometry

Pad, never overlay. Nothing of the game is cropped and nothing of the game is covered.

| | Value |
| --- | --- |
| Canvas | 1280 × 800 |
| Game viewport | 1280 × 720, top-aligned at y = 0 |
| Caption bar | 1280 × 80, y = 720 |
| Accent rule | 3 px, top edge of the bar, one colour only |
| Bottom safe margin | 24 px inside the bar (the player's progress bar sits here) |

If a platform forces 16:9, shrink the game to 1280 × 640 and keep the 80 px bar — never
crop the game and never overlay the bar on it.

## Bar design

- **Opaque fill, not translucent.** Contrast is then guaranteed by construction and
  cannot fail over a busy candle chart. A dark neutral fill with the accent rule is
  enough; the bar is a caption surface, not a design element competing with the game.
- **One bar height, one palette, one type size across all six clips.** A viewer who sees
  two clips in a thread should recognise them as one series before reading a word.
- **Left label:** `03/06` in the bar's left padding, in the accent colour, at the same
  size as body text. It gives series identity and lets a reviewer navigate the thread.
- **Body text:** the cue text, ≤ 2 lines, ~44 characters per line at 1280 width, set in
  the app's own sans family. No fade-in, no motion — a hard cut at the cue boundary.
- **No logo, no URL, no handle** in the bar. The clip's job is one claim; the closing
  clip carries the repository link on screen.

## Captions and the SRT

Both come from the same cue list, so they cannot disagree. The burned-in bar is for the
muted viewer; the SRT track is for the accessibility and search path. Same text, same
boundaries, same source file.

## Audio

- Keep the engine's own audio at a consistent level across all six clips. No music, no
  sound effects added in post — either would be a licence and a claim we do not need.
- **Open technical risk:** Playwright's `recordVideo` writes a video-only file. Getting
  the gameplay audio into the clip needs a different capture path — an in-page
  `MediaRecorder` fed by `canvas.captureStream()` plus a `MediaStreamAudioDestinationNode`
  on the engine's master gain. This is unverified here and is the next thing to test.
- **Second risk, same test:** the engine's `AudioContext` starts suspended and resumes
  only inside a user gesture (`unlockAudio()`). A headless run that never produces a
  trusted click records silence. If both risks hold, the capture change is small; if
  they do not, the clips ship silent — which is honest, and what most viewers would
  experience anyway.
