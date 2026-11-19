# Visual direction — this build must not look like the original game

Status: **proposal**. Nothing below is implemented yet; the current UI is the
original Candle Climber surface. This document is the working brief for the
redesign, and the decision it needs from the owner is at the end.

## Why a redesign is required

The tournament entry is judged on what a reviewer can understand in a few
minutes. Today the build looks like the live game with an extra console bolted
on: same dark arcade palette, same mascot-forward landing, same vocabulary
(token, airdrop, partners). Two problems:

1. **Identity.** This deployment is a separate product with a separate address
   ([PRODUCT-IDENTITY.md](PRODUCT-IDENTITY.md)). It should not read as the other
   site with a new tab.
2. **Legibility of the actual claim.** The thing being judged is a
   *verification pipeline*: terrain is signed, inputs are recorded at a fixed
   tick, a fresh engine replays them, a receipt stores the verdict. The current
   visual language says "arcade game", not "verifiable system".

The redesign should make the game feel like the **input** to a protocol, not the
whole product.

## What must not change

- The game canvas, engine, controls and physics stay exactly as they are. This
  is a shell and design-system change, not a gameplay change.
- Every existing route keeps working: `/play`, `/runproof`,
  `/runproof/showcase`, `/runproof/r/{id}`, `/leaderboard`.
- Honesty rules: no visual that implies a zero-knowledge proof, a zkVerify
  submission, anti-cheat, or proof of human play.
- Accessibility: contrast, focus states, and pinch-zoom behaviour stay.

## Three directions

Each direction is a complete system, not a skin: surface, palette, type voice,
one signature detail, and motion.

### A. Verification Console

**Surface tone:** instrument panel. Cold, precise, slightly clinical.

| Token | Value |
| --- | --- |
| background | `#08090C` |
| panel | `#0F1216` |
| hairline | `#1E252B` |
| primary ink | `#E8EEF2` |
| muted ink | `#8A969E` |
| signal (pass) | `#7CFFB2` |
| signal (flag) | `#FFB86B` |
| protocol accent | `#8B5CF6` |

**Type voice:** one mono family for everything that is data (ticks, hashes,
verdicts) at 12–13px with wide tracking and uppercase labels; a neutral grotesk
for prose at 16/26. No display serif.

**Signature detail:** the game canvas sits inside a *specimen frame* — corner
ticks, a live tick counter, the terrain hash in the frame's footer. The frame is
the product's identity: the game is a specimen under a protocol.

**Motion:** one signature motion — a verdict stamp that lands with a 120 ms
scale-and-fade and leaves a persistent timestamp. Nothing else moves on its own.

**Why it fits zkVerify:** proof tooling is read as a console: monospace,
status-first, evidence beside the claim.

### B. Proof Ledger

**Surface tone:** printed certificate. Warm, editorial, deliberately un-arcade.

| Token | Value |
| --- | --- |
| background | `#F4F1EA` |
| paper | `#FBF9F4` |
| rule | `#D9D2C4` |
| ink | `#14120F` |
| muted ink | `#6B6459` |
| accent | `#5B3DF5` |
| stamp | `#1E7A5A` |

**Type voice:** a high-contrast serif for headings at 40–56px, a mono for every
number and hash, sans for body. Numbers always tabular.

**Signature detail:** the receipt is the hero. `/runproof/r/{id}` renders as a
numbered certificate with a perforated edge, a stamp, and the trace hash in the
margin. The game appears as an engraved plate.

**Motion:** page-load is a single ink-bleed reveal of the certificate; no
looping animation.

**Why it fits zkVerify:** a proof is a document you can hold. This direction
makes "receipt" literal and is the most distinctive of the three.

### C. Circuit Runner

**Surface tone:** high-energy arcade, but protocol-native rather than casino.

| Token | Value |
| --- | --- |
| background | `#0B0A1F` |
| panel | `#141233` |
| ink | `#F2F0FF` |
| muted ink | `#9A96C4` |
| accent 1 | `#38F0FF` |
| accent 2 | `#FF3DAE` |
| accent 3 | `#C6FF3D` |

**Type voice:** condensed uppercase display for headlines at 64px+, mono for
data, no serif.

**Signature detail:** circuit traces run from the canvas edge to the receipt
panel, lighting in sequence as a run is verified. The trace is the brand mark.

**Motion:** a single travelling pulse along the circuit on each verdict; the
canvas itself is untouched.

**Why it fits zkVerify:** circuits are the visual metaphor of the ecosystem, and
this keeps the energy the game already has.

## Recommendation

**A first, with B's receipt page.** The console frame gives the pipeline a
readable identity on every screen and is the cheapest to implement consistently;
the certificate treatment on the receipt page gives judges one memorable,
screenshot-ready artifact. C is the strongest social-media direction but the
easiest to overdo.

## Implementation plan (after a direction is chosen)

1. **Tokens.** Replace the palette and type variables in `src/app/globals.css`
   with the chosen set. Every component already reads variables, so this is a
   broad but shallow change.
2. **Shell.** New header/footer with the build's own name, a route switcher
   (`Play · Console · Showcase`), and a persistent origin/verification chip.
3. **Landing (`/`).** Lead with the claim, not the token: one sentence, the
   pipeline diagram, a live receipt link, then the game.
4. **Console (`/runproof`) and showcase.** Restyle panels; keep all behaviour
   and copy. Evidence and verdicts become the visual hierarchy.
5. **Receipt (`/runproof/r/{id}`).** The certificate treatment, with copy-link
   and re-verify as the two primary actions.
6. **Mascot integration.** Once the package arrives: one mascot moment per
   screen, never behind body text; the mascot never replaces the verdict or the
   hash, which are the evidence.
7. **Verification.** Desktop + mobile capture of every changed screen, a run
   through the console, and a re-run of `bun scripts/agent-games-scenarios.ts`.

## What is needed to start

1. A direction (A, B, or C — or a stated blend).
2. The mascot package: source files, allowed poses, and any colour constraints.
3. Whether the landing keeps the economy copy (token, airdrop, partners) or
   leads purely with RunTrace. Recommendation: lead with RunTrace, keep the
   economy one scroll below.
