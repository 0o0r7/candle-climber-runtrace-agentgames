# Wildcard entry — RunTrace

Draft for the [Wildcard](https://agentgames.zkverify.io/events/wildcard) submission form and public write-up.

> Replace `PUBLIC_URL` with the deployed address before submitting.

## One line

RunTrace records Candle Climber runs at the simulation tick boundary, replays them against the same engine, and turns a matching run into a shareable receipt. Player runs are played on the day's real market chart and the server signs the terrain it served, so a receipt cannot be moved to a hand-edited level. The same engine powers an autonomous QA agent that plays the game on its own and checks every run for replay consistency and bounded state invariants.

## The problem

Gameplay claims are cheap. "I scored 12,400", "the boss killed me unfairly", "this level is impossible", "my physics patch didn't change anything" — all of these are assertions about a run that nobody else can inspect after the fact. Studio QA teams spend real time re-running scenarios by hand to find out whether a bug report or a balance change is reproducible.

The narrow, useful question is: *can this run be re-executed and does it produce the same outcome?* RunTrace answers that question mechanically.

## Who it helps

- **Game QA and test engineers** — reproduce a flagged run from a trace instead of re-playing it manually.
- **Gameplay and balance designers** — check whether a physics or mutation change alters recorded runs, deterministically.
- **Players and testers reporting bugs** — attach a trace instead of a description; the replay either reproduces the fault or it doesn't.

## What the agent does

1. **Plays autonomously.** `RivalBot` is a deterministic planner over three existing personality profiles (precise, greedy, patient). No LLM, no network, no randomness in gameplay decisions. It runs up to 1,800 fixed 60 Hz ticks per case across two synthetic seeds — six cases per suite.
2. **Records at the simulation boundary.** Input is stamped at the engine's fixed step, not at browser frame time, so replays are frame-rate independent.
3. **Replays in a fresh engine instance.** Terrain is rebuilt from the trace, the engine is stepped forward, and score, jumps, landings, scoring events, and totals are compared against the run's own recorded outputs. When the trace carries the server-issued run token, the verifier also recomputes the candle fingerprint and rejects terrain that differs from the level the server served.
4. **Checks bounded invariants.** Finite core state, legal jump / RUSH / world transitions, grounded alignment with a live platform, and monotonic time, score, candle count, and best streak.
5. **Returns structured evidence.** Every finding carries the seed, profile, ruleset, build ID, the complete trace, and the replay report. The HTTP endpoint returns `ACCEPT` or `FLAG` with a reason and diagnostics.

## Public endpoint

```
POST PUBLIC_URL/api/runproof/verify
Content-Type: application/json
```

Accepts a `runproof/v1` trace and returns `task: "verify-run-trace"`, `policy: "runproof/deterministic-replay/v1"`, `decision: "ACCEPT" | "FLAG"`, a short reason, evidence, and replay diagnostics. Malformed or oversized requests return an HTTP error. Schemas: [trace](../runproof/trace-schema.v1.json), [result](../runproof/task-contract.v1.json).

```
POST PUBLIC_URL/api/runproof/runs        # verify + store a receipt (attested terrain required)
GET  PUBLIC_URL/api/runproof/runs/{id}   # read the stored receipt and its trace
```

Receipts are viewable at `PUBLIC_URL/runproof/r/{id}` and can be re-verified from that page.

## Build context

- **Stack.** Next.js 16 (App Router) + React 19 + TypeScript, Bun runtime. The game engine is the existing Candle Climber engine; RunTrace sits on top of it and does not modify gameplay.
- **Deterministic decision layer.** The verifier is plain TypeScript — engine replay plus explicit comparisons. No model is involved in the verdict.
- **Separate capture and check paths.** The QA suite compares the bot run's own engine outputs against a separate replay instance, so the check is not reading the verifier's claims back to itself.
- **Bounded request handling.** 2,000,000-byte streamed cap, 2 concurrent requests per process, 12 requests per rolling 60 seconds per client key, with a capped key map.
- **Composable adapter.** `src/game/agentgames/adapter.ts` isolates the signature, preflight, and idempotency concerns behind injected providers, so a platform integration can be attached without touching the verification core.

## What this entry does not claim

Stated plainly, because the credibility of the build depends on it:

- It produces **no** zero-knowledge proof and makes **no** zkVerify submission.
- It verifies **replay consistency**, not truth: a matching replay shows the inputs and terrain produce that outcome on this engine build — nothing about who submitted them.
- Terrain is attested by a server-signed run token when present; **inputs remain caller-supplied** and unauthenticated, and no receipt identifies a player or wallet.
- The autonomous QA suite runs on a **deterministic fixture terrain** so a regression is attributable to the code under test; player runs use the same real market candles as the game.
- The bot and its replay share **one engine**; the invariant layer is a bounded sanity check, not an independent physics oracle.
- A `PASS` covers the tested cases only.

## Possible verifiability extension (not implemented)

The natural next step is to make the claim checkable by a third party rather than by the same process: commit to a hash of the trace and the engine build, and publish a proof that the replayed final state equals the claimed final state under the committed inputs. That turns "trust this verdict" into "check this relation". It is described here as direction only — nothing in this build implements it.

## Links

- Demo and console: `PUBLIC_URL/runproof`
- Game: `PUBLIC_URL/play`
- Repository: this repository
- Verification notes: [../runproof/README.md](../runproof/README.md)
