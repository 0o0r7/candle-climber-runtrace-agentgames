# Video production standard

Non-negotiable rules for the six clips. Written before production, because the
previous attempt failed on exactly the items in the table below — not on taste, and not
on effort.

The standard is mechanical on purpose. Where a rule can be checked by a script, it is
enforced by one; where it cannot, it is checked against a fixed number, not an
impression.

## 1. What actually broke last time, and the rule that prevents it

| Failure | Cause | Rule |
| --- | --- | --- |
| Text drifted away from the image | The capture was variable-frame-rate (screen/`recordVideo` output is), while caption times were wall-clock guesses | **CFR first, ticks only.** Normalise the capture to constant 60 fps before anything else, and derive every boundary from the simulation tick log — never type a timestamp |
| Captions appeared late or early by a beat | Times were estimated by watching the clip | **Tick-derived boundaries.** `tickIn`/`tickOut` from the run log; a human never authors a time |
| Picture looked soft after export | The clip was re-encoded more than once, or scaled up from a small capture | **One encode, no upscale.** Capture at native 1280×720, encode exactly once, never scale the game area |
| Line breaks jumped between cues | The renderer wrapped text on its own | **Pre-broken lines.** Line breaks live in the cue file; the renderer is not allowed to wrap |
| Type looked different from the design | Font resolved by family name and substituted | **Pinned font file** mounted with `fontsdir`; the family name alone is never trusted |
| Text was hard to read over gameplay | Caption drawn on top of a busy chart | **Opaque bar below the frame.** Contrast is guaranteed by construction, not by a shadow |
| Nobody could prove it was in sync | No check existed | **Frames == ticks**, plus a boundary capture per cue (§4) |

## 2. Geometry

`1280 × 800`: the game at native `1280 × 720` top-aligned, an `80 px` opaque bar below
it, `24 px` safe margin inside the bar. The game is never cropped, never covered,
never scaled. Full spec: [clip-visual-spec.md](clip-visual-spec.md).

## 3. The pipeline, in order

1. **Capture** the run at 1280×720 with the tick log recording `tickIn`/`tickOut` for
   every claim. The log is the only source of caption timing.
2. **Author the cue file** (`captures/cues/clip-NN.json`): one entry per claim, text
   pre-broken to ≤ 2 lines of ≤ 44 characters, label `NN/06`.
3. **Validate** — `bun scripts/clip-cues.ts <cues.json> <out.srt>`. It refuses the file
   on any violation: line budget, overlap, non-monotonic cues, a label that is not
   `NN/NN`, or a bar palette below 4.5:1 contrast. A rejected file never reaches the
   renderer.
4. **Normalise to CFR** (step one of the render, never skipped).
5. **Render once**: pad to the frame, draw the bar and its accent rule, burn the SRT
   through libass with a pinned font, encode a single time.
6. **Gate** (§4) — the clip is not finished until the numbers pass.

Render shape — this exact chain was executed and measured before being written down:

```
ffmpeg -i capture.webm \
  -filter_complex "[0:v]fps=60,pad=1280:800:0:0:color=0x0B0D10,\
drawbox=x=0:y=720:w=1280:h=3:color=0xF0B429:t=fill,\
ass=cues.ass:fontsdir=/w/fonts" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -profile:v high \
  -movflags +faststart -an clip-03.mp4
```

`cues.ass` comes from `toAss(cues)` in `src/lib/clip-spec.ts` — the same validated cue
list the SRT is generated from. The SRT is still written, but it is shipped as a track,
never burned: see the trap in §6.

**Audio (revised 2026-11-20).** A capture never carries game audio: Playwright writes a
video-only file and the engine's `AudioContext` stays suspended without a gesture. The
track is therefore generated from the clip's own cue file by `scripts/clip-audio.ts` and
muxed once, in the same encode: `-c:a aac -b:a 160k -ar 48000`. It is a score — pad,
bass, pulse, one accent per cue — and it is described as a score everywhere it appears.
It is never presented as a recording of the run, and no sample library or voice model
enters the pipeline.

## 4. Acceptance gates

A clip ships only when all of these hold. No exceptions, no "looks fine".

| Gate | Threshold |
| --- | --- |
| Frame rate | constant 60 fps, confirmed by `ffprobe` — a variable frame rate fails |
| **Frame count** | `nb_read_frames` equals the clip's tick count exactly. This is the sync proof: at 60 fps CFR, N ticks are N frames |
| Duration | within 1 frame of `ticks / 60` |
| Geometry | `1280 × 800`; the game area occupies exactly `1280 × 720` at y=0 |
| Caption coverage | every cue in the SRT has a boundary capture at its midpoint showing the expected text |
| Line budget | validator passes: ≤ 2 lines, ≤ 44 characters each |
| Contrast | validator passes: ink and accent both ≥ 4.5:1 on the bar |
| Size | under 512 MB, and under the platform's per-clip duration ceiling |
| Claims | every caption sentence appears in the accuracy ledger of [creator-track.md](creator-track.md) |

## 5. Series consistency

One bar height, one palette, one type size, one label position, one accent colour
across all six clips. A viewer who sees two clips should recognise the series before
reading a word. Any clip that deviates is re-rendered, not excused.

## 6. Verified renderer, and the two traps found while verifying it

Measured on 2026-11-20 with `linuxserver/ffmpeg` (ffmpeg 9.0.2): `--enable-libass`,
`--enable-libfontconfig`, FreeType 2.14.3, HarfBuzz 14.6.0. A synthetic 120-frame
capture came out as **120 frames, 1280×800, `60/1` constant**, with the bar opaque and
the accent rule present. `ass` and `drawtext` both render the caption correctly; the
caption was confirmed present at frame 60 and absent at frames 10 and 110.

Two traps that cost real time here and will cost more during production:

1. **SRT `force_style` is not pixel geometry.** libass scales an SRT's style from a
   default 384×288 script resolution, so `FontSize=30` and `MarginV=30` land nowhere
   you chose. Burn an **ASS with `PlayResX/PlayResY: 1280/800`**, where the same numbers
   are pixels. The SRT remains the accessibility track.
2. **A caption-presence check can lie.** `-ss` placed *before* `-i` resets the output
   timeline to zero, so the frame you measure is not the moment you asked for — a
   correct render measures as "no text". Any check that selects a moment must render the
   clip and select by **frame index**, then crop the bar body (`y=726..796`, which
   excludes the accent line) and read the luma spread. A uniform bar means no text.

The `web` image still has no ffmpeg; the renderer runs as its own container with the
font directory mounted. The font must be **mounted and referenced by a family name it
actually declares** — the image ships no usable default font, and libass does not fail
loudly when it cannot resolve one.


## 7. Production record — 2026-11-20, the six shipped clips

What was produced, and the one rule that changed because the capture path changed.

**Source of the picture.** Every clip is a screen capture of the running product: the
`/runproof/showcase` page for clips 01–05, and the real `POST /api/agentgames` response
for clip 06. Five sessions were recorded (one per claim, because the proof panel holds
its states only until the next take starts), each warmed up until the page had produced
its own evidence, then staged and held for 15–16 s. Clip 05 was captured against the
public deployment so the receipt it shows resolves for a reader.

**The rule that changed.** Section 4 required `nb_read_frames == ticks`. That gate
belongs to a tick-stepped render, where the renderer draws one frame per simulation
tick. A screen capture is sampled from a live page instead, so the equivalent guarantee
is:

| Gate | How it was checked | Result |
| --- | --- | --- |
| Constant frame rate | `ffprobe r_frame_rate` | `60/1` on all six |
| Frame count | `nb_read_frames` against `duration × 60` | 960/900/900/895/893/689 — each within one frame of its duration |
| Geometry | `ffprobe width,height` | 1280 × 800 on all six |
| Cue boundaries | derived from the capture script's own logged stage timestamps, never typed | recorded in `timings/clip-NN.json` |
| Caption presence | frame at each cue midpoint, crop the bar body `y=726..796`, luma spread | 213–221 at every cue, **1** in the centre of the bar before the first cue |
| Label presence | same crop, full width | ink present in the left padding from frame 0 |
| Bar fit | row-by-row luma profile of `y=720..799` | ink stops at y=786, inside the bar, below the 3 px accent rule |

The luma check is the one that catches a silent failure: a uniform crop means no text,
whatever the renderer believed it drew. Measuring the centre of the bar separately from
the whole bar is what separates "the cue is on screen" from "the series label is on
screen".

**Type.** The shipped bar is one line at 42 px, not two at 30 px: 42 px is the size that
survives a phone at 1280 wide, and two lines of it do not fit an 80 px bar. The
validator now enforces the fit (`barLineBudget()`), so a two-line cue is rejected before
the renderer sees it.

**Audio.** Silent in this first pass, as section 3 allowed at the time. The owner
review below changed that rule; section 8 is the shipped state.

## 8. Production record — 2026-11-20, second pass (owner review)

The owner watched the six shipped files and reported six defects. Each one below is
traced to its cause, the change that answers it, and the measurement that shows the
change landed. Nothing here was re-decided on taste.

| # | Reported | Cause | Change | Measured |
| --- | --- | --- | --- | --- |
| 1 | Every clip is silent | A capture is video-only: Playwright writes no audio track and the engine's `AudioContext` stays suspended headless | `scripts/clip-audio.ts` scores each clip from its own cue file, muxed in the same encode | all six carry `aac 48 kHz stereo 160 kb/s`; `volumedetect` mean −14.0 dB, max −3.1 dB |
| 2 | Clip 01: on a big jump the playfield leaves the frame and the run cannot be read ahead | The follow law pins the frame to the *takeoff* platform, so the platform being jumped toward sat below the frame edge | render camera v4: the same chase, pulled down to hold the next solid platform, capped at the player's headroom. The death law keeps its own `deathY`, so a recorded trace still replays to the same verdict | on today's take, upcoming-platform samples outside the frame **135 → 0**, worst offset **532 → 454 px**; `deathTick 903 / score 330 / 25 candles / best streak 4` identical before and after; `test/camera-framing.test.ts` |
| 3 | Clips 02/03: panel text runs past the right edge; type could be larger | The panel was laid out at `zoom: 1.25` on a 342 px box, so its content overflowed the frame | fixed geometry (no zoom), 17 px type, wrapping constrained to the box, rows typed in on their cue | panel sits inside x 848–1256 with nothing clipped; panel bright-pixel share rises on each cue boundary (2.14 % → 2.60 %, 1.99 % → 2.11 %) |
| 4 | Clip 04: empty top, text pushed down, reads as a still image | The panel was vertically centred, and one state was held for the whole clip | rows spread top-to-bottom across the frame, each typed on its cue, page clock frozen at the evidence boundary so the panel cannot reset to `WAIT` mid-clip | panel bright-pixel share 0.56 % → 0.97 % → 1.21 % across the clip (the typing); `FLAG` row appears on cue 2 |
| 5 | Clip 05: same as 04, and the product's own receipt design is unused | The clip transcribed two panel rows instead of showing the receipt | the clip is the receipt page itself (`/runproof/r/<id>`) with a live `RE-VERIFY NOW`, verdict typed on cue 2 | receipt page captured; `MATCH` verdict rendered from the live re-check |
| 6 | Clip 06: display is right, audio missing | Same as 1 | same score, generated from its own cues | 11.50 s, 689 frames, audio present |

**Series length is no longer uniform.** Clip 03 is **7.27 s** because the replay *is*
its evidence, and the showcase starts a new take the moment that replay ends — a 15 s
hold would have shown a `WAIT` panel for half the clip. Clip 04 is 14.80 s, 05 is
12.80 s, 01 is 12.75 s, 02 is 14.98 s, 06 is 11.48 s (clip 01 re-cut in the third pass,
below). Geometry, frame rate, bar and palette are unchanged and identical across all
six: `1280 × 800`, `60/1` CFR, 765 / 899 / 435 / 886 / 768 / 689 frames.

**What is not claimed.** The score is music generated from the cue timeline; it is not
the engine's sound, and neither the thread nor the review packet calls it that. Clip
04's frozen page clock is staging of a state the product had already produced, not a
substitute for it — the panel content is the page's own DOM at that boundary.

## 9. Production record — 2026-11-20, third pass (clip 01 tail)

The owner reported that clip 01 stops matching its caption around 12 s and is cut wrong.
Stills extracted at 1 s and 0.1 s intervals locate the boundary exactly:

| t | Stage shown | Counter |
| --- | --- | --- |
| 12.5 s | `INPUT AT 60 HZ` (recording) | score 330 · 25 candles · tick 891 |
| 12.7 s | `INPUT AT 60 HZ` (recording) | score 330 · 25 candles · **tick 903** — last tick of the take |
| 12.8 s | `SAME RUN, REPLAYED BY THE ENGINE` | score 0 · 0 candles · tick 3 |

Clip 01 held for `holdMs: 16_000`, but the take it records lasts 12.75 s: the showcase
starts the replay the moment the run ends, so the last 3.2 s of the file were the
**replay** under a caption that claims recording. Fixed at the source (`holdMs: 12_800`)
and in the shipped file: cut on the take's last frame, cue 2 closed at tick 735 so the
SRT and the score (`12.75 s`, 2 accents) end with the footage.

Measured on the re-cut file: `duration 12.750000`, `nb_read_frames 765` (`= 12.75 × 60`),
`1280 × 800`, `60/1`, `aac 48 kHz stereo`; last frame still reads
`INPUT AT 60 HZ · SCORE 330 · CANDLES 25 · TICK 903`; no replay frame survives.

**The rule this adds.** A hold may not outlive the stage it is capturing. When a clip
shows a state the page leaves on its own, the hold ends at the boundary the capture
script logs for that stage — a fixed 15–16 s hold is only valid for a state the page
keeps.
