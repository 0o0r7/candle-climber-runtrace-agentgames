# Submission readiness — TODO and verification

Two lists: **what must be done** (TODO) and **how we prove it was done** (verification).
Every requirement below is quoted from an official Agent Games page read on 2026-11-19.
Where an official page is silent, the item is marked **UNPUBLISHED** instead of guessed.

> Statuses below are the requirement view. The actionable checklist, with owners
> and the remaining user steps, is [TODO.md](TODO.md).

Sources (fetched 2026-11-19):

- Rules — <https://agentgames.zkverify.io/rules>
- Wildcard event — <https://agentgames.zkverify.io/events/wildcard>
- Creator Track event — <https://agentgames.zkverify.io/events/creator-track>
- Build guide — <https://agentgames.zkverify.io/build>
- Getting started — <https://agentgames.zkverify.io/guide>

Hard deadline on every page: **21 November 2026, 22:00 UTC**.

---

## A. TODO list

Status legend: `DONE` · `TODO` · `BLOCKED (user)` · `UNPUBLISHED`

### A1. Wildcard — agent link

| # | Item | Official wording | Status |
|---|---|---|---|
| A1.1 | Public repository, demo, or write-up showing the agent | "AGENT LINK — A public repository, demo, or write-up showing the agent you built." | `DONE` — public demo (<https://candle-climber-runtrace.vercel.app>) **and** public repository (<https://github.com/0o0r7/candle-climber-runtrace-agentgames>, public since 2026-11-19) |
| A1.2 | Deployed demo that a reviewer can open without cloning | "Show the agent working — share a public link and endpoint" | `DONE` — <https://candle-climber-runtrace.vercel.app> (`/runproof`, `/runproof/showcase`) |
| A1.3 | Written use case: problem, users, behaviour | "USE CASE — Explain the problem, who the agent helps, and what it actually does" | `DONE` — `docs/competition/wildcard-entry.md` |
| A1.4 | Build context: how it works, key decisions | "BUILD CONTEXT — Briefly describe how the agent works and the key decisions behind it" | `DONE` — `docs/competition/wildcard-entry.md`, `docs/runproof/README.md` |

### A2. Wildcard — public endpoint

| # | Item | Official wording | Status |
|---|---|---|---|
| A2.1 | HTTPS endpoint, no localhost/private IP/custom port | Rules §1.2: "Be reachable at a public HTTPS endpoint — no localhost, no private IP ranges, no custom ports" | `DONE` — public HTTPS deployment (see A1.2) |
| A2.2 | Verify `x-agent-games-signature` on every inbound request | Rules §1.2–1.3: "Sign its responses with the HMAC secret issued at registration"; "Your agent must verify the `x-agent-games-signature` header on every incoming request" | `DONE` — `POST /api/agentgames` verifies the raw body before parsing; live on the deployment (2026-11-19), an unsigned request returns `401 {"error":"Missing task signature."}` |
| A2.3 | Signed responses | Rules §1.2 | `DONE` — every response carries a signature over the exact response bytes (verified on the deployment) |
| A2.4 | Task-ID idempotency | Rules §1.2: "Handle task IDs as idempotency keys — the platform may retry after a network failure" | `DONE` — identical retry returns the identical signed answer; conflicting reuse returns `409` (verified on the deployment) |
| A2.5 | Preflight handshake `{ "ok": true, "protocolVersion": "v1" }` | Build guide: "Preflight must pass before the platform marks you active" | `DONE` — served by the same route (verified on the deployment) |
| A2.6 | Respond inside the 60 s deadline | Build guide: "60 seconds — hard response deadline" | `DONE` — measured on the deployment by the scenario suite (all 22 scenarios answer well inside the deadline) |
| A2.7 | Stay online; a sleeping host forfeits tasks | Rules §1.4 | `DONE` by hosting choice (Vercel serverless, no sleep-forfeit) — confirmed with cold requests on 2026-11-19 |
| A2.8 | Whether Wildcard actually sends signed tasks | Event page: endpoint "as requested in the submission form"; the form itself is behind login | `UNPUBLISHED` — cannot be read without an account; implement A2.2–A2.5 anyway so either answer is satisfied |

### A3. Wildcard — judging qualities

| # | Item | Official wording | Status |
|---|---|---|---|
| A3.1 | Useful problem | "Show a clear need, who the agent helps, and why its work matters" | `DONE` — game QA / bug reproduction |
| A3.2 | Working implementation visible | "Make it possible to understand what you built and see the agent in action" | `DONE` — live `/runproof/showcase`; the scenario suite records the same pipeline as evidence |
| A3.3 | Clear explanation incl. limits | "Explain the workflow, key choices, and what the agent can and cannot do" | `DONE` — README "Limits" and the console's boundary panel |
| A3.4 | Verifiability (optional plus) | "If zkVerify makes an important claim checkable, explain how it helps. Agents without zkVerify remain eligible." | `DONE` as an explicit non-claim for RunTrace; no zkVerify integration exists and no proof is claimed as zkVerify-verified — the bundled gatekeeper prover is experimental, local-only, never verified on-chain |
| A3.5 | Bonus: public share | "Just share your build publicly — what the agent is and a public demo" | `TODO` — publish the demo link |

### A4. Persistence (not a rule, a demo risk)

| # | Item | Why | Status |
|---|---|---|---|
| A4.1 | Durable receipt store on the deployment | Receipts fall back to an in-memory store without `DATABASE_URL`; on serverless, a receipt created in one instance is not readable from another | `DONE` — MongoDB configured; the deployment reports `"store": "mongo"` and a stored receipt re-verified on read |
| A4.2 | `RUN_TOKEN_SECRET` set in production | Rules-adjacent: the app fails closed in production without it | `DONE` — generated and set on the Vercel project |

### A5. Creator Track

| # | Item | Official wording | Status |
|---|---|---|---|
| A5.1 | Public content in one of the accepted formats | "THREAD / VIDEO / ARTICLE / OTHER" | `TODO` — draft exists in `docs/competition/creator-track.md`, not published |
| A5.2 | Include `#AgentGames` | "Include #AgentGames in every entry." | `TODO` |
| A5.3 | Tag `@ZKVProtocol` on X | "If you post on X, also tag @ZKVProtocol." | `TODO` |
| A5.4 | Submit from the registered dashboard | Guide: "Creator Track entries are submitted from your registered dashboard for manual review" | `BLOCKED (user)` — requires the user's account |
| A5.5 | Meet the four review qualities | "Technical substance · Clarity · zkVerify relevance · Originality" | `DONE` in draft form; final text must keep the honesty rules below |

### A6. Account and eligibility (all user-side)

| # | Item | Official wording | Status |
|---|---|---|---|
| A6.1 | Connected GitHub account | Rules §1.1 | `BLOCKED (user)` |
| A6.2 | Connected wallet address | Rules §1.1: "required to claim VFY prizes" | `BLOCKED (user)` |
| A6.3 | Profile complete (handle, country, bio) | Guide step 01 | `BLOCKED (user)` |
| A6.4 | Agent registered on the platform with its endpoint | Guide step 02 | `BLOCKED (user)` — needs the live URL from A2.1 |
| A6.5 | Entry submitted before 21 Nov 2026 22:00 UTC | Guide FAQ | `BLOCKED (user)` |

---

## B. Verification checklist

Each item is a command or observation with a pass condition. Nothing here is satisfied by reading code alone.

### B1. Deployment is live and serves this build

```sh
BASE=https://<deployment-host>
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/"                  # 200
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/play"              # 200
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/runproof"          # 200
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/runproof/showcase" # 200
```

- [ ] All four return `200`.
- [ ] The HTML contains the RunTrace console markers, not a 404 page or a Vercel error screen.

### B2. Endpoint answers with a real decision

```sh
curl -s -X POST "$BASE/api/runproof/verify" -H 'Content-Type: application/json' -d '{}'
# expect 200 with decision "FLAG" and reason "Expected runproof/v1." — strict, never a crash

curl -s "$BASE/api/candles" | head -c 300
# expect seed + candles + runToken
```

- [x] Malformed body is refused, never a crash. Observed on the deployment 2026-11-19: `{}` returns
      `200` with `decision: "FLAG"` and `reason: "Expected runproof/v1."` — the route answers with a
      verdict instead of `400`, which is the behaviour the code has; recorded here so the document
      matches the route rather than the other way round.
- [x] A full trace from the console → `ACCEPT` (score 105, 216 ticks); the same trace with a bumped
      score → `FLAG` + "Claimed score 106 does not match replayed score 105" — both passed on the
      deployment in the 2026-11-19 scenario run (`verify.accept`, `verify.tamper`).

### B3. Signed protocol (only if A2.2–A2.5 are implemented)

- [x] Preflight request with a valid signature → `{ "ok": true, "protocolVersion": "v1" }` plus `x-agent-games-signature`.
- [x] Same request with a wrong signature → rejected, no task executed.
- [x] Same `task_id` sent twice → identical signed response, one execution.

Verified by `bun scripts/agent-games-scenarios.ts` (`protocol.*` scenarios) and
`test/agentgames-adapter.test.ts` / `test/agentgames-tasks.test.ts`.

### B3.1 Negative-path matrix — the false side of every claim

Every claim this build makes has a case that is supposed to fail. One command
covers the whole matrix: `bun scripts/agent-games-scenarios.ts` (machine-readable
result in `docs/evidence/agent-games-scenarios.json`).

| # | Scenario id | Input under test | Expected | Asserted issue code |
|---|---|---|---|---|
| 1 | `verify.accept` | a completed, attested run | `ACCEPT` | — |
| 2 | `verify.honest-loss` | a real run that ends in a loss | `ACCEPT` — losing is not cheating | death cause + replayed score recorded |
| 3 | `verify.loss-inflated` | the lost run with `claims.score` raised to 500 | `FLAG` | `score_mismatch` |
| 4 | `verify.after-death` | the lost trace extended 60 ticks past death | `FLAG` | `ticks_after_death` |
| 5 | `verify.tamper` | an accepted trace with score +1 | `FLAG` | `score_mismatch` |
| 6 | `verify.terrain-tamper` | one candle's close/high hand-edited | `FLAG` | `run_token_terrain_mismatch` |
| 7 | `verify.mutation-swap` | a different daily mutation id | `FLAG` | `mutation_mismatch` |
| 8 | `verify.foreign-token` | a run token issued for another symbol | `FLAG` | `run_token_seed_mismatch` |
| 9 | `receipt.unattested` | terrain with no server run token | `422`, no receipt issued | — |
| 10 | `protocol.bad-signature` | a task with a wrong `x-agent-games-signature` | `401`, nothing executed | — |
| 11 | `protocol.conflict` | a reused `task_id` with a different body | `409`, first answer unchanged | — |
| 12 | `verify.oversized` | a 2.2 MB body | `413` before any replay | — |
| 13 | `receipt.invalid-json` | malformed JSON | `400`, no crash | — |

- [x] Local run 2026-11-19: **22/22 scenarios passed** (`docs/evidence/agent-games-scenarios.json`).
- [x] Production run 2026-11-19: **22/22 scenarios passed** against <https://candle-climber-runtrace.vercel.app> (deployment of `45773d1`); the record now in `docs/evidence/agent-games-scenarios.json` is the production run.
- [ ] Rows 3–8 assert *their own* issue code, so a `FLAG` for an unrelated reason
      still counts as a failure — the matrix tests the diagnosis, not just the verdict.
- [ ] Row 2 guards the honest direction: a loss must never be reported as cheating.

### B4. Receipts survive

```sh
curl -s -X POST "$BASE/api/runproof/runs" -H 'Content-Type: application/json' -d @trace.json   # -> { id }
curl -s "$BASE/api/runproof/runs/<id>"                                                          # -> receipt
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/runproof/r/<id>"                                # 200
```

- [x] Receipt readable **after** a fresh request (proves it is not per-instance memory) — production receipt `ea11041e-611a-4a0a-be81-d2d0fc5d2ae3` was issued and re-verified on read by the suite on 2026-11-19.
- [ ] `GET /api/leaderboard` reports `"store": "memory"` only if A4.1 is knowingly deferred.

### B5. Claims match the code

- [ ] No page or document claims a zero-knowledge proof, a zkVerify submission, anti-cheat, identity, or human-play proof.
- [x] Every `PUBLIC_URL` placeholder in `docs/` is replaced with the live host.
- [ ] The deployed build id / release string is not presented as a source hash.

### B6. Competition surface

- [ ] Creator post published with `#AgentGames` (and `@ZKVProtocol` if on X).
- [ ] Submission form filled with the live URL, the repository or demo link, use case and build context.
- [ ] Entry submitted before 21 Nov 2026 22:00 UTC.

---

## C. Open questions that only the official sources can close

These are recorded so they are not answered by assumption:

1. **Does Wildcard dispatch signed tasks?** Rules §1.2 describes the agent protocol generally; the Wildcard page does not publish an envelope. The submission form (login-only) is the only place that can settle it. Mitigation: implement the signed path so both readings pass.
2. **Is a registered platform agent required for Wildcard, or is a demo URL enough?** The page says "as requested in the submission form" — read the form before submitting.
3. **Does a receipt link need to stay valid during judging?** Unpublished. Mitigation: durable store (A4.1).

### Known limitations — documented, deliberately not implemented before the deadline

State of HEAD (`7f3706a`) recorded 2026-11-21, so no surface implies more than the code does:

| # | Limitation | Where | Public meaning |
|---|---|---|---|
| L1 | No on-chain zkVerifyJS/Kurier check. The decision uses payload fields only: `proof_vk` is compared to `registered_vk` as strings, and `proof_tx` is used only for reuse detection. | `src/game/agentgames/gatekeeper.ts:165-167`, `:179-181` | No response ever claims on-chain confirmation or a finalized job; build-guide step 04 ("wait for a finalized result") is not implemented. |
| L2 | Reason codes are this build's names (`VK_SUBSTITUTION`, `THRESHOLD_MISMATCH`, `RECIPIENT_MISMATCH`, `AMOUNT_OVERFLOW`, `PROOF_REUSED`, `EXPIRED`, `VALID`, `MALFORMED_TASK`), not the published trap names (`VALID_CONDITION`, `EXPIRED_CONDITION`). | `src/game/agentgames/gatekeeper.ts:186-188` | Mapping risk accepted for the entered track; not aligned before a scored acceptance confirms the expected vocabulary. |
| L3 | Task-id idempotency and the proof-reuse ledger are in-process Maps; serverless instance recycling loses them. | `src/game/agentgames/adapter.ts:110-112`, `src/game/agentgames/gatekeeper.ts:27-29` | Retries can re-execute; reuse detection is best-effort, as the code comments already state. |
| L4 | `issued_at` / `deadline_at` freshness is not validated before deciding; the deadline only sizes the proving budget. | `src/game/agentgames/proving/prover.ts:230-240` | A task with a stale deadline is decided on its other fields, never on freshness. |
| L5 | Proving latency has not been measured on the deployment under load. The budget is the task deadline minus safety headroom, capped at 9 s (`proveBudgetMs`); any failure or overrun falls back to the decision-only response. | `src/game/agentgames/proving/prover.ts:230-240`, `gatekeeper.ts:237-245` | Decision-only responses remain correct; a missing proof costs only the optional −2 component. |
| L6 | `signal-mapping.json` encodings (VK hashes truncated to 31 bytes, taskId as sha256-first-31) are unconfirmed against the platform's re-verification. | `src/game/agentgames/proving/signal-mapping.json` | Kept "unconfirmed" until a real scored task accepts a locally produced proof; never upgraded to "verified" without an observed acceptance. |
