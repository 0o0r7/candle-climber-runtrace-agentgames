# RunTrace local QA workbench

RunTrace is a local Candle Climber game-testing workbench. It records gameplay controls on the engine's fixed 60 Hz tick, replays a trace against this branch's deterministic engine, and returns an `ACCEPT` or `FLAG` report with evidence. The verifier is deterministic TypeScript, not an LLM. This is a replay-consistency result, **not a cryptographic or zk proof**.

## Use the workbench

Run the app with the repository's existing Bun runtime and open the internal `/runproof` route. The default playtest uses a fictional synthetic OHLC fixture; it does not fetch market data. Use Space / ↑ / W or tap-and-hold the game area to jump, and Shift for RUSH. Touch screens also have accessible hold-to-jump and hold-for-RUSH buttons. Captured input is queued and stamped at the exact fixed simulation step that consumes it, not from browser animation-frame timestamps.

After a run, replay-check it and download the `runproof/v1` trace JSON. You can also import a previously saved trace or `runtrace/report-bundle/v1` review bundle, up to 2,000,000 bytes, and replay-check it against this build. For a review bundle, RunTrace extracts only its trace and recomputes the report; the saved report is discarded. Import sends the trace JSON to the same-origin `POST /api/runproof/verify` endpoint; the route does not persist the request. The page rejects oversized or invalid UTF-8 files before sending them. The API enforces the same streamed body cap and validates the trace before replay.

When a report is available, **Download review bundle** exports a `runtrace/report-bundle/v1` JSON object containing the input trace and deterministic report. It is a convenient round-trip review artifact, not a signature, attestation, or proof; both parts can be edited. On re-import only the trace is used, so editing the cached report cannot influence the fresh local result. The page also has small verifier test vectors for a valid trace, an altered score claim, and an impossible pre-summit world transition. Those test vectors are useful checks, not substitutes for importing a real trace.

## Verification contract

`POST /api/runproof/verify` validates the `runproof/v1` input shape and bounds, then replays the supplied inputs against this branch's `Engine`, `buildPlatforms`, and `dailyMutation`. The response follows policy `runproof/deterministic-replay/v1` with `ACCEPT` or `FLAG`, a concise reason, evidence, and replay diagnostics. The wire formats are documented in [`trace-schema.v1.json`](trace-schema.v1.json) and [`task-contract.v1.json`](task-contract.v1.json).

The verifier checks mutation selection and compares engine-replayed score, candle/streak totals, death cause, jump and landing events, and score-event history against trace claims. A `FLAG` describes a policy finding, not an accusation or identity claim. An `ACCEPT` only means the submitted trace agrees with this local replay under the checks implemented here.

The trace supplies its own terrain and input events. Provenance and input origin are unauthenticated; traces are editable and fabricable. A result never identifies a human player. The verifier does not create a cryptographic proof, authenticate a match, establish authoritative terrain, provide anti-cheat protection, submit to zkVerify, connect a wallet, or enforce leaderboard scores.

## Autonomous RivalBot QA suite

The one-click deterministic suite runs the cloned `RivalBot` across two synthetic seeds and three existing profiles: precise (`wickcop`), greedy (`goldenbull`), and patient (`frostliquidator`). It captures the bot's actual jump/RUSH/world-transition inputs and engine-generated score, landing, and jump events, then compares those outputs with a separate RunTrace replay.

Each case runs up to 1,800 fixed ticks. Local invariants check finite core state, legal jump/RUSH/world transitions, grounded alignment with a live platform, and nondecreasing time, score, candle count, and best streak. Findings include seed, profile, ruleset, a descriptive local build ID, full trace, replay report, and evidence. The build ID is not a source hash or signed attestation.

This is a deterministic rule-based QA agent, not an LLM. It is not an independent physics oracle: the bot run and replay use the same engine, and the extra checks cover only the listed invariants. A PASS does not establish correctness of every game mechanic.

## Request controls

The local verifier checks declared `Content-Length` and enforces a streamed 2,000,000-byte cap. It admits at most 2 concurrent requests per process and limits each client key to 12 requests per rolling 60 seconds; its in-memory key map is capped at 2,048 entries. These controls are process-local, not public deployment protection. A scaled service would need trusted ingress protections and shared persistent rate/idempotency storage. Client IP extraction follows the repository helper (`x-real-ip` first, then the leftmost `x-forwarded-for` hop); only trust `x-real-ip` when a trusted proxy overwrites it.

## Agent Games boundary and readiness

RunTrace is a Wildcard-oriented local build, not a product for all four Agent Games tracks. The local RivalBot suite is not connected to the platform. No Wildcard task envelope, sample task, or task-ID contract has been supplied, and the local adapter's example envelope is fabricated. The branch has no public repository, demo, write-up, or deployment. The published [Wildcard event page](https://agentgames.zkverify.io/events/wildcard) asks for a public agent link and lists an HTTPS endpoint “as requested in the submission form.” A Wildcard-specific organizer support answer supplied by the owner says HTTPS is optional and HMAC/preflight do not apply to Wildcard. These endpoint statements conflict; keep the ambiguity visible rather than guessing which requirement controls.

Creator requires a separate public content entry, `#AgentGames` and `@ZKVProtocol` if posted on X, and is judged on technical substance, clarity, zkVerify relevance, and originality. Gatekeeper is a distinct 60-second payment-decision agent that checks incoming proofs and emits its own decision proof. Steal the VFY is a distinct 20-turn strategy-commitment/proof-per-turn game. Their timing and current eligibility do not match the RunTrace product: the listed Steal window (13–17 November) has passed, Gatekeeper's daily-round labels are inconsistent through 20 November, and late eligibility or one-account participation across all four tracks remains unconfirmed. The overall 21 November close is listed without a time zone in the reviewed material. Do not claim RunTrace satisfies these other tracks or is submission-ready.

For the source distinction and the generic HMAC implementation notes, see [`agentgames-protocol.md`](agentgames-protocol.md). No public release, deployment, registration, contest submission, wallet connection/signature, transaction, or spend is part of this local work. The social copy/storyboard remains an unpublished draft in [`storyboard-draft.md`](storyboard-draft.md).
