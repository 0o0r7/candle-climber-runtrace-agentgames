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
| A1.1 | Public repository, demo, or write-up showing the agent | "AGENT LINK — A public repository, demo, or write-up showing the agent you built." | `DONE (demo)` — the deployed demo is public; the repository is still **private** and its visibility is the owner's call |
| A1.2 | Deployed demo that a reviewer can open without cloning | "Show the agent working — share a public link and endpoint" | `DONE` — <https://candle-climber-runtrace.vercel.app> (`/runproof`, `/runproof/showcase`) |
| A1.3 | Written use case: problem, users, behaviour | "USE CASE — Explain the problem, who the agent helps, and what it actually does" | `DONE` — `docs/competition/wildcard-entry.md` |
| A1.4 | Build context: how it works, key decisions | "BUILD CONTEXT — Briefly describe how the agent works and the key decisions behind it" | `DONE` — `docs/competition/wildcard-entry.md`, `docs/runproof/README.md` |

### A2. Wildcard — public endpoint

| # | Item | Official wording | Status |
|---|---|---|---|
| A2.1 | HTTPS endpoint, no localhost/private IP/custom port | Rules §1.2: "Be reachable at a public HTTPS endpoint — no localhost, no private IP ranges, no custom ports" | `DONE` — public HTTPS deployment (see A1.2) |
| A2.2 | Verify `x-agent-games-signature` on every inbound request | Rules §1.2–1.3: "Sign its responses with the HMAC secret issued at registration"; "Your agent must verify the `x-agent-games-signature` header on every incoming request" | `DONE (code)` — `POST /api/agentgames` verifies the raw body before parsing; inert without `AGENT_GAMES_HMAC_SECRET` |
| A2.3 | Signed responses | Rules §1.2 | `DONE (code)` — every response carries a signature over the exact response bytes |
| A2.4 | Task-ID idempotency | Rules §1.2: "Handle task IDs as idempotency keys — the platform may retry after a network failure" | `DONE (code)` — identical retry returns the identical signed answer; conflicting reuse returns `409` |
| A2.5 | Preflight handshake `{ "ok": true, "protocolVersion": "v1" }` | Build guide: "Preflight must pass before the platform marks you active" | `DONE (code)` — served by the same route |
| A2.6 | Respond inside the 60 s deadline | Build guide: "60 seconds — hard response deadline" | `DONE` — replay verifier answers in milliseconds locally; confirm on the deployment |
| A2.7 | Stay online; a sleeping host forfeits tasks | Rules §1.4 | `DONE` by hosting choice (Vercel serverless, no sleep-forfeit) — confirm with a cold request |
| A2.8 | Whether Wildcard actually sends signed tasks | Event page: endpoint "as requested in the submission form"; the form itself is behind login | `UNPUBLISHED` — cannot be read without an account; implement A2.2–A2.5 anyway so either answer is satisfied |

### A3. Wildcard — judging qualities

| # | Item | Official wording | Status |
|---|---|---|---|
| A3.1 | Useful problem | "Show a clear need, who the agent helps, and why its work matters" | `DONE` — game QA / bug reproduction |
| A3.2 | Working implementation visible | "Make it possible to understand what you built and see the agent in action" | `DONE` — live `/runproof/showcase`; the scenario suite records the same pipeline as evidence |
| A3.3 | Clear explanation incl. limits | "Explain the workflow, key choices, and what the agent can and cannot do" | `DONE` — README "Limits" and the console's boundary panel |
| A3.4 | Verifiability (optional plus) | "If zkVerify makes an important claim checkable, explain how it helps. Agents without zkVerify remain eligible." | `DONE` as an explicit non-claim; no zkVerify integration exists and none is advertised |
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
# expect 400 with a validation error, proving the route is live and strict

curl -s "$BASE/api/candles" | head -c 300
# expect seed + candles + runToken
```

- [ ] Malformed body → `400` (not `404`, not `500`).
- [ ] A full trace from the console → `ACCEPT`; the same trace with a bumped score → `FLAG` + `score_mismatch`.

### B3. Signed protocol (only if A2.2–A2.5 are implemented)

- [x] Preflight request with a valid signature → `{ "ok": true, "protocolVersion": "v1" }` plus `x-agent-games-signature`.
- [x] Same request with a wrong signature → rejected, no task executed.
- [x] Same `task_id` sent twice → identical signed response, one execution.

Verified by `bun scripts/agent-games-scenarios.ts` (`protocol.*` scenarios) and
`test/agentgames-adapter.test.ts` / `test/agentgames-tasks.test.ts`.

### B4. Receipts survive

```sh
curl -s -X POST "$BASE/api/runproof/runs" -H 'Content-Type: application/json' -d @trace.json   # -> { id }
curl -s "$BASE/api/runproof/runs/<id>"                                                          # -> receipt
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/runproof/r/<id>"                                # 200
```

- [ ] Receipt readable **after** a fresh request a minute later (proves it is not per-instance memory).
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
