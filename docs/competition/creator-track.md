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

## Video outline (alternative, 60–90 s)

1. Open the game, play ten seconds, show the jump.
2. Open `/runproof`, run the six-case suite, show the verdicts and evidence.
3. Break a trace on purpose — alter the claimed score — show `FLAG`.
4. Say what it does not prove, on screen, in one sentence.
5. Close on the endpoint URL and the repository link.

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

## Accuracy rules for this track

- Never describe the build as producing zk proofs or submitting to zkVerify.
- Never describe the replay as anti-cheat, identity verification, or proof of human play.
- Never say the terrain is unauthenticated: it is signed, and the only unattested part is the input stream.
- Never attribute authorship to zkVerify; this is an entry in their event, not their product.
- Never present synthetic fixtures as market data.
- Keep `#AgentGames` in every post and `@ZKVProtocol` on X.
- No entry is published without the panel's verdict: [review-panel.md](review-panel.md).
