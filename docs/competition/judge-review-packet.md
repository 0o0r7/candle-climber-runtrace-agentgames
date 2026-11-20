# Judge review packet — Creator Track

Everything a judge needs to review the entry **before it is published**, and the
exact form in which the verdict has to come back.

## The one rule

The verdict is issued **before the thread goes live**. After publication the entry
is judged on what was live, so a verdict written afterwards cannot change a single
word of it — it is a formality, not a decision. The gate is mechanical:
`bun scripts/publish-gate.ts` exits `1` until a signed verdict for this exact
material exists.

- **Deadline:** the thread must be published and filed by **2026-11-21, 22:00 UTC**.
  The verdict has to be in hand before that, with time to publish.
- **Who may sign:** one named person who did not write the thread — the owner's
  appointed judge, or an outside reviewer. The panel lenses in
  [review-panel.md](review-panel.md) are preparation for this reading, not a
  substitute for it.

## What is under review

The frozen material is the thread text plus the six clips. Nothing else changes
between review and publication.

| Item | Path |
| --- | --- |
| Thread, thirteen posts, alt text, posting order | `docs/competition/thread-final.md` |
| Six clips and their SRT tracks | `docs/competition/media/clip-01-ticks … clip-06-endpoint` |

The digest covers exactly these thirteen files. Reproduce it without trusting any
of this repository's code:

```bash
sha256sum docs/competition/thread-final.md docs/competition/media/clip-*.mp4 docs/competition/media/clip-*.srt \
  | LC_ALL=C sort -k2 | sha256sum
```

The gate prints the same value. If a clip is re-recorded or a sentence is edited
after the review, the digest changes and the verdict no longer applies — that is
the point: the judge's signature is bound to the words and pixels that ship.

## The four axes

The event page judges technical substance, clarity, zkVerify relevance and
originality. Score each **1–5**; no axis may fall below **3**, and technical
substance must be at least **4**.

| Axis | 5 looks like | What drags it down |
| --- | --- | --- |
| Technical substance | Mechanisms a reader can run: fixed-tick recording, fresh-instance replay, signed terrain, a deterministic verifier that returns reasons, each shown on screen | Adjectives where a mechanism is claimed |
| Clarity | One claim per post, one clip per claim, limits stated in the same breath as the claim | The honest-limits beat buried, softened, or removed |
| zkVerify relevance | Replay consistency framed as the precondition for any proof about a run | Implying a proof, a submission, or an integration this build does not have |
| Originality | The negative space — what the verdict does *not* prove — stated by the builder | A generic "what is a ZK proof" explainer |

## Vetoes

Any one of these is a `REJECT`, regardless of the axis scores:

- A published sentence that no row of the [accuracy ledger](creator-track.md#accuracy-ledger) supports.
- A claim of ZK proof generation, a zkVerify submission, or authorship attributed to zkVerify.
- A number on screen that is not the run's own.
- A clip that is not a capture of the running product.
- Missing `#AgentGames` in any post, or `@ZKVProtocol` absent from the closing post.
- Media outside the limits (≤ 140 s, ≤ 512 MB, captions burned in, alt text written).
- Undisclosed split authorship (initial game code: Super Z, Base 1, Base44.com; this repository: Base44 BaseCode).

## Checking it in ten minutes

1. Read [thread-final.md](thread-final.md) top to bottom as a reader, not as an author. Note where you had to re-read a post.
2. Watch the six clips in `media/`. Each is 15–16 s and silent by design; the caption bar carries the claim.
3. Spot-check three claims against the running product — `/runproof` (console and tamper control), `/runproof/showcase` (looped verified replay), `POST /api/agentgames` (must answer `401` unsigned).
4. Open [review-panel.md](review-panel.md): five lens records with the evidence each checked, including two protocol vetoes that were raised and resolved.
5. Score the four axes and write the verdict.

## Verdict form

Paste this block at the **end** of [review-panel.md](review-panel.md), filled in,
and change nothing else. The gate reads the last block in the file.

```text
### Judge verdict

VERDICT: <APPROVE | REJECT>
JUDGE: <name / handle>
REVIEWED-AT: <ISO 8601, e.g. 2026-11-20T18:30:00Z>
MATERIAL-SHA256: <digest printed by bun scripts/publish-gate.ts>
AXES: technical-substance=<1-5> clarity=<1-5> zkverify-relevance=<1-5> originality=<1-5>
OBJECTIONS: <one line each, or "none">
```

Then:

```bash
bun scripts/publish-gate.ts   # exit 0 = publishable
```

A `REJECT` is a real outcome and a cheap one: fix what the objections name, re-freeze
the material, and ask for a second reading. Publishing with a `REJECT` on record, or
publishing before any verdict exists, is the one failure this gate exists to prevent.

## After publication

The verdict stays in the ledger as the record that the decision came first. When the
thread is live, the archive note in `media/thread-archive/` records the publish
timestamp, and it must be **later** than `REVIEWED-AT` — that pair is the proof the
judge saw the entry before anyone else did.
