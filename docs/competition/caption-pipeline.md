# Caption pipeline — thread clips

Six clips, ≤ 30 s each, recorded from the running app. Captions are **generated
from the same timeline as the clip**, never typed per render, so a re-record can
never drift out of sync.

## Three layers, one source

| Layer | What it carries | Why |
| --- | --- | --- |
| `captions/<clip>.ts` | cue list `{ fromTick, toTick, text }` + `vo` narration text | single source of truth, anchored to simulation ticks |
| Burned-in band | the clip's **one claim**, ≤ 2 lines | the muted-autoplay majority never taps captions |
| `.srt` upload | the full **narration** | real accessibility: toggleable, screen-reader readable ([X help](https://help.x.com/en/using-x/upload-caption-srt-file), web only) |

The burned-in layer carries the *claim*, not the transcript. Burning the transcript
and uploading the SRT would show both at once when a viewer enables captions.

## Timing

The engine runs at a fixed 60 Hz, so a tick maps to wall-clock deterministically:

```
srtTime = leadInMs + (tick / 60) * 1000
```

`leadInMs` is the recorder's fixed wait before the first tick. It is a constant in
the capture script, not a measured value, so every clip shares the same offset.

## Recording and encoding

Playwright is already a devDependency (`scripts/e2e-gamer-bot.ts` drives the game),
but the container has **no browser binaries and no ffmpeg**. Neither is an app
dependency, so neither goes into the image:

1. One-time, inside `web`: `bunx playwright install --with-deps chromium`.
2. Record with `context.recordVideo` against a capture route that plays the target
   segment of the replay with the caption band overlaid as DOM.
3. Playwright emits WebM; the uploader wants MP4. Transcode in a throwaway
   container, so the app image stays clean:

```bash
docker run --rm -v "$PWD/captures:/c" linuxserver/ffmpeg \
  -i /c/raw/clip-3.webm -vf "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -r 30 \
  -c:a aac -b:a 128k -movflags +faststart /c/clip-3.mp4
```

Targets: 1080×1080, 30 fps, ≤ 50 MB, ≤ 30 s — inside the 140 s / 512 MB ceiling of
a non-Premium account.

## Legibility gates (checked by the panel)

- ≤ 42 characters per line, ≤ 2 lines per cue.
- Reading speed ≤ 17 characters/second; every cue ≥ 1 s on screen.
- Contrast ≥ 4.5:1: white on a 70 % black scrim, never text directly on gameplay.
- Caption band sits above the bottom 15 % — that is where X draws its own captions.
- Never over the score HUD or the verdict chip: the number being discussed stays visible.

## Why not rely on X auto-captions

The vocabulary is the problem: `HMAC`, `ACCEPT`, `FLAG`, `run token`, `attested`,
`deterministic replay`. ASR mangles exactly these, and a mis-transcribed verdict is
a wrong claim about the product.

## Narration options

The SRT is only meaningful if the clips carry narration.

| Option | Cost | Risk |
| --- | --- | --- |
| **Owner records it** | one pass, ~2 min of speech | none; most credible with the authenticity lens |
| **Cloned voice, local model** | sample + setup + re-rolls | see constraints below |
| **Silent clips** | none | burned-in text is then the whole caption; ship no SRT rather than an empty one, and put the transcript in the thread text |

### If cloning is used

- **Engine:** Chatterbox (Resemble AI), MIT-licensed, zero-shot from ~10 s of
  reference audio, and it embeds PerTh watermarking — the output is machine-identifiable
  as synthetic. XTTS v2 (CPML, non-commercial) and F5-TTS (CC-BY-NC) are ruled out on
  licence grounds.
- **The sample is biometric data and this repository is public.** It must never be
  committed, never placed under the repo tree, and must be deleted after use. Read its
  path from an environment variable; keep it in `/tmp`.
- **Hardware here:** 4 vCPU, 7 GB RAM, no GPU. Chatterbox documents 8 GB RAM as the
  floor and is GPU-oriented, so CPU synthesis is slow and may need memory headroom.
  Budget minutes per pass, plus re-rolls for mispronounced terms.
- **Disclosure is mandatory:** one line in the thread stating the narration is
  synthesized from the owner's own voice. Hiding it converts a technical detail into a
  credibility risk once the watermark or the prosody gives it away.
- **Pronunciation is the failure mode:** `HMAC`, `zkVerify`, `ACCEPT`, `FLAG`,
  `run token`, `Groth16` — each needs a phonetic respelling and a listening check.
