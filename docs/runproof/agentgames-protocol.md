# Agent Games adapter — local readiness and Wildcard clarification

## Published protocol wording vs. Wildcard support

The published [Agent Games Rules](https://agentgames.zkverify.io/rules) §§1.2–1.3 describe the general hosted-agent protocol: a public HTTPS endpoint, verification of `x-agent-games-signature` on incoming requests using the registration-issued HMAC secret, signed responses, and task-ID idempotency. The [build guide](https://agentgames.zkverify.io/build) describes raw-body signature handling and a signed `agent-games.preflight.v1` handshake with response `{ "ok": true, "protocolVersion": "v1" }`. This remains the wording of the published general Rules/build material; it should not be silently rewritten as though the pages themselves state a Wildcard exception.

A separate Wildcard-specific support answer appears in the owner-provided Discord screenshot: Khushi, in `#general-chat` (18 November 2026; no message permalink was supplied), said HMAC-related values apply to Gatekeeper and Steal, not Wildcard, and that a public HTTPS point for a Wildcard agent is optional “here.” Treat this as a direct support clarification for Wildcard, distinct from the published general Rules/build wording. On that basis, HMAC signing, a registration-issued HMAC secret, and platform preflight are **not Wildcard blockers for this prototype**; do not claim they are required for Wildcard solely because the general build guide describes them.

The published [Wildcard event page](https://agentgames.zkverify.io/events/wildcard) asks for a public repository, demo, or write-up showing the agent, and lists a public HTTPS endpoint “as requested in the submission form.” It also says zkVerify is optional. The endpoint wording therefore differs from Khushi’s “optional here” support answer; preserve both sources rather than presenting either as the other’s wording. The event page does not publish a Wildcard task envelope, sample task payload, or task-ID contract. None has been supplied to this local work.

## What this local code does

`src/game/cc/rival/bot.ts` and `planner.ts` provide the deterministic RivalBot: it chooses jump/RUSH actions from seed, engine state, and one of the game's existing personality profiles. It uses no LLM, network, or randomness for gameplay decisions. Optional observer hooks capture input and engine outcomes; normal game use omits those hooks.

The RunTrace page has a one-click six-case autonomous QA suite: two synthetic seeds × three existing profiles (precise, greedy, patient), up to 1,800 fixed 60 Hz steps per case. It records the bot's actual jump/RUSH/world-transition events, engine jump/landing/score events, and final totals. RunTrace replays those captured inputs in a separate engine instance and compares the replay against the bot run's outputs.

A bounded invariant layer checks finite core engine values; legal jump/RUSH/world transitions; grounded-player alignment with a live platform; and monotonic time, score, candle count, and best streak. Findings include seed, profile, ruleset, descriptive local build ID, input trace, replay report, and evidence. The build ID (`local-uncommitted-agentgames/runproof/rival-qa-v1`) is descriptive, not a source hash or signed attestation.

This is a deterministic rule-based game-QA agent, not an LLM. A PASS means only that the tested bot run and replay agreed and the listed invariants held; it does not prove that all game mechanics are correct or establish that judges will find this particular workflow useful.

`src/game/agentgames/adapter.ts` is a composable, local handler factory. It preserves bounded raw request bytes, calls an injected signature provider before parsing JSON, can return the general documented preflight response, signs outbound JSON through that provider, and applies process-local request/concurrency/rate limits. Its optional task mapping is separately injected: `createWildcardRunTraceAdapter` needs a caller-provided envelope matcher, task-ID extractor, and trace-input extractor. The local tests use a fabricated test envelope; that fixture is **not** a Wildcard envelope supplied by the event.

## HMAC candidate — generic prototype detail, not a Wildcard blocker

Two reviewed competitor implementations converge on HMAC-SHA-256 over exact raw request bytes, the displayed secret used as its UTF-8 key string, and lowercase hexadecimal output. `COMPETITOR_EVIDENCE_TEST_SIGNATURE_PROFILE` in `src/game/agentgames/adapter.ts` exposes that candidate. This is competitor evidence, not an official protocol definition or platform confirmation. The published general pages do not specify the digest algorithm, signature-header encoding, canonicalization details, or displayed-secret byte interpretation.

The candidate is opt-in/test-only, is not a default, and is not wired into the app. Tests use synthetic/local values, including an RFC 4231 vector and exact sample preflight bodies; no real registration secret is used. Because Wildcard support said HMAC and preflight are not applicable requirements for Wildcard, this unresolved general-protocol detail is not a reason to hold this Wildcard prototype or to run a preflight.

Task responses in the local adapter are cached by configured task ID and exact raw-body fingerprint. Same-ID/same-body retries return the original signed response; same-ID/different-body requests get a signed conflict response. The in-memory cache is bounded at 512 entries with 24-hour retention, resets on restart, and is not shared between instances. The stateless replay handler performs no external side effects.

## What remains unresolved

The deterministic RivalBot closes the earlier “no autonomous agent behavior” gap in the local prototype. It is not connected to Agent Games, and the current local work has no public Agent Games repository link, demo, or published write-up: this clone has no Git remote, and its `/runproof` route is local-only. The pre-existing Candle Climber production site is separate and does not expose this local RunTrace/QA prototype. The published Wildcard page asks for a public agent link, so this is the concrete remaining submission-readiness gap. No such artifact may be published under the current local-only instruction.

No Wildcard task envelope, sample request, or task-ID contract has been supplied. Consequently, the local adapter cannot be configured or end-to-end validated against an actual Wildcard task. This is an integration unknown, not a published Wildcard submission requirement on the event page; do not claim the event requires an envelope that it has not published.

There is no public HTTPS endpoint or deployment for this local branch. The Wildcard page lists an endpoint in its submission requirements, while Khushi’s support answer says it is optional “here.” The local-only/no-publish instruction means this work will not create one; report the source discrepancy instead of treating HMAC/preflight or endpoint hosting as an unqualified Wildcard blocker. The local process-only rate and idempotency controls would also need a shared, durable design before any horizontally scaled deployment, but no deployment is in scope.

## Readiness decision

**Not submission-ready in its current local-only state.** HMAC, a registration secret, and platform preflight are **not** the remaining Wildcard blockers according to the event-specific Discord support answer. The local Agent Games prototype has no public repository/demo/write-up link, while the published Wildcard page asks for a public agent link; this iteration is explicitly prohibited from publishing one. The endpoint is listed by the event page but described as optional by support, so keep that discrepancy explicit. No Wildcard envelope has been supplied, so platform-task integration cannot be demonstrated, but the event page does not list a Wildcard envelope as a submission prerequisite. Do not call the local adapter platform-integrated, production-ready, LLM-powered, zk-powered, or cryptographically verified.

No hosted, paid, or deployment operation was performed. There was no Agent Games wallet connection or registration secret, no platform preflight, no on-chain signature or transaction, and no VFY spend. RunTrace itself does not use wallet APIs. Separately, an offline wallet was created during the overall task and a non-transaction test message was signed and verified locally; adapter tests used only ephemeral in-memory test values. No code, deployment, publication, registration, or submission is part of this documentation update.
