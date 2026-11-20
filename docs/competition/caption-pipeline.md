# Caption pipeline — thread clips

Six clips, ≤ 30 s each, recorded from the running app. Captions are **generated
from the same timeline as the clip**, never typed per render, so a re-record can
never drift out of sync.

> **Audio in use (2026-11-20).** Not narration. Each clip carries a synthesised score
> generated from the same cue file by `scripts/clip-audio.ts` — one accent per cue, no
> voice. The narration path recorded below stays as the record of what was evaluated
> and not taken; see [clip-visual-spec.md](clip-visual-spec.md#audio).

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
- **Better engine than a local model:** GLM-TTS (zai-org) does zero-shot cloning from
  3–10 s and exposes phoneme-level control, which is exactly what the vocabulary above
  needs. It is served through an OpenAI-compatible `POST /v1/audio/speech` with
  `ref_audio` + `ref_text` — note that it needs the **transcript of the sample**, so the
  reference read must be verbatim. Its licence is not stated on the model page: confirm
  it before publishing.

> **Status 2026-11-20 — narration withdrawn.** The entry ships with the engine's own
> audio and a caption bar below the frame: see
> [clip-visual-spec.md](clip-visual-spec.md). Everything below this line is the record
> of the audio path that was evaluated and not taken, kept so the decision is
> reviewable. The subtitle approach at the top of this file still applies.

## Handoff contract for externally generated audio

Audio may come from another agent or service. It is accepted only in this shape,
because this is the only shape that can be verified:

1. **One file per cue**, never one long take. `cue-<clipId>-<cue>.wav`.
2. **Native sample rate of the engine, untouched.** The generator must not resample,
   normalise, trim, or apply any DSP. A 24 kHz mono `pcm_s16le` file is accepted as-is:
   the single conversion to the video's audio rate happens once, in the mux step, where
   it is logged. Resampling at the source would add no information and would destroy
   the `postProcessing: none` guarantee.
3. **Two text fields, not one.** `captionText` is the on-screen text, copied verbatim
   from `captions/<clip>.ts`. `speechText` is what was actually synthesised, which
   differs wherever the pronunciation table applies. The check is a diff: `speechText`
   must equal `captionText` with the documented respellings applied, and differ in
   nothing else.
4. **A manifest** per file: `{ clipId, cue, captionText, speechText, file, durationMs,
   sampleRate, channels, engine, speed, leadingSilenceMs, postProcessing }`. When the
   engine cannot report a backend model id, the field is `null` with a note saying so —
   a capability fingerprint (`surface` + SDK version + voice preset) is the honest
   substitute, never an invented id.
5. Files live **outside the repo tree** (or under a gitignored `captures/audio/`).
6. **The generating agent does not mux.** Assembly happens here, once.

Assembly places each file at `leadInMs + tick/60*1000 + leadingSilenceMs` — leading
silence is **measured and compensated, never trimmed** — and fails the build when a
cue's `durationMs` overflows its caption window. That check is what makes sync a
property of the pipeline instead of a hope: a long take has no such check, and a final
MP4 handed over already muxed has no check either.

**Audio is an optional layer.** With no manifest present, every clip renders with
burned-in captions and its SRT track and no audio at all. Narration is an enhancement
to a finished entry, never a dependency of it — which is why an unresolved licence on
the synthesis engine cannot block publication.

## Engine choice, and when to change it

| Engine | Cloning | Native output | Licence | Cost to us |
| --- | --- | --- | --- | --- |
| Super Z sandbox TTS (`jam` preset) | no | 24 kHz mono `pcm_s16le` | **unknown** | zero — already wired |
| Manus + ElevenLabs connector | yes, from a few seconds | 44.1 kHz PCM or mp3 | documented per plan, needs a paid account | a second agent, a second provenance chain |
| Local model | yes | 44.1 kHz+ | model-dependent | rejected — no GPU in this sandbox |

**Rule: the engine is chosen once, before the batch, never per clip.** Two engines
across six clips means two narrators, and a reviewer notices that in the first ten
seconds.

**Current decision: pilot on the preset voice.** A preset voice that is clear, correctly
accented and consistent beats a clone that arrives with an unknown licence. Switch only
on evidence — the pilot sounds wrong for technical English, or the voice has to be the
author's own — not in anticipation of a problem that the pilot can settle in one file.

The reason this stays cheap either way: the manifest contract above is engine-agnostic.
Only the `engine` block changes. A pivot costs one regenerated batch, not a redesign.

If the pivot happens, two things change with it: the disclosure must name the provider
and state that the voice is a clone of the author, and the reference sample is biometric
data that never enters the repository and is never uploaded anywhere public.
