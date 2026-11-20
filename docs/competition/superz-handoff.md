# Handoff request — narration for six short clips

**To:** Super Z (coding agent, Base 1, Base44.com)
**From:** Base44 BaseCode, working on the Candle Climber / RunTrace entry for zkVerify Agent Games
**Status of this request:** approved by the content review panel for the *per-cue* form only

Paste everything below the line into the other agent. It is written to be answered
in phases, so nothing is produced before its capability is confirmed.

---

## Context you need (and nothing you don't)

Candle Climber / RunTrace is a browser game with a deterministic replay verifier.
The engine runs at a fixed 60 Hz; inputs are recorded at the tick boundary; the
server replays a trace in a fresh engine instance and returns `ACCEPT` or `FLAG`
with a reason. The terrain a run was played on is signed by the server with an HMAC
run token. There is no zero-knowledge proof in this build.

The entry for the zkVerify Agent Games Creator track is a thread of six short clips,
each stating one claim. Narration is being added to those clips.

**Authorship, stated accurately because it is part of the entry:** the initial Candle
Climber game code was written by you (Super Z, Base 1, Base44.com). This repository
and this build were produced by Base44 BaseCode. Neither claim covers the other.

## What you are being asked to do

Produce narration **audio only**, as **one file per caption cue**, plus a manifest.
You are not being asked to record, edit, or assemble video, and not to touch the
repository.

---

## 1. Ground rules

1. **Never invent an API shape, field name, limit, or licence term.** If you do not
   have it from your own documentation, answer `UNKNOWN`. `UNKNOWN` is a correct and
   useful answer; a plausible guess is not.
2. **Do not modify, clone, or write to the RunTrace repository.** You have no task
   there.
3. **Do not mux audio into any video.** Audio-only delivery is a requirement, not a
   preference.
4. **Do not upload the reference voice sample or any output to a public URL.** They
   are biometric data.
5. **Do not silently substitute** a different model, format, or sample rate. If a
   requirement below cannot be met, stop and say which one.
6. **Do not describe the product.** You are generating speech from text supplied to
   you. You are not a source of claims about what this build does.

## 2. Phase 0 — capability report (do this first, then stop)

Answer each item in the form `CONFIRMED — <value> — <source: doc URL or endpoint>` or
`UNKNOWN — <why>`.

1. Is a text-to-speech or voice-cloning endpoint reachable from your environment?
   Exact base URL.
2. Exact model identifier and version string you would call.
3. Does it support zero-shot voice cloning? Required reference audio length, format
   and sample rate.
4. Does it require the **transcript of the reference audio** as a separate field?
   Exact field name.
5. Output formats available, with sample rate and channel count for each.
6. Maximum characters per request.
7. Any phoneme or pronunciation-control input? Exact syntax, if it exists.
8. Does the output carry a watermark or provenance marker? Which one?
9. What licence covers using the generated audio in a public competition entry?
10. Rate limits, and whether a batch of ~20 short requests is acceptable.

**Stop after Phase 0 and return the report.** Do not generate audio yet.

## 3. Phase 1 — one pilot cue (only after Phase 0 is accepted)

Generate exactly one file from this text, then return the file and the exact request
payload you used:

> The same trace replays to the same verdict on a fresh engine.

Requirements: 48 kHz mono WAV, no loudness normalisation, no music, no reverb, no
post-processing. If your endpoint supports phoneme hints, use none for this cue.

## 4. Phase 2 — the batch (only after the pilot is accepted)

You will receive a cue list as JSON:

```json
{
  "clipId": "clip-03",
  "cue": 2,
  "text": "A fresh engine instance replays the trace and returns ACCEPT.",
  "windowMs": 3200
}
```

For each cue, produce one file and one manifest entry:

| Requirement | Value |
| --- | --- |
| File name | `cue-<clipId>-<cue>.wav`, e.g. `cue-clip-03-02.wav` |
| Format | WAV, 48 kHz, mono, 16-bit or 24-bit |
| Text | copied **verbatim** from `text`; do not rewrite, shorten, or "improve" it |
| Duration | must fit `windowMs`; if the synthesis is longer, return it anyway and flag it |
| Processing | none — no normalisation, EQ, compression, music, or effects |
| Peak level | below −1 dBFS; no clipping |

Manifest, one JSON array for the whole batch:

```json
[
  {
    "clipId": "clip-03",
    "cue": 2,
    "text": "A fresh engine instance replays the trace and returns ACCEPT.",
    "file": "cue-clip-03-02.wav",
    "durationMs": 3120,
    "sampleRate": 48000,
    "channels": 1,
    "model": "<exact model id and version>",
    "referenceAudio": "<path you used, not a public URL>",
    "postProcessing": "none"
  }
]
```

## 5. Pronunciation

These tokens are the known failure mode. Use phoneme hints if the endpoint supports
them; otherwise respell them in the `input` text exactly as shown:

| Token | Read as |
| --- | --- |
| HMAC | "H M A C" (letters, not a word) |
| zkVerify | "Z K verify" |
| RunTrace | "run trace" |
| run token | "run token" |
| ACCEPT | "accept" |
| FLAG | "flag" |
| Groth16 | "groth sixteen" |
| Base 1 | "base one" |

Do not respell any other word.

## 6. Provenance

For the batch, include a short log: endpoint used, model id and version, payload
template with the reference-audio path removed, timestamp, and a statement that no
post-processing was applied. This is the only way a reviewer can tell a synthesised
clip from an edited one.

## 7. Hard prohibitions

- No video work of any kind.
- No repository writes, no pull requests, no commits.
- No public hosting of the reference sample or the outputs.
- No claim that the narration is a human recording.
- No invented specification, limit, licence, or benchmark number.

## 8. What to send back

1. The Phase 0 capability report.
2. After approval: the pilot WAV and its exact payload.
3. After approval: the batch of WAVs plus `manifest.json` and the provenance log.
4. A one-paragraph statement of known quality limits — where the clone is weak, which
   words you expect to be mispronounced. An honest limit list is more useful than a
   claim of success.

## 9. What will be checked on receipt

Each item fails the delivery if it does not hold:

- every cue has a file, and every file is mono 48 kHz;
- every `durationMs` fits its `windowMs`, or the overflow is flagged;
- every `text` matches the cue list byte-for-byte;
- peak level below −1 dBFS on every file;
- `postProcessing` is `none` for all entries;
- no file was delivered already mixed into video.
