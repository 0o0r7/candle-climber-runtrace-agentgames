# Agent Games submission

This build is prepared for the [zkVerify Agent Games](https://agentgames.zkverify.io/) tournament. Deadline for all entries: **21 November 2026, 22:00 UTC**.

## Track decision

| Track | Status | Reason |
| --- | --- | --- |
| **Wildcard** | **Primary** | Open until the deadline; panel-judged on usefulness, working implementation, and clarity. Matches what this build already is. |
| **Creator Track** | **Secondary** | Same artifact, different format; content is judged manually. Low additional cost. |
| Proof Gatekeeper | Not entered | Scored cumulatively over 8 daily rounds; requires its own circuit artifacts, HMAC endpoint, and per-task Groth16 proofs. |
| Steal the VFY | Not entered | Match window closed before this build was ready. |

## What is submitted

**Wildcard** requires, per the [event page](https://agentgames.zkverify.io/events/wildcard):

| Requirement | Where it is satisfied |
| --- | --- |
| Agent link — public repository, demo, or write-up | This repository plus the deployed demo routes `/runproof` (console) and `/runproof/showcase` (looped, verified replay) |
| Public HTTPS endpoint for the agent | `POST /api/runproof/verify` and the receipt routes `POST/GET /api/runproof/runs` on the deployment |
| Use case — problem, users, behaviour | [wildcard-entry.md](wildcard-entry.md) |
| Build context — how it works, key decisions | [wildcard-entry.md](wildcard-entry.md) and [../runproof/README.md](../runproof/README.md) |
| zkVerify (optional) | Not included; see "What is not claimed" below |

## Pre-submission checklist

The authoritative, owner-annotated list is [TODO.md](TODO.md).

- [x] Production deployment is live and serves the game and `/runproof` (see [../DEPLOYMENT.md](../DEPLOYMENT.md)).
- [x] `POST /api/runproof/verify` answers on the deployed host with a valid decision for a valid trace, and `FLAG` for a tampered one.
- [x] The deployment URL is recorded in [wildcard-entry.md](wildcard-entry.md).
- [ ] Repository visibility is public and the branch containing this build is the default branch (currently private — owner decision).
- [ ] Registration profile is complete: handle, country, bio, GitHub, wallet.
- [ ] Agent endpoint registered on the platform, pointing at the deployed `/api/runproof/verify`.
- [ ] Creator Track post published with `#AgentGames` and `@ZKVProtocol` (if entering that track).
- [ ] Entry submitted from the registered dashboard before 21 November 2026, 22:00 UTC.

## What is not claimed

The submission must not overstate the system. Specifically, this build:

- produces **no** zero-knowledge proof and submits **nothing** to zkVerify;
- verifies replay consistency only, and cannot establish who produced a trace;
- attests the terrain with a server-signed run token, but cannot authenticate the player or the input origin;
- is a game QA and replay-consistency tool, not anti-cheat or identity verification.

Wildcard does not require zkVerify, so the absence of a proof layer is a missed optional plus, not a disqualification. The entry is written to make the boundary explicit rather than blur it.
