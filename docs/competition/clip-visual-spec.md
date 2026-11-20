# Clip visual spec — caption bar under the frame

**Decision (2026-11-20):** narration is withdrawn. The clips carry the product's own
picture and a graphic caption bar below the frame. This file is the shipped spec;
`caption-pipeline.md` keeps the record of the audio path that was evaluated and not
taken, and the Super Z handoff documents are historical.

Why the simpler option is the stronger one:

- **The picture is the evidence.** Every frame is the running application — the
  RunTrace showcase page, the console panel it fills in, or the live endpoint response.
  Nothing is mocked, and no clip shows a rendering of a claim about the product.
- **Autoplay is muted.** On the timeline a viewer meets these clips silent. Burned-in
  text was always the channel that carries the claim — narration was paying for a
  channel most viewers never hear.
- **It removes a whole risk chain**: no synthesis licence, no watermark question, no
  biometric voice sample, no per-cue audio manifest, no A/V sync check.

## Frame geometry

Pad, never overlay. Nothing of the product is cropped and nothing is covered.

| | Value |
| --- | --- |
| Canvas | 1280 × 800 |
| Product viewport | 1280 × 720, top-aligned at y = 0 |
| Caption bar | 1280 × 80, y = 720 |
| Accent rule | 3 px, top edge of the bar, `#F0B429`, one colour only |
| Text area | left 76 px, right 24 px, bottom margin 12 px |

The game canvas is never scaled up past its own render resolution: at 1280 × 664 the
engine draws a 1200 × 720 playfield letterboxed inside the canvas, and in the split
layout the canvas sits at its native 780 × 468.

## Composition per clip

One claim per clip, and the composition follows the claim:

| Clip | Composition |
| --- | --- |
| 01 ticks | HUD strip (stage label + live `SCORE / CANDLES / TICK`) over a full-width game canvas |
| 02 signed | game canvas left, the `MARKET TERRAIN` and `RECORDER` rows right |
| 03 replay | game canvas replaying the trace left, the `SERVER REPLAY` verdict row right |
| 04 flag | console panel only, `SERVER REPLAY` (`ACCEPT`) above `TAMPER CHECK` (`FLAG`), centred |
| 05 receipt | console panel only, `SHAREABLE RECEIPT` above `RE-VERIFY STORED TRACE`, centred |
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

## Audio

The six clips ship silent. Playwright's `recordVideo` writes a video-only file, and
the engine's `AudioContext` starts suspended until a user gesture resumes it, so a
headless run records silence. A silent clip is acceptable and honest — the bar and the
thread text carry the claim; an invented audio bed would not be. The SRT still ships,
because the text is real even when the track has no voice.
