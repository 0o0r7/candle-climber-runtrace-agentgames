# Content review panel — Creator Track

Purpose: no Creator-track material is published until **every lens returns
`APPROVE`** and a **named judge signs a verdict on the frozen material**. A lens
holds a veto only inside its own scope; the judge is the single gate that can
override a lens, and only by writing the reason into the ledger below.

**Order matters.** The verdict is issued *before* the thread goes live. Once it is
published, the entry is judged on what was live, so a verdict written afterwards
changes nothing — it is a formality, not a decision. The order is enforced
mechanically: `bun scripts/publish-gate.ts` exits `1` unless a signed verdict exists
for the current thread text and clip set. Review packet, rubric and verdict form:
[judge-review-packet.md](judge-review-packet.md).

Deadline: **2026-11-21, 22:00 UTC**. Material not past the gate by then is not
submitted — a veto is cheaper than a rejected entry.

## Lenses

| # | Lens | Replaces | The one question it answers | Vetoes on |
| --- | --- | --- | --- | --- |
| 1 | **X Distribution Editor** | social media content creator | Can this be read, in order, by someone scrolling? | Missing `#AgentGames`, missing `@ZKVProtocol` on X, post over 280 characters, media over 140 s or 512 MB, no alt text, captions not burned in |
| 2 | **Technical Article Editor** | technical article writer | Can a skeptical engineer reproduce what the text claims? | A claim with no runnable reproduction, a code path that does not exist, a link that 404s, a command that fails as written |
| 3 | **Claim & Authenticity Auditor** | humanity content auditor | Is every sentence backed by something that ran? | An unverified claim, a fabricated metric, a missing AI-assistance disclosure, text unreadable at phone size, contrast under 4.5:1 |
| 4 | **zkVerify Protocol Reviewer** | zkverify specialist analyzer | Is every zkVerify statement true and correctly scoped? | Any implication of ZK proof generation or submission, misuse of protocol terms, authorship attributed to zkVerify |
| 5 | **Compliance & Deadline Marshal** | — (new) | Is the entry valid, on time, and filed? | Publishing after the deadline, entry not filed via `/dashboard/submissions`, required tag absent, no archived copy of the published entry |
| 6 | **Judge** | — (new) | Does the assembled entry earn a place? | Anything the four official judging axes do not support; overrides a lens only with a written reason |

The judge is a **named person who did not write the thread**, not a lens the author
runs on themselves. Lenses 1–5 prepare the reading; only the judge's signature
counts as a verdict, and it must be on record before publication.

## What the Judge weighs

The official page judges four things. The Judge scores each 1–5 and requires
**no axis below 3** and **technical substance ≥ 4**:

| Axis | What earns the score here | What kills it |
| --- | --- | --- |
| Technical substance | Fixed-tick recording, fresh-instance replay, signed terrain, a deterministic verifier with reasons | Adjectives instead of mechanisms |
| Clarity | One claim per post, a clip per claim, limits stated in the same breath | The honest-limits beat buried or removed |
| zkVerify relevance | Framing replay consistency as the precondition for any proof about a run | Claiming an integration this build does not have |
| Originality | The negative space: what the verdict does *not* prove, stated by the builder | Generic "what is a ZK proof" explainer |

## Publish gate — in this order

1. **Freeze the material.** The thread text and the six clips stop changing.
2. **Lenses.** Every lens `APPROVE`, recorded below with the evidence it checked.
3. **Verdict.** A named judge signs `APPROVE` on the frozen material, with the four
   axis scores and the material digest, using the form in
   [judge-review-packet.md](judge-review-packet.md#verdict-form).
4. **Gate.** `bun scripts/publish-gate.ts` exits `0` against that same material.
5. **Publish.** The thread goes live, unchanged.
6. **Archive.** The live thread is archived with its publish timestamp, which must be
   later than `REVIEWED-AT`.

Nothing is published during steps 1–4. A verdict obtained after step 5 is worthless.

- [ ] Every lens `APPROVE`, recorded below with the evidence it checked.
- [ ] Named judge `APPROVE`, with the four axis scores and `MATERIAL-SHA256` recorded.
- [ ] `bun scripts/publish-gate.ts` exits `0` immediately before posting.
- [ ] Every sentence reduces to a row of the [accuracy ledger](creator-track.md#accuracy-ledger).
- [ ] Media within limits: ≤ 140 s, ≤ 512 MB, captions burned in, alt text written.
- [ ] `#AgentGames` in every post, `@ZKVProtocol` tagged on X.
- [ ] Authorship disclosed per [PRODUCT-IDENTITY.md](../PRODUCT-IDENTITY.md#authorship): the initial game code and this repository have different authors, and the entry says so.
- [ ] Entry filed via `/dashboard/submissions` and a copy archived in the repository.

## Verdict ledger

### 2026-11-20 — thread draft v2

| Lens | Objection | Resolution | Verdict |
| --- | --- | --- | --- |
| 1 X Distribution | Draft post 7 exceeded a comfortable read; no clip plan yet | Post 7 split into four one-line bullets; clip-per-claim table added to the plan | `APPROVE` (media still to be produced) |
| 2 Technical Article | "six-case suite" unverified | Confirmed in the console: "RUN SIX-CASE RIVALBOT QA SUITE" | `APPROVE` |
| 3 Claim & Authenticity | — | — | `APPROVE` |
| 4 zkVerify Protocol | **VETO**: "terrain and inputs are caller-supplied and unauthenticated" | Terrain *is* server-signed — `src/lib/run-token.ts` issues the HMAC, `src/game/runproof/attest.ts` recomputes the candle fingerprint (mandatory for receipts), `src/app/api/leaderboard/route.ts` returns `403` on an invalid token. Only the **inputs** are unattested. Sentence rewritten; ledger rows added | `APPROVE` |
| 4 zkVerify Protocol | **VETO**: "Built … by zkVerify" implies zkVerify authored the build | Rewritten to "Entry for `#AgentGames`. Tagging `@ZKVProtocol`." | `APPROVE` |
| 5 Compliance | Video outline said 60–90 s while the clip plan targets 6 × ≤ 30 s | The 60–90 s outline was replaced by the six-clip plan in `creator-track.md` on 2026-11-20 | `APPROVE` |
| 6 Judge | — | Not yet convened; requires the produced media | `PENDING` |

**Gate status: lenses 1–5 `APPROVE`.** Judge `PENDING` until the media exists.
Narration is approved **only** in the per-cue form described in
[caption-pipeline.md](caption-pipeline.md#handoff-contract-for-externally-generated-audio).

### 2026-11-20 — produced media and final thread

Material reviewed: six clips in `media/`, the thirteen-post thread in
[thread-final.md](thread-final.md), and the alt text for each clip.

| Lens | What it checked | Objection | Resolution | Verdict |
| --- | --- | --- | --- | --- |
| 1 X Distribution | Every post measured against 280 characters (13/13 pass); one clip per claim; alt text written for all six; captions burned in at 42 px, which a ~390 px phone renders at ~13 px | Post 12 carried no `#AgentGames` | Tag added; the tag rule now has no exceptions | `APPROVE` |
| 2 Technical Article | Each claim has a reproduction a reader can run: `/runproof/showcase`, `/runproof/r/<id>`, `POST /api/runproof/verify`, `POST /api/agentgames`, and the repository docs the thread cites | — | — | `APPROVE` |
| 3 Claim & Authenticity | Every caption reduces to a ledger row; the numbers on screen are the run's own; bar contrast passes the validator; the `401` in clip 06 is a live response from the public deployment | **Found in production**: the first cut of clip 05 showed a receipt written by the local dev server into the shared store, and that receipt re-verified as `FLAG` on the public deployment because the run token was signed with the dev secret | Clip 05 re-captured against the public deployment; the dev-signed record deleted from `candleclimber.runtrace_receipts`; the shipped receipt `ea717213-7750-41f5-a003-6993a8eedbad` re-verified `ACCEPT` by re-posting its stored trace | `APPROVE` |
| 4 zkVerify Protocol | No sentence claims proof generation, a zkVerify submission, or zkVerify authorship; the product's own banner says "DETERMINISTIC REPLAY · NO ZK PROOF"; authorship is attributed to Super Z and Base44 BaseCode | — | — | `APPROVE` |
| 5 Compliance | Deadline 2026-11-21 22:00 UTC; media 11.5–16 s per clip, 0.25–1.3 MB, well inside 140 s / 512 MB; captions burned in; alt text ready | The entry is **not filed**: publishing the thread and filing from `/dashboard/submissions` need the owner's account | Material is submission-ready; the two owner steps are listed in [TODO.md](TODO.md) | `APPROVE` (filing pending owner) |
| 6 Judge — **panel pre-score, not a verdict** | Four official axes, 1–5, no axis below 3, technical substance ≥ 4 | The scores in the next column are the author's own rehearsal of the judge's reading, not a verdict | Technical substance **5** (fixed-tick recording, fresh-instance replay, signed terrain, a deterministic verifier with reasons, each demonstrated on screen); Clarity **4** (one claim per post, limits stated in the same breath); zkVerify relevance **3** (the build does not use the protocol; the thread claims only that replay consistency is its precondition); Originality **4** (the negative space, stated by the builder) | `PRE-SCORE` |

**Gate status: lenses 1–5 `APPROVE` on the material; the axis scores are a panel
pre-score, not a verdict.** Publishing is blocked until a named judge signs a verdict
on this exact material — `bun scripts/publish-gate.ts` must exit `0` — and only then
is the thread published unchanged, archived with its timestamp, and its link filed
from `/dashboard/submissions`. Steps and owners: [TODO.md](TODO.md#4-creator-track).
Until the entry is filed, the submission is not complete.
