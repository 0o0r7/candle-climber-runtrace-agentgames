# Agent Games protocol — what this build implements

This document replaces an earlier local-only readiness note. It describes the
protocol surface that exists in the code today, the parts of the published
protocol that remain unspecified, and how to verify the whole thing end to end.

Related: [submission TODO](../competition/TODO.md) ·
[readiness requirements](../competition/READINESS.md) ·
[product identity](../PRODUCT-IDENTITY.md)

## Published wording vs. what is implemented

| Topic | Official source | This build |
| --- | --- | --- |
| Public HTTPS endpoint | Rules §§1.2–1.3; Wildcard event page | `POST /api/agentgames` (signed tasks) and `POST /api/runproof/verify` (public verification) |
| Inbound signature header | Rules: `x-agent-games-signature` | Verified over the exact raw request bytes before JSON parsing |
| Signed responses | Rules §1.2 | Every response carries `x-agent-games-signature` over the exact response bytes |
| Preflight | Build guide: `agent-games.preflight.v1` → `{ "ok": true, "protocolVersion": "v1" }` | Implemented verbatim |
| Task-ID idempotency | Rules §1.2 | Same ID + same body → identical signed response; same ID + different body → `409` |
| Digest algorithm, header encoding, canonicalization | **Not published** | Implemented candidate: HMAC-SHA-256 over raw bytes, UTF-8 key from the displayed secret, lowercase hex |
| Wildcard task envelope | **Not published** | Local contract `runproof.verify.v1` (below) |

Two sources disagree about whether Wildcard dispatches signed tasks at all: the
published Rules/build material describes the general hosted-agent protocol, and
an event-specific support answer (owner-provided Discord screenshot, 18 Nov
2026) says HMAC and preflight apply to other tracks, not Wildcard. Both are
recorded here rather than resolved by assumption. The signed endpoint is
implemented so that either reading is satisfied.

## The signed endpoint

```
POST /api/agentgames
content-type: application/json
x-agent-games-signature: <hmac-sha256 hex over the exact request body>
```

Configuration: `AGENT_GAMES_HMAC_SECRET`. Without it the route answers
`503 {"error":"agent_games_protocol_not_configured"}` — there is no key to
verify against, and unsigned tasks are never executed.

### Preflight

```json
{ "type": "agent-games.preflight.v1" }
```

→ `200 {"ok":true,"protocolVersion":"v1"}`, signed.

### Verification task

```json
{ "type": "runproof.verify.v1", "taskId": "<idempotency key>", "trace": <runproof/v1> }
```

→ the same report `POST /api/runproof/verify` returns, signed. The adapter
delegates to the deterministic verifier, so the two paths cannot drift.

This envelope is this build's own contract. Agent Games has not published a
Wildcard envelope; when one is supplied, only
`src/game/agentgames/tasks.ts` changes.

#```mermaid
sequenceDiagram
  autonumber
  participant P as Agent Games platform
  participant A as POST /api/agentgames
  participant V as Deterministic verifier
  participant I as Idempotency cache

  P->>A: raw body + x-agent-games-signature
  A->>A: verify HMAC over exact raw bytes
  alt signature invalid
    A-->>P: 401 signed error
  else preflight
    A-->>P: 200 {ok:true, protocolVersion:"v1"} signed
  else runproof.verify.v1 task
    A->>I: lookup taskId + body fingerprint
    alt same ID, same body
      I-->>A: cached signed response
    else same ID, different body
      A-->>P: 409 signed conflict
    else new task
      A->>V: replay trace
      V-->>A: ACCEPT / FLAG + evidence
      A->>I: store signed response
      A-->>P: 200 signed report
    end
  end
```

## Behaviour summary

| Request | Answer |
| --- | --- |
| Missing signature | `401` |
| Wrong signature | `401` |
| Body over the 2 MB streamed cap | `413` |
| Malformed JSON | `400` |
| Unknown task type | `400` |
| Same task ID, same body (retry) | Original signed response, byte-identical |
| Same task ID, different body | `409` |
| More than 12 requests / 60 s from one client | `429` with `Retry-After` |
| More than 2 concurrent requests in a process | `503` with `Retry-After` |

Rate limits, concurrency and the idempotency cache are **process-local**. A
horizontally scaled deployment needs a shared store; this is documented rather
than hidden.

## Verifying it

The scenario suite plays the game as an automated player and walks every public
surface, including the signed protocol:

```sh
bun scripts/agent-games-scenarios.ts                                   # local
BASE_URL=https://<deployment> bun scripts/agent-games-scenarios.ts     # deployed
```

It writes [../evidence/agent-games-scenarios.json](../evidence/agent-games-scenarios.json):
per-scenario verdicts, latencies, the terrain hash, the recorded run's claims,
and the issued receipt. The signing key is never written to the file.

Latest local run: **14 / 14 passed**, 0 skipped, 0 failed.

| Scenario | Asserts |
| --- | --- |
| `deployment.home`, `deployment.showcase` | Both routes serve real HTML |
| `terrain.attested` | `/api/candles` returns candles and a run token |
| `agent.run` | The bot completes a run with zero engine-invariant findings |
| `verify.accept` | The public verifier returns `ACCEPT` for that trace |
| `verify.tamper` | `+1` score returns `FLAG` |
| `receipt.issue` / `receipt.read` | Receipt is stored, read back, and re-verifies |
| `receipt.unattested` | A tokenless trace is refused with `422` |
| `protocol.preflight` / `protocol.task` | Signed handshake and signed task, response signature verified |
| `protocol.bad-signature` | Unsigned request rejected with `401` |
| `protocol.idempotency` / `protocol.conflict` | Byte-identical retry; `409` on conflicting reuse |

## What remains unknown

1. **The real digest profile.** The platform does not publish the algorithm or
   encoding. The implemented profile is the documented competitor-evidence
   candidate; if the platform's differs, only the injected provider changes.
2. **The Wildcard task envelope.** None has been published. The local contract
   exists so the pipeline is exercised end to end.
3. **Whether Wildcard sends signed tasks.** Sources disagree (see above).
4. **Shared rate limiting.** Process-local controls are not distributed limits.

None of these is presented as solved.
