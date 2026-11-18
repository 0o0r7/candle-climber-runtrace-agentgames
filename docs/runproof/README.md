# RunTrace local prototype

**Deterministic replay-consistency check; no cryptographic proof.** The `/runproof` route uses the Candle Climber `Engine` and renderer with a deterministic fictional OHLC fixture. `FixedTickInputRecorder` stamps browser actions at the fixed 60 Hz simulation boundary. The prototype trace format remains `runproof/v1`; the supported recorder IDs are `candle-climber-runproof-demo` and `candle-climber-runtrace-rival-qa`. See [`trace-schema.v1.json`](trace-schema.v1.json).

## Task contract

`POST /api/runproof/verify` accepts a raw trace, validates shape and bounds, then replays it against this branch's `Engine`, `buildPlatforms`, and `dailyMutation`. The `verify-run-trace` result uses policy `runproof/deterministic-replay/v1`, `ACCEPT` or `FLAG`, a concise reason/evidence, and replay diagnostics ([`task-contract.v1.json`](task-contract.v1.json)). This policy is deterministic TypeScript and engine replay, not an LLM. A `FLAG` is a policy result, not an accusation or identity claim.

The fixture is synthetic, not market data. Traces carry caller-supplied terrain and inputs, so provenance and input origin are unauthenticated. A result never identifies or proves a human player. There is no cryptographic or zk proof, wallet signature, zkVerify submission, leaderboard enforcement, or server-side score acceptance.

## Autonomous local QA agent

The one-click suite runs the cloned, deterministic `RivalBot` across two synthetic seed values and three existing profiles: precise (`wickcop`), greedy (`goldenbull`), and patient (`frostliquidator`). It captures the bot's actual jump/RUSH/world-transition actions as fixed-tick `InputEvent`s and records engine-generated score, landing, and jump events plus final run totals. Those actual outputs—not claims generated from the verifier—are compared with a separate RunTrace replay.

Each case runs up to 1,800 ticks. Local invariants also check finite core state, legal jump/RUSH/world transitions, platform-backed grounded alignment, and nondecreasing time, score, candle count, and best streak. Findings include the seed, profile, ruleset, descriptive local build ID, complete trace, replay report, and concise evidence. The build ID is not a source hash or signed attestation.

This is a deterministic rule-based game-QA agent, not an LLM. Its replay uses the same game engine as the bot run; the additional invariants are bounded sanity checks, not an independently implemented physics oracle. A PASS means only that these traces matched and these listed invariants held for the tested cases. It is not a general correctness, anti-cheat, identity, or cryptographic guarantee.

## Request controls

The local verifier prechecks `Content-Length` and enforces a streamed 2,000,000-byte cap. It admits at most 2 concurrent requests per process and limits each client key to 12 requests per rolling 60 seconds; its in-memory key map is capped at 2,048 entries. These controls are process-local, not public deployment protection. A scaled deployment needs trusted ingress protections and shared persistent rate/idempotency storage. Client IP extraction follows the repository helper (`x-real-ip` first, then the leftmost `x-forwarded-for` hop); only trust `x-real-ip` when a trusted proxy overwrites it.

## Agent Games boundary

The official [Agent Games Rules](https://agentgames.zkverify.io/rules) and [build guide](https://agentgames.zkverify.io/build) describe general signature/HMAC and preflight handling. Khushi's Wildcard-specific Discord support reply says HMAC and preflight are for Gatekeeper/Steal, not Wildcard, and that a public HTTPS point is optional here; this is distinct from the broader published wording. The cloned RivalBot QA mode provides deterministic autonomous game-testing behavior, but is not connected to the platform. No Wildcard envelope or task-ID contract has been supplied. This local-only prototype has no public repository/demo/write-up link; the Wildcard event page asks for a public agent link. See [`agentgames-protocol.md`](agentgames-protocol.md) for the source distinction and current readiness verdict.

The social copy/storyboard remains a local draft: [`storyboard-draft.md`](storyboard-draft.md). It preserves the synthetic-terrain and cryptographic/identity limits and has not been published.
