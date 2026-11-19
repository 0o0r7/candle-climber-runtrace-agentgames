# Candle Climber — RunTrace

**Deterministic replay-consistency verification for the Candle Climber game engine, plus an autonomous local QA agent that drives it.**

RunTrace is a verification layer built into this Candle Climber build. It records gameplay input at the fixed 60 Hz simulation boundary (not at browser frame time), replays that input against the same engine, and reports whether the replayed state agrees with the recorded outcome. A deterministic, rule-based QA agent (`RivalBot`) plays the game on its own, so runs can be produced, captured, and replayed without a human in the loop.

This build is prepared as a **Wildcard entry for [zkVerify Agent Games](https://agentgames.zkverify.io/events/wildcard)**.

> **Scope.** This is a deterministic replay-consistency check implemented in TypeScript, not a zero-knowledge proof, not anti-cheat, and not identity verification. It answers one narrow question: *given these inputs and this terrain, does this engine build reproduce the recorded outcome?* See [Limits](#limits).

---

## Quick start

Requires [Bun](https://bun.sh) (the repository's pinned runtime).

```sh
bun install --frozen-lockfile
bun run dev          # http://localhost:3000
```

| Route | What it is |
| --- | --- |
| `/` | Landing page |
| `/play` | The game (Space / ↑ / W to jump, Shift for RUSH) |
| `/runproof` | RunTrace console: one-click cases and the autonomous QA suite |
| `/leaderboard`, `/stats`, `/partners`, `/airdrop`, `/ops` | Game economy and operator surfaces |
| `POST /api/runproof/verify` | The verification endpoint |

## How verification works

1. **Capture.** `FixedTickInputRecorder` stamps each jump / RUSH / world-transition action at the engine's fixed 60 Hz step boundary, together with the terrain the run used.
2. **Replay.** The verifier rebuilds platforms and daily mutations from the submitted terrain and inputs, then steps the engine forward in a fresh instance.
3. **Compare.** Replayed score, jumps, landings, scoring events, and final totals are compared against the claims in the trace.
4. **Decide.** The endpoint returns `ACCEPT` or `FLAG` with a short reason, evidence, and replay diagnostics.

```
browser input ──▶ recorder (fixed-tick stamping) ──▶ trace (runproof/v1)
                                                          │
                                        POST /api/runproof/verify
                                                          │
                                    terrain rebuild + engine replay
                                                          │
                                     ACCEPT / FLAG + evidence
```

The verifier is deterministic TypeScript. No model, network call, or randomness is involved in the decision.

## Verification contract

`POST /api/runproof/verify` accepts a `runproof/v1` trace and returns:

- `task: "verify-run-trace"`
- `policy: "runproof/deterministic-replay/v1"`
- `decision: "ACCEPT" | "FLAG"`
- a short reason, evidence, and replay diagnostics

Malformed or out-of-bounds requests return an HTTP error rather than a decision. A well-formed trace that disagrees with replay gets `FLAG`.

- Input schema: [`docs/runproof/trace-schema.v1.json`](docs/runproof/trace-schema.v1.json)
- Result schema: [`docs/runproof/task-contract.v1.json`](docs/runproof/task-contract.v1.json)
- Prototype notes: [`docs/runproof/README.md`](docs/runproof/README.md)

**Request controls.** The handler prechecks `Content-Length` and enforces a streamed 2,000,000-byte cap, admits at most 2 concurrent requests per process, and limits each client key to 12 requests per rolling 60 seconds (key map capped at 2,048 entries). These controls are process-local and are not a substitute for ingress-level protection on a scaled deployment.

## Autonomous QA agent

`RivalBot` is a deterministic planner: it chooses jump / RUSH actions from the seed, engine state, and one of three existing personality profiles — precise (`wickcop`), greedy (`goldenbull`), patient (`frostliquidator`). It uses no LLM, no network, and no randomness for gameplay decisions.

The `/runproof` suite runs six cases (two synthetic seeds × three profiles, up to 1,800 fixed ticks each). Optional observer hooks capture the bot's actual jump / RUSH / world-transition actions and the engine's own jump, landing, and score events. Those captured traces are then checked by the separate replay path above, and a bounded invariant layer verifies:

- finite core engine values
- legal jump / RUSH / world-transition sequences
- grounded player alignment with a live platform
- non-decreasing time, score, candle count, and best streak

Each finding carries the seed, profile, ruleset, a descriptive local build ID, the full trace, and replay evidence. The build ID is descriptive — it is not a source hash or a signed attestation.

## Limits

These constraints are deliberate and stated up front:

- **No cryptographic proof.** There is no zk proof, wallet signature, or zkVerify submission in this build's verification path.
- **Synthetic terrain.** The demo fixture is fictional and editable. It is not market data.
- **Unauthenticated provenance.** Traces carry caller-supplied terrain and inputs; who produced them cannot be established by this system.
- **No identity claim.** A result never identifies or proves that a human played.
- **Same-engine replay.** The bot run and its replay use the same engine. The invariants are bounded sanity checks, not an independently implemented physics oracle.
- **Bounded meaning of PASS.** A pass means these traces matched and these listed invariants held for the tested cases — not that all game physics is correct.

The verifier's full honesty boundary is documented in [`docs/runproof/README.md`](docs/runproof/README.md).

## Repository layout

```
src/game/cc/            Game engine, physics, rendering, scoring
src/game/cc/rival/      Deterministic RivalBot planner
src/game/runproof/      Recorder, replay verifier, QA agent, HTTP guard
src/game/agentgames/    Composable adapter factory (signature/preflight/idempotency)
src/app/runproof/       RunTrace console UI
src/app/api/runproof/   Verification endpoint
docs/runproof/          Trace schema, result contract, prototype notes
docs/competition/       Agent Games submission material
```

## Competition material

- [Submission overview](docs/competition/README.md)
- [Wildcard entry draft](docs/competition/wildcard-entry.md)
- [Creator Track content plan](docs/competition/creator-track.md)
- [Deployment guide](docs/DEPLOYMENT.md)

## Checks

```sh
bun run lint
bun test
bunx tsc --noEmit --incremental false
node node_modules/next/dist/bin/next build   # production build; see docs/DEPLOYMENT.md for why this runs under Node
```

## License

See [LICENSE](LICENSE).
