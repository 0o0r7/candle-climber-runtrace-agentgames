# Submission TODO — single source of truth

Everything that has to be true before the Agent Games submission, in one place.
Status legend: `DONE` · `CODE DONE` (implemented and verified in this repository,
not yet on the public deployment) · `OPEN` · `USER` (needs the owner's account,
assets, or decision) · `N/A`.

Deadline on every official page: **21 November 2026, 22:00 UTC**.
Requirement wording lives in [READINESS.md](READINESS.md); this file tracks work.

Public origin for this build: **https://candle-climber-runtrace.vercel.app**
(the original Candle Climber site on another domain is a separate product — see
[../PRODUCT-IDENTITY.md](../PRODUCT-IDENTITY.md)).

---

## 1. Identity and separation

- [x] `DONE` — One origin constant (`src/lib/public-origin.ts`) feeds metadata, sitemap, share links, Death Card metadata, and the smoke-test bot.
- [x] `DONE` — No document or link in this build points at the other ecosystem's deployment.
- [x] `DONE` — Site metadata describes this build (RunTrace / Agent Games), not the other ecosystem.
- [x] `DONE` — [PRODUCT-IDENTITY.md](../PRODUCT-IDENTITY.md) records the boundary between the two deployments.

## 2. Wildcard — agent and endpoint

- [x] `DONE` — Deterministic autonomous agent (`RivalBot`) with three profiles and fixed-tick recording.
- [x] `DONE` — `POST /api/runproof/verify` returns a decision for a valid trace and `FLAG` for a tampered one.
- [x] `DONE` — `POST /api/runproof/runs` issues receipts; `GET /api/runproof/runs/{id}` reads them back.
- [x] `CODE DONE` — Signed protocol endpoint `POST /api/agentgames`: inbound signature check, `agent-games.preflight.v1` handshake, signed responses, task-ID idempotency.
- [x] `CODE DONE` — 14-scenario end-to-end suite (`bun scripts/agent-games-scenarios.ts`) with machine-readable evidence in [../evidence/agent-games-scenarios.json](../evidence/agent-games-scenarios.json).
- [x] `DONE` — Durable receipts on the deployment (MongoDB; `GET /api/leaderboard` reports `"store": "mongo"`).
- [x] `DONE` — Redeployed to production on 2026-11-19 (commit `45773d1`, <https://candle-climber-runtrace.vercel.app>); `/api/agentgames` is live and rejects an unsigned request with `401`.
- [x] `DONE` — `AGENT_GAMES_HMAC_SECRET` set on Vercel for production, preview and development (2026-11-19). If the platform issues a different key at registration, replace this value.
- [x] `DONE` — Scenario suite re-run against the deployment on 2026-11-19: 22/22 passed; `docs/evidence/agent-games-scenarios.json` is now the production run.
- [x] `DONE` — CI workflow triggers on the branches this repository actually receives (`main`, `repo-analysis`, `agentgames/runproof`).
- [x] `DONE` — Test rows removed from the production board on 2026-11-19 (5 guest rows); the weekly board now starts empty. The production evidence receipt `ea11041e-611a-4a0a-be81-d2d0fc5d2ae3` is kept, because the evidence file and READINESS link to it.

## 3. Wildcard — submission material

- [x] `DONE` — Use case and build context written in [wildcard-entry.md](wildcard-entry.md).
- [x] `DONE` — Honesty boundary stated in README, protocol notes, and the entry.
- [x] `DONE` — Interactive diagrams of the pipeline and scenario flow.
- [x] `DONE` — Repository made **public** on 2026-11-19 (<https://github.com/0o0r7/candle-climber-runtrace-agentgames>). A pre-publish scan found no credentials in tracked files or in history; only masked example strings.
- [ ] `OPEN` — Publish the demo link publicly (X post or short write-up) — also the Wildcard bonus item.
- [ ] `USER` — Register the agent endpoint on the platform, then submit from the dashboard.

## 4. Creator Track

- [ ] `USER` — Pick the format (thread, video, article) — content plan is in [creator-track.md](creator-track.md).
- [ ] `USER` — Approve the narrative and the mascot/visual package.
- [ ] `OPEN` — Produce the content assets (screenshots, receipt link, scenario evidence).
- [ ] `USER` — Publish with `#AgentGames` and tag `@ZKVProtocol` on X.
- [ ] `USER` — Submit the link from the registered dashboard.

## 5. Visual direction (UI/UX)

The build must look like its own product — distinct from the original Candle Climber and consistent with the zkVerify protocol ecosystem.

- [x] `DONE` — Three candidate directions, token sets, and the implementation plan in [../design/visual-direction.md](../design/visual-direction.md).
- [x] `DONE` — Direction chosen 2026-11-19: **A (Verification Console)**, with B's certificate
      treatment on the receipt page.
- [x] `CODE DONE` — Tokens, the console shell (route switcher + claim chip), the console and
      showcase palette, and the receipt certificate are implemented.
- [ ] `USER` — Send the mascot design package (optional; one mascot moment per screen once it
      arrives, never over body text and never in place of the verdict or the hash).
- [ ] `OPEN` — Re-verify the changed screens on the deployment, then update the screenshots in
      the submission material.

## 6. Account and eligibility

- [ ] `USER` — GitHub account connected to the Agent Games profile.
- [ ] `USER` — Wallet connected (required to claim VFY prizes).
- [ ] `USER` — Profile complete: handle, country, bio.
- [ ] `USER` — Submit before 21 November 2026, 22:00 UTC.

## 7. Post-submission

- [ ] `OPEN` — Keep the deployment online through judging; confirm receipts stay readable.
- [ ] `OPEN` — Record judge feedback and any follow-up questions in this file.
