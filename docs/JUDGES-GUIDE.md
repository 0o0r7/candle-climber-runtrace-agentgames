# Judges' guide — Candle Climber · RunTrace

**Audience:** Agent Games judges and technical reviewers evaluating this repository as a
Wildcard entry for [zkVerify Agent Games](https://agentgames.zkverify.io/events/wildcard).

**The one-sentence version:** RunTrace records gameplay inputs at the fixed 60 Hz
simulation boundary, replays them in a fresh instance of the same engine, compares the
replayed outcome against the recorded claims, and publishes the verdict as a shareable,
re-verifiable receipt — with the terrain bound to the run by a server-signed token.

| | |
| --- | --- |
| Live demo | <https://candle-climber-runtrace.vercel.app> |
| Public console | [/runproof](https://candle-climber-runtrace.vercel.app/runproof) — play, verify, save a receipt |
| Signed endpoint | `POST /api/agentgames` — preflight, verification tasks, idempotency |
| Machine-readable evidence | [`docs/evidence/agent-games-scenarios.json`](evidence/agent-games-scenarios.json) — 22/22 scenarios against the deployment |
| Submission checklist | [`docs/competition/TODO.md`](competition/TODO.md) |

---

## 1. Verify everything yourself in under two minutes

The whole surface — including an automated player that genuinely plays the day's level —
is reproducible with one command after a normal clone and install:

```sh
git clone https://github.com/0o0r7/candle-climber-runtrace-agentgames
cd candle-climber-runtrace-agentgames
bun install --frozen-lockfile
bun test                          # 663 tests, 62 files
bun scripts/agent-games-scenarios.ts   # 22 scenarios, writes machine-readable evidence
```

The scenario suite covers the public pages, the attested terrain, a genuine headless
agent run, the public verifier (`ACCEPT` and every documented `FLAG` reason), receipts,
the signed protocol, and the transport guards. Without `AGENT_GAMES_HMAC_SECRET` set
locally, the four signed-protocol scenarios are reported `SKIP` and everything else
still runs; against the production deployment the signed scenarios need the platform's
key. The committed evidence file holds the production run.

Spot-check the live deployment without cloning:

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://candle-climber-runtrace.vercel.app/runproof        # 200
curl -s -X POST https://candle-climber-runtrace.vercel.app/api/agentgames \
     -H "content-type: application/json" -d '{}'                                                   # 401 — signature gate
curl -s -X POST https://candle-climber-runtrace.vercel.app/api/runproof/verify \
     -H "content-type: application/json" -d '{}'                                                   # 200 — FLAG: Expected runproof/v1.
```

## 2. System architecture

The verification layer sits on top of the existing Candle Climber engine and does not
modify gameplay. Each concern — capture, attestation, replay, storage, protocol — is an
independent module behind its own boundary.

```mermaid
flowchart TB
  subgraph GAME["Game engine — src/game/cc"]
    ENG["Fixed-tick simulation<br/>60 Hz · FIXED_DT"]
    BOT["RivalBot planner<br/>deterministic, no LLM"]
  end

  subgraph CAPTURE["Capture — src/game/runproof"]
    REC["Input recorder<br/>input events at tick boundaries"]
    TRC["runproof/v1 trace<br/>inputs + terrain + claims"]
  end

  subgraph SERVER["Server surfaces — src/app/api"]
    CANDLES["GET /api/candles<br/>terrain + HMAC run token"]
    VERIFY["POST /api/runproof/verify<br/>public verifier"]
    RUNS["POST · GET /api/runproof/runs<br/>receipt store (MongoDB · TTL 180 d)"]
    AGENT["POST /api/agentgames<br/>signed protocol"]
  end

  subgraph CHECK["Decision layer — src/game/runproof"]
    ATTEST["Attestation<br/>terrain fingerprint vs token"]
    REPLAY["Replay<br/>fresh engine instance"]
    CMP["Compare<br/>claims vs replayed outcome"]
  end

  CANDLES -->|"candles + runToken"| GAME
  BOT --> ENG --> REC --> TRC
  TRC --> VERIFY --> ATTEST --> REPLAY --> CMP
  CMP -->|"ACCEPT / FLAG"| RUNS
  TRC --> AGENT
  CMP -->|"same decision"| AGENT
  RUNS --> RECEIPT["Receipt page<br/>/runproof/r/{id} — re-verifiable by anyone"]
```

## 3. The public verification path

```mermaid
sequenceDiagram
  autonumber
  participant C as Console / RivalBot
  participant S as Server
  participant E as Fresh engine instance
  C->>S: GET /api/candles
  S-->>C: candles + HMAC run token (binds symbol, date, terrain fingerprint)
  C->>C: play — record every action at the 60 Hz tick boundary
  C->>S: POST /api/runproof/verify (runproof/v1 trace)
  S->>S: validate shape — strict schema, unknown keys rejected
  S->>S: attest — recompute candle fingerprint, compare with the token
  S->>E: replay all ticks from the submitted inputs
  E-->>S: replayed score, candles, streaks, jump/land/score tick arrays
  S->>S: compare claims against replay, element by element
  S-->>C: ACCEPT or FLAG — reason, evidence, replay diagnostics
  C->>S: POST /api/runproof/runs (attested traces only)
  S-->>C: 201 receipt — verdict + trace stored, re-checkable at /runproof/r/{id}
```

A trace that disagrees with its own replay is flagged with a specific issue code —
`score_mismatch`, `ticks_after_death`, `run_token_terrain_mismatch`,
`mutation_mismatch`, `run_token_seed_mismatch` — so a forged score is not merely
rejected but *diagnosed*. The negative-path matrix in
[`docs/competition/READINESS.md`](competition/READINESS.md) lists one case for every
claim; each `FLAG` case asserts its own code, so a flag for the wrong reason still
counts as a failure.

## 4. The signed Agent Games protocol

`POST /api/agentgames` is the opt-in surface for the platform. It stays inert (503)
until `AGENT_GAMES_HMAC_SECRET` is configured — it never accepts unsigned tasks.

```mermaid
sequenceDiagram
  autonumber
  participant P as Agent Games platform
  participant A as /api/agentgames handler
  participant V as RunTrace verifier
  P->>A: signed preflight — {"type": "agent-games.preflight.v1"}
  A->>A: verify HMAC-SHA256 over the exact raw body bytes
  A-->>P: 200 {"ok": true, "protocolVersion": "v1"} — signed response
  P->>A: signed task — {"type": "runproof.verify.v1", "taskId": "...", "trace": {...}}
  A->>V: run the same deterministic verifier
  V-->>A: decision + evidence
  A-->>P: 200 signed report — taskId treated as an idempotency key
  P->>A: same taskId, same body → identical signed response (replayed from cache)
  P->>A: same taskId, different body → 409 conflict, first answer unchanged
  P->>A: wrong signature → 401, nothing executed
```

**Signature profile — stated honestly.** The published pages describe signing raw
bytes but do not name the algorithm or header encoding. This build implements one
documented candidate — HMAC-SHA-256 over the exact raw body, UTF-8 key from the
displayed secret string, lowercase hex — and labels it as an inference from competitor
implementations, not a confirmed platform contract
([`docs/runproof/agentgames-protocol.md`](runproof/agentgames-protocol.md)). If the
platform sends signed tasks with a different profile, only the injected
`AgentGamesSignatureProvider` needs replacing; the verifier is untouched.

**Both paths answer with the same decision.** A signed task and a public
`POST /api/runproof/verify` call map to the same verifier, so the platform is never the
only way in — judges can reproduce any verdict through the public route alone.

## 5. What the tests cover

- `bun test` — 663 tests across 62 files: engine invariants, recorder/replay
  compatibility, signature gates, store fallbacks, pre-launch guards.
- `bun scripts/agent-games-scenarios.ts` — 22 end-to-end scenarios against a running
  server: pages, terrain attestation, a genuine headless agent run, `ACCEPT`, every
  documented `FLAG` code, receipts, the signed protocol, and the 413 / 400 / 422
  transport guards.
- CI runs lint, tests, and `tsc --noEmit` on every push to the tracked branches.

## 6. Stated limits — read before scoring

These constraints are deliberate and are documented where the code lives
([`docs/runproof/README.md`](runproof/README.md)):

- **No cryptographic proof.** No zk proof, no wallet signature, no zkVerify submission
  in this build's verification path. zkVerify integration is documented as a v2
  direction, and agents without zkVerify are eligible per the Wildcard page.
- **Terrain is attested; inputs are not.** The server-signed run token binds the trace
  to the terrain the server actually served; the input log itself is caller-supplied
  and its origin is not authenticated.
- **No identity claim.** A verdict never identifies who played; receipts do not bind
  runs to wallets.
- **Same-engine replay.** Replay uses the same engine build — it checks
  replay-consistency, not independent physics correctness.

## 7. Where to look in the code

| Area | Path |
| --- | --- |
| Verifier core (replay + compare) | `src/game/runproof/verify.ts` |
| Terrain attestation (run token) | `src/game/runproof/attest.ts` |
| Input recorder | `src/game/runproof/recorder.ts` |
| Headless agent runner | `src/game/runproof/agent-run.ts` |
| Signed protocol adapter | `src/game/agentgames/adapter.ts` |
| Task envelope mapping | `src/game/agentgames/tasks.ts` |
| HTTP guard (2 MB cap, rate, concurrency) | `src/game/runproof/http-guard.ts` |
| Receipt store (MongoDB + memory fallback) | `src/lib/runproof-store.ts` |
| Endpoint wiring | `src/app/api/runproof/verify/route.ts`, `src/app/api/agentgames/route.ts` |
| Deterministic bot | `src/game/cc/rival/bot.ts` |
