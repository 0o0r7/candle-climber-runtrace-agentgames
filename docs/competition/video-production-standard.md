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

Audio is kept only if the capture actually carries it, in which case `-an` becomes
`-c:a aac -b:a 160k -ar 48000`. A silent clip is acceptable; a fake audio bed is not.

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
