# Clip visual spec — caption bar under the frame

**Decision (2026-11-20):** narration is withdrawn. The clips carry the product's own
picture and a graphic caption bar below the frame. This file is the shipped spec;
`caption-pipeline.md` keeps the record of the audio path that was evaluated and not
taken, and the Super Z handoff documents are historical.

Why the simpler option is the stronger one:

- **The picture is the evidence.** Every frame is the running application — the
  RunTrace showcase page, the console panel it fills in, or the live endpoint response.
  Nothing is mocked, and no clip shows a rendering of a claim about the product.
- **Autoplay is muted.** On the timeline a viewer meets these clips silent, so the
  burned-in text is the channel that carries the claim — narration was paying for a
  channel most viewers never hear.
- **Sound is a score, not a voice** (owner review, 2026-11-20). Each clip carries a
  synthesised underscore generated from its own cue timeline — see *Audio* below. It
  is music with no speech, so it removes the whole risk chain narration carried: no
  synthesis licence, no watermark question, no biometric voice sample, no per-cue
  audio manifest, no A/V sync check.

## Frame geometry

Pad, never overlay. Nothing of the product is cropped and nothing is covered.

| | Value |
| --- | --- |
| Canvas | 1280 × 800 |
| Product viewport | 1280 × 720, top-aligned at y = 0 |
| Caption bar | 1280 × 80, y = 720 |
| Accent rule | 3 px, top edge of the bar, `#F0B429`, one colour only |
| Text area | left 76 px, right 24 px, bottom margin 12 px |

The game canvas is never scaled up past its own render resolution, and its box always
keeps the engine's 5:3 ratio so nothing is letterboxed or cropped: `1106 × 664`
(scale 1.38) under the HUD in clip 01, and the native `800 × 480` (scale 1.0) on the
left in clips 02 and 03.

## Composition per clip

One claim per clip, and the composition follows the claim:

| Clip | Composition |
| --- | --- |
| 01 ticks | HUD strip (stage label + live `SCORE / CANDLES / TICK`) over a full-width game canvas |
| 02 signed | game canvas left, the `MARKET TERRAIN` and `RECORDER` rows right |
| 03 replay | game canvas replaying the trace left, the `SERVER REPLAY` verdict row right |
| 04 flag | console panel full width, `SERVER REPLAY` (`ACCEPT`) at the top and `TAMPER CHECK` (`FLAG`) at the bottom |
| 05 receipt | the product's own receipt page: the certificate, then a live `RE-VERIFY NOW` and the verdict it returns |
| 06 endpoint | the real unsigned request and its real `401` response, on a terminal card |

Rows the clip does not talk about are hidden, so the frame states one claim. The
hidden rows are the page's own DOM, not edited content.

## Bar design

- **Opaque fill, not translucent.** Contrast is then guaranteed by construction and
  cannot fail over a busy candle chart.
- **One bar height, one palette, one type size across all six clips.** A viewer who
  sees two clips in a thread should recognise them as one series before reading a word.
- **Left label:** `03/06` in the bar's left padding, in the accent colour, 22 px bold.
  It gives series identity and lets a reviewer navigate the thread.
- **Body text:** ONE line, 42 px, ≤ 44 characters, set in DejaVu Sans. 42 px is a
  legibility floor, not a taste: at 1280 wide, a phone renders it at ~13 px. That size
  also means a second line does not fit inside an 80 px bar, and
  `validateCues` rejects one (`barLineBudget()`).
- **No fade-in, no motion** — a hard cut at the cue boundary.
- **No logo, no URL, no handle** in the bar. The clip's job is one claim.

## Captions and the SRT

Both come from the same cue list, so they cannot disagree. The burned-in bar is for
the muted viewer; the SRT track beside each file is for the accessibility and search
path. Same text, same boundaries, same source file (`captures/cues/clip-NN.json`).

## Typing reveal

Panel rows are not on screen for the whole clip: each row types itself in on the cue
boundary it belongs to (`clip-NN.json` → `tickIn`), over 1.4 s, and it types **in
place** — every character is laid out before the first one is shown, so the frame never
reflows and the final text is where the design put it. The reveal is staged on the
page's own DOM; no text is rewritten, invented or moved.

Clip 03 is 7.2 s rather than 15 s on purpose: the replay is the state that carries its
evidence, and the showcase starts a new take the moment that replay ends. Clip 04 has
no canvas, so the page clock is frozen at the evidence boundary instead of letting the
panel reset to `WAIT` mid-clip. Both facts are disclosed in the production record.

## Audio

The clips carry a **synthesised score**, generated from their own cue timeline by
`scripts/clip-audio.ts` (pad on a four-chord loop, one bass note per chord, a quarter-
second pulse, and one accent on every cue boundary — a low thud on a flagged cue). It
is deterministic: the same cue file always produces the same waveform, which is what
lets the track be rebuilt from the repository instead of shipped as an opaque asset.

What it is not: it is **not** the engine's own sound. `sfx` in `src/game/cc/sound.ts`
needs a user gesture before its `AudioContext` leaves `suspended`, and Playwright's
`recordVideo` writes a video-only file, so a headless capture cannot carry game audio.
The score is a bed under the claim, not a recording of the run, and nothing in the
thread or the packet describes it as the latter.

The SRT still ships beside every file, and the caption bar still carries the claim on
its own: the score is additive, so a muted viewer loses nothing.
