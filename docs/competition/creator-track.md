# Creator Track — content plan

[Creator Track](https://agentgames.zkverify.io/events/creator-track) entries are judged manually on technical substance, clarity, zkVerify relevance, and originality. Formats: thread, video, article/deep dive, or another standalone post.

**Eligibility:** include `#AgentGames` in every entry, and tag `@ZKVProtocol` on X.

## Chosen format

A single technical thread (or a short article built from the same text) about the one thing this build actually demonstrates: **replaying a game run deterministically, and knowing exactly what that proves and what it does not.**

Rejected alternatives and why:

- *"What is zkVerify?"* — generic; no evidence of our own work.
- *"How zkVerify makes your agent verifiable"* — would require claiming an integration this build does not have.
- *"Where verifiable agents matter"* — pure opinion, weakest on technical substance.

## Thread draft

> **Superseded 2026-11-20.** The shipped text is [thread-final.md](thread-final.md):
> thirteen posts, each measured against the 280-character limit, with the six clips
> mapped to their claims and the alt text written. The draft below is kept as the
> record of how the argument was built.

**1/** A game bug report says "the game ate my jump". A score claim says "12,400". A balance patch says "nothing changed". All three are claims about a run nobody can inspect afterwards.

We built an agent that plays the game and leaves a replayable trace instead. `#AgentGames`

**2/** The agent is `RivalBot`: a deterministic planner over three personality profiles — precise, greedy, patient. No LLM, no network, no randomness in gameplay decisions. It plays up to 1,800 fixed 60 Hz ticks per case.

**3/** The detail that matters: input is recorded at the **simulation tick boundary**, not at browser frame time. Frame-timestamped replays diverge the moment the frame rate does. Fixed-tick recording is why the same trace replays identically on a slow laptop and a fast one.

**4/** The trace is then replayed in a **fresh engine instance**: terrain rebuilt from the trace, engine stepped forward, then score, jumps, landings, scoring events and totals compared against the run's own recorded outputs. Separate run, separate check.

**5/** The verdict is `ACCEPT` or `FLAG`, with a reason, evidence, and diagnostics — returned from a plain HTTP endpoint. The verifier is deterministic TypeScript. No model decides anything.

**6/** On top of replay, a bounded invariant layer: finite core state, legal jump/RUSH/world transitions, grounded alignment with a live platform, monotonic time, score, candles, best streak.

**7/** Now the honest part, because this is where most "verifiable" claims break:

- no zero-knowledge proof here — nothing is proven to anyone;
- the terrain is server-signed (an HMAC token over the exact candles); the **inputs** are not — nothing attests who produced them;
- the bot and its replay share one engine — this is a consistency check, not an independent physics oracle;
- `PASS` covers the tested cases only.

**8/** Why that still matters: replay consistency is the precondition for anything stronger. You cannot prove a claim about a run until the run is reproducible. Determinism first, proof second.

**9/** That's the gap we're pointing at next: commit to a hash of the trace and the engine build, then prove the replayed final state equals the claimed final state. Turn "trust this verdict" into "check this relation". Not built yet — direction, stated as direction.

**10/** Play it: `https://candle-climber-runtrace.vercel.app/play`
Run the QA suite: `https://candle-climber-runtrace.vercel.app/runproof`
Read the contract: repository `docs/runproof/`

Entry for `#AgentGames`. Tagging `@ZKVProtocol`.

## Clip plan (one clip per claim)

Six clips, ≤ 30 s each, inside the 140 s / 512 MB ceiling of a non-Premium
account. Each clip states one claim and shows the code path behind it.

| Clip | Claim on screen | Evidence in the product | Shipped file |
| --- | --- | --- | --- |
| 1 | Input is recorded at the 60 Hz tick boundary, not at frame time | `FixedTickInputRecorder` | `media/clip-01-ticks.mp4` |
| 2 | The terrain a run was played on is server-signed | `GET /api/candles` → run token | `media/clip-02-signed.mp4` |
| 3 | A fresh engine instance replays the trace and returns `ACCEPT` | `POST /api/runproof/verify` | `media/clip-03-replay.mp4` |
| 4 | A tampered score returns `FLAG`, with a reason | tamper control on `/runproof` | `media/clip-04-flag.mp4` |
| 5 | The receipt is stored and verifies again when reopened | `/runproof/r/{id}` | `media/clip-05-receipt.mp4` |
| 6 | An unsigned request to the agent endpoint is rejected | `POST /api/agentgames` → `401` | `media/clip-06-endpoint.mp4` |

Frame geometry, caption bar and audio rules: [clip-visual-spec.md](clip-visual-spec.md).
Subtitles and SRT: [caption-pipeline.md](caption-pipeline.md).

## Accuracy ledger

The precise statements behind the thread, each traceable to code. Every published
sentence must reduce to one of these; anything else goes back to the panel.

| Claim | Precise version | Source |
| --- | --- | --- |
| Terrain is authenticated | `GET /api/candles` signs `{symbol, date, count, interval, h}` where `h` is a 16-hex fingerprint of the exact candle JSON | `src/lib/run-token.ts` |
| The verifier checks it | `attestTerrainIfPresent` recomputes the fingerprint when a trace carries a token; a mismatch is `invalid` with a reason | `src/game/runproof/attest.ts` |
| Receipts require it | `attestTerrain` treats a missing token as `missing_run_token` — no receipt without a server-signed level | `src/game/runproof/attest.ts` |
| The scored path enforces it | `POST /api/leaderboard` rejects an invalid token with `403` | `src/app/api/leaderboard/route.ts` |
| Production fails closed | No `RUN_TOKEN_SECRET` on a production deploy ⇒ no tokens signed, all tokens rejected | `src/lib/run-token.ts` |
| Inputs are **not** attested | The input stream arrives from the caller; a terrain token says nothing about who played | whole replay path |
| The replay endpoint is unscored | `POST /api/runproof/verify` returns a consistency report; it is not an admission gate | `src/app/api/runproof/verify/route.ts` |
| Authorship is split | The initial game code came from a separate coding agent (Super Z, Base 1, Base44.com); this repository and this build were produced with Base44 BaseCode | [../PRODUCT-IDENTITY.md](../PRODUCT-IDENTITY.md#authorship) |

## Accuracy rules for this track

- Never describe the build as producing zk proofs or submitting to zkVerify.
- Never describe the replay as anti-cheat, identity verification, or proof of human play.
- Never say the terrain is unauthenticated: it is signed, and the only unattested part is the input stream.
- Never attribute authorship to zkVerify; this is an entry in their event, not their product.
- Never claim sole authorship: the initial game code came from a separate coding agent, this repository from Base44 BaseCode. Name the scope, or say both in one line.
- Never present synthetic fixtures as market data.
- Keep `#AgentGames` in every post and `@ZKVProtocol` on X.
- No entry is published before a named judge has signed a verdict on the frozen material: [judge-review-packet.md](judge-review-packet.md), recorded in [review-panel.md](review-panel.md), with `bun scripts/publish-gate.ts` exiting `0`. A verdict issued after publication is worthless.
