# RunTrace — verified run receipts

RunTrace records a Candle Climber run at the simulation boundary (fixed 60 Hz input stamping), replays it on the server, and — when the terrain is attested — stores the verdict as a shareable receipt. The console lives at `/runproof`; a receipt lives at `/runproof/r/{id}`.

**It is a replay-consistency record, not a proof of identity.** See "What it does not prove" below.

## Real terrain, attested

The console plays the same daily market level as the game. `GET /api/candles` serves the closed candles for the day's symbol and signs them with an HMAC **run token** binding symbol + date + candle count + a fingerprint of the exact candle JSON (`src/lib/run-token.ts`).

- The trace carries that token as `runToken`.
- `verifyTrace` replays the trace; the server-side `attestTerrain` recomputes the fingerprint from `terrain.candles` and rejects a token that does not match (`run_token_terrain_mismatch`), was issued for another symbol/date (`run_token_seed_mismatch`), or was not signed by the server (`invalid_run_token`).
- When the market feed is unreachable, `/api/candles` falls back to synthetic candles **without** a token. Runs on that terrain can be replayed, but the console labels it unattested and refuses to issue a receipt.

So a receipt cannot be moved to hand-edited terrain: the candles in the trace must be exactly the level the server served.

## Showcase loop (`/runproof/showcase`)

`/runproof/showcase` runs the same pipeline unattended and loops it:

1. Fetch today's signed terrain from `/api/candles`.
2. Let the deterministic `Autopilot` (`src/game/cc/autopilot.ts`) play it while its real jump/release inputs are stamped at 60 Hz.
3. Replay the finished trace on the server (`POST /api/runproof/verify`) and show the `ACCEPT` evidence.
4. Verify a copy with one extra claimed point and show the expected `FLAG` (`score_mismatch`).
5. Store the receipt — reusing today's identical run when one already exists — then re-read it from the store and replay it again to show a `MATCH`.
6. Loop the recorded trace through the real engine. The loop is a deterministic replay, not a video file.

The page prints the "not claimed" boundary next to the evidence: no zero-knowledge proof, no zkVerify submission, no wallet identity. The autopilot is deterministic, so every visitor records the same run for the same signed terrain, and the loop is the replay of that run.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/runproof/verify` | Validate shape/bounds, replay, check the run token when present, return an `ACCEPT`/`FLAG` report. No storage. |
| `POST /api/runproof/runs` | Verify with **required** attestation, store the receipt (verdict + trace), return `{ id }`. 422 when the terrain is unattested, 400 when the trace is malformed. |
| `GET /api/runproof/runs?limit=n` | Newest receipt summaries (no trace/report payload). |
| `GET /api/runproof/runs/{id}` | One stored receipt, including the trace so it can be re-checked. |

The verifier returns `task: "verify-run-trace"`, policy `runproof/deterministic-replay/v1`, a reason, up to four evidence lines, replay diagnostics, and the limits ([`task-contract.v1.json`](task-contract.v1.json)). The decision is deterministic TypeScript plus engine replay — not an LLM. A `FLAG` is a policy result, not an accusation.

## One-command verification

```sh
bun scripts/agent-games-scenarios.ts
BASE_URL=https://<deployment> bun scripts/agent-games-scenarios.ts
```

The suite plays today's signed market level with the deterministic pilot,
records it at the fixed tick boundary, and walks every public surface: the
verifier (accept + tamper), receipt issue/read/re-verify, unattested refusal,
and the signed Agent Games protocol (preflight, task, wrong signature,
idempotent retry, conflicting reuse). It writes
[`../evidence/agent-games-scenarios.json`](../evidence/agent-games-scenarios.json)
and exits non-zero if any scenario fails. Protocol details:
[agentgames-protocol.md](agentgames-protocol.md).

## Receipts

A receipt holds the verdict, the replayed run totals, the trace hash, the seed, and the full trace. `/runproof/r/{id}` shows it and offers **Re-verify now**, which posts the stored trace back to `/api/runproof/verify` and reports whether the fresh verdict matches the stored one.

Storage follows the leaderboard pattern (`src/lib/runproof-store.ts`): MongoDB when `DATABASE_URL` is a `mongodb://`/`mongodb+srv://` URI, otherwise an in-memory store that resets on restart. Both are bounded — memory keeps the newest 50 receipts; Mongo expires receipts after 180 days. A store failure answers 503 rather than pretending the receipt was saved.

## Integrity self-test

The console's "tamper my run (+1 score)" button verifies a copy of your last run with one extra claimed point. A working verifier must return `FLAG` with `score_mismatch`. The original run is untouched and can still be saved.

## Autonomous QA agent

The six-case suite runs the deterministic `RivalBot` across two QA seeds and three profiles (precise, greedy, patient), records the bot's actual jump/RUSH/world actions as fixed-tick inputs, and compares the bot's run outputs with a separate replay. It also checks bounded invariants: finite core state, legal jump/RUSH/world transitions, grounded alignment, and monotonic time/score/candles/streak.

The QA suite uses a deterministic fixture terrain (`src/game/runproof/qa-terrain.ts`), not market data — a regression must be attributable to the code under test, not to the day's chart. It is a rule-based regression agent, not an LLM, anti-cheat, or identity check.

## What it does not prove

- No zero-knowledge proof, no zkVerify submission, no wallet signature.
- Replay consistency only: it does not establish who produced the trace, and it does not bind a run to a wallet.
- Input origin is unauthenticated. The token authenticates **terrain**, not the player.
- The bot and its replay share one engine; the invariant layer is a bounded sanity check, not an independent physics oracle.
- A `PASS` in the QA suite covers the tested cases only.

## Request controls

Both write paths precheck `Content-Length` and enforce a streamed 2,000,000-byte cap, 2 concurrent requests per process, and 12 requests per rolling 60 seconds per client key, with a capped in-memory key map. These controls are process-local; a scaled deployment needs trusted ingress limits and shared rate/idempotency storage. Client IP extraction follows `src/lib/http-limiter.ts` (`x-real-ip` first, then the leftmost `x-forwarded-for` hop).

## Agent Games boundary

The official [Agent Games Rules](https://agentgames.zkverify.io/rules) and [build guide](https://agentgames.zkverify.io/build) describe general signature/HMAC and preflight handling; Khushi's Wildcard-specific Discord support reply says HMAC and preflight are for Gatekeeper/Steal, not Wildcard. `src/game/agentgames/adapter.ts` keeps the signature, preflight, and idempotency concerns behind injected providers, but no platform envelope or registration secret is wired in. See [`agentgames-protocol.md`](agentgames-protocol.md) for the source distinction.
