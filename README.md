# RunTrace — deterministic replay-consistency check

**No cryptographic proof.** RunTrace makes gameplay runs reproducible for game testing: it captures inputs at fixed simulation ticks and replays them against this branch's Candle Climber engine. Its verifier is deterministic TypeScript, not an LLM. The local autonomous QA mode separately uses the existing deterministic RivalBot planner to generate seed/profile runs, capture its inputs, replay them, and check bounded state invariants. It is not cryptographic proof, anti-cheat, or identity verification.

This is a local-only prototype on the isolated `agentgames/runproof` branch. The clone intentionally has no Git remote. Its existing `/runproof` and `/api/runproof/verify` paths remain internal; the regular `/play` route and production checkout are untouched.

## Try the local demo

Requires the repository's existing Bun runtime:

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:3000/runproof`. One-click cases demonstrate a valid trace, an altered score claim, and an impossible world transition; the panel shows the decision, reason, and evidence. You can also play a short run with Space / ↑ / W or tap-and-hold to jump, and Shift for RUSH. Afterward, replay-check locally or download the trace. The demo does not persist traces.

The recorder captures input at the 60 Hz engine-step boundary, not from browser frame timestamps. The fixture is synthetic, fictional, and editable. Terrain provenance and input origin are not authenticated.

## Autonomous local QA agent

The one-click six-case suite runs the cloned `RivalBot` across two synthetic seeds and three existing profiles (precise, greedy, patient), up to 1,800 fixed ticks each. Optional observer hooks record the bot's actual jump/RUSH/world-transition actions and engine outcomes; those captured traces are then checked by the separate RunTrace replay. Additional local invariants check finite core engine values, legal jump/RUSH/world transitions, valid grounded platform alignment, and monotonic time/score/counters. A flagged finding carries the seed, profile, ruleset, descriptive local build ID, full trace, and replay evidence. The build ID is descriptive, not a source hash or signed attestation.

This is a deterministic rule-based game-QA agent, not an LLM. The invariants are not an independently implemented physics oracle: the run and replay use the same engine, and the checks only detect the bounded conditions listed above. Results show local regression/replay consistency, not correctness of all game physics.

## Deterministic task contract

`POST /api/runproof/verify` accepts the prototype `runproof/v1` trace ([input schema](docs/runproof/trace-schema.v1.json)) and returns `task: "verify-run-trace"`, policy `runproof/deterministic-replay/v1`, `decision: "ACCEPT" | "FLAG"`, a short reason, evidence, and replay diagnostics ([result schema](docs/runproof/task-contract.v1.json)). A well-formed trace that disagrees with replay gets `FLAG`; malformed or rejected HTTP requests return an HTTP error.

The policy checks trace shape/bounds, mutation selection, and engine replay against the claimed score, jump, landing, and scoring-event values. A replay match only shows consistency for the submitted inputs/terrain and this matching engine/build/configuration. Anyone can edit or fabricate the input, terrain, recorder metadata, or claims. A result never identifies a human or proves that a human played.

## Agent Games adapter status

A separate composable handler factory locally prototypes the general documented raw-body signature flow, signed responses, preflight response, task-ID idempotency, streamed request-size enforcement, and bounded concurrency/rate controls. Khushi's Wildcard-specific Discord support answer says HMAC and preflight are for Gatekeeper/Steal, not Wildcard; it also says a public HTTPS point is optional here. The published general Rules/build wording remains broader, so the distinction is recorded in [the local Agent Games readiness note](docs/runproof/agentgames-protocol.md). No Wildcard envelope or task-ID contract has been supplied, and the local adapter's test envelope is only a fabricated fixture.

The published general Rules/build material does not specify the HMAC algorithm or signature-header encoding. The generic prototype therefore uses an injected signature-provider interface; its test-only signer is not claimed to match the platform and is not wired into production. No registration secret is stored, no endpoint is mounted for contest registration, and no platform preflight has been run. Per the Wildcard-specific support answer, these HMAC/preflight gaps are not blockers for Wildcard.

This local prototype is **not** submission-ready: it has no public repository/demo/write-up link, and the published Wildcard page asks for a public agent link. The clone includes a deterministic, rule-based autonomous RivalBot QA agent; the official Rules define an agent as a program and do not require an LLM. No Wildcard envelope has been supplied, so actual task-protocol integration is unvalidated. The event page lists a public HTTPS endpoint, while Discord support says one is optional here; this work remains local-only and will not publish or deploy an endpoint. Do not call it LLM- or zk-powered.

## Request bounds and deployment caveat

The local replay endpoint rejects a declared `Content-Length` above 2,000,000 bytes and enforces the cap while reading the body stream, including when the header is absent or underreports. It allows at most 2 in-flight checks per process and 12 requests per client key per rolling 60 seconds; its in-memory key map is capped at 2,048 buckets. The generic Agent Games adapter uses the same bounded request guard and an in-memory task-response cache capped at 512 entries with 24-hour retention.

These are local, per-process controls—not shared production protection. A public or horizontally scaled service needs trusted ingress controls plus durable, shared rate limiting and idempotency storage. Client keys use the repository helper (`x-real-ip` first, then the leftmost `x-forwarded-for` hop); only trust `x-real-ip` when a trusted proxy overwrites it, because the forwarded-header fallback can be spoofed. Process restarts and multiple instances do not share state.

## Limits and non-goals

The demo does not create a cryptographic or zk proof, integrate with zkVerify, use a wallet, authenticate players, enforce leaderboard policy, or make the regular game accept scores. It does not establish authoritative terrain provenance, authenticated inputs, human identity, or protection from cheating. The game's separate run-token and leaderboard mechanisms are not used.

The current page is explicitly titled **“RunTrace — deterministic replay-consistency check”** and states **“No cryptographic proof.”** Local social copy/storyboard is in [the draft storyboard](docs/runproof/storyboard-draft.md); it is not published.

## Local checks

```sh
bun test
bun run lint
bunx tsc --noEmit --incremental false
bun run build --webpack
```

## License and isolation

The upstream Candle Climber [`LICENSE`](LICENSE) remains in place (MIT). RunTrace directly uses the existing engine, platform builder, mutation selector, and renderer; those upstream portions remain subject to the included license and notice requirement. The trace format and recorder metadata are prototype conventions, not an upstream standard.

All task changes stay in `/workspace/candle-climber-agentgames` on `agentgames/runproof`. Do not add a remote, commit, deploy, publish, submit, connect a wallet, sign, or spend. The separate `/workspace/candle-climber` checkout remains outside scope.
