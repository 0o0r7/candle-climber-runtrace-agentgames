# Product identity — two deployments, two products

This repository contains the Candle Climber game engine plus **RunTrace**, the
build prepared for [zkVerify Agent Games](https://agentgames.zkverify.io/).
Two deployments exist and they are deliberately separate:

| | Original Candle Climber | This build (RunTrace / Agent Games) |
| --- | --- | --- |
| Purpose | Live game for the vibe/vibe ecosystem on Robinhood Chain, with its token, Death Cards, airdrop weights and partner rails | Tournament entry: deterministic run recording, server replay verification, shareable receipts, autonomous QA agent |
| Origin | its own domain (outside this repository's configuration) | `https://candle-climber-runtrace.vercel.app`, overridable with `NEXT_PUBLIC_SITE_URL` |
| Deployment | separate project | Vercel project `candle-climber-runtrace` |
| Audience | players | judges, QA engineers, reviewers |

## Rules that keep them separate

1. **One origin constant.** `src/lib/public-origin.ts` resolves
   `NEXT_PUBLIC_SITE_URL` (falling back to this build's own project URL). Site
   metadata, the sitemap, share links, Death Card metadata and the smoke-test
   bot all read it. No file hardcodes the other deployment's host.
2. **No cross-links.** Nothing in this build sends a user to the other site, and
   the other site is not expected to link here.
3. **Separate state.** Databases, secrets and environment variables belong to
   the deployment, not the repository. The other deployment's data is never
   read or written by this one.
4. **Separate claims.** The other site's marketing copy (token, airdrop,
   Robinhood Chain) is not part of this entry's claims. This build describes
   only what its own code does — see the honesty boundary in
   [runproof/README.md](runproof/README.md).
5. **Separate surfaces.** `src/lib/build-surface.ts` holds
   `SHOW_TOKEN_ECONOMY = false`: the in-game holder vault, death-card mint and
   token rails are hidden here, and the game footer links this build's own
   routes (`home · console · showcase · leaderboard · stats · privacy · terms`)
   with `deterministic replay · no zk proof` instead of the other site's
   ecosystem row. Engine, scoring, boards, duels and receipts are untouched —
   the constant gates presentation only.

## What is shared

The game engine (`src/game/cc/`), the rendering layer, and the economy
surfaces are the same code lineage. RunTrace sits on top of the engine and does
not modify gameplay; the engine's behaviour is what the replay verifier checks.

## Authorship

Two coding agents, two scopes. Stating this precisely matters: the entry is judged
by people, and an inflated authorship claim is the easiest claim to disprove.

| Scope | Produced by |
| --- | --- |
| The initial Candle Climber game code | a separate coding agent (Super Z, Base 1 model, Base44.com) |
| This repository and this build — RunTrace, the verification layer, the tests, the docs, the receipt console | Base44 BaseCode |

What follows from it:

- The entry is **not** a claim of sole human authorship, and it is not a claim that
  this build was written by the other agent either.
- Content states this in one line rather than omitting it. An agent-written engine
  with a human-directed verification layer is the subject of the competition, not a
  weakness in it.
- Any sentence of the form "I built X" must name which scope it covers.

## Changing the address

Set `NEXT_PUBLIC_SITE_URL` on the deployment to the canonical origin (no
trailing slash). `PUBLIC_ORIGIN` is evaluated at build time for client bundles,
so a change requires a rebuild, not just a restart.
