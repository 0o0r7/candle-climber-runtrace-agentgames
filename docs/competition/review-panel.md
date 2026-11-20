# Content review panel — Creator Track

Purpose: no Creator-track material is published until **every lens returns
`APPROVE`** and the **Judge** signs the assembled entry. A lens holds a veto
only inside its own scope; the Judge is the single gate that can override a
lens, and only by writing the reason into the ledger below.

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

## What the Judge weighs

The official page judges four things. The Judge scores each 1–5 and requires
**no axis below 3** and **technical substance ≥ 4**:

| Axis | What earns the score here | What kills it |
| --- | --- | --- |
| Technical substance | Fixed-tick recording, fresh-instance replay, signed terrain, a deterministic verifier with reasons | Adjectives instead of mechanisms |
| Clarity | One claim per post, a clip per claim, limits stated in the same breath | The honest-limits beat buried or removed |
| zkVerify relevance | Framing replay consistency as the precondition for any proof about a run | Claiming an integration this build does not have |
| Originality | The negative space: what the verdict does *not* prove, stated by the builder | Generic "what is a ZK proof" explainer |

## Publish gate

- [ ] Every lens `APPROVE`, recorded below with the evidence it checked.
- [ ] Judge `APPROVE`, with the four axis scores written down.
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
