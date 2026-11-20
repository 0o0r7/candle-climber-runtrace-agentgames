# Creator Track — final thread

The entry as it ships: one X thread, thirteen posts, six clips. Every sentence
below reduces to a row of the [accuracy ledger](creator-track.md#accuracy-ledger);
every clip is a screen capture of the running product, not a mock-up.

- **Format:** X thread, published from the owner's account.
- **Required tags:** `#AgentGames` in every post; `@ZKVProtocol` in the closing post.
- **Deadline:** 2026-11-21, 22:00 UTC. File the published link from `/dashboard/submissions`.
- **Media:** six clips, 15–16 s each, 1280 × 800, constant 60 fps, silent by design
  (see [clip-visual-spec.md](clip-visual-spec.md)). Files in `media/`, SRT tracks beside them.
- **Alt text:** written per clip below; paste it into X's alt field before posting.

## Clip-to-post map

| Post | Claim | Media | File |
| --- | --- | --- | --- |
| 3 | Input is recorded at the 60 Hz tick boundary | clip 01 | `media/clip-01-ticks.mp4` |
| 4 | A fresh engine instance replays the trace | clip 03 | `media/clip-03-replay.mp4` |
| 5 | A tampered claim returns `FLAG` with a reason | clip 04 | `media/clip-04-flag.mp4` |
| 6 | The receipt stores the trace and re-verifies | clip 05 | `media/clip-05-receipt.mp4` |
| 7 | The terrain is server-signed | clip 02 | `media/clip-02-signed.mp4` |
| 11 | The agent endpoint rejects an unsigned request | clip 06 | `media/clip-06-endpoint.mp4` |

Series order on screen is `01/06 … 06/06`; the posting order above follows the
argument, not the numbering.

## Posts

Paste each block as one post, in order. Character counts are for the block as
written and are all inside the 280-character limit.

**1/13**

```text
A bug report says "the game ate my jump". A score claim says "12,400". A patch note says "nothing changed". All three are claims about a run nobody can inspect afterwards.

We built an agent that plays the game and leaves a replayable trace instead. #AgentGames
```

**2/13**

```text
The agent is RivalBot: a deterministic planner over three profiles, precise, greedy and patient. No LLM, no network, no randomness in play decisions. Up to 1,800 fixed 60 Hz ticks per case. #AgentGames
```

**3/13** — attach clip 01

```text
Input is recorded at the simulation tick boundary, not at browser frame time. Frame-timestamped replays diverge the moment the frame rate does. Fixed-tick recording replays identically on a slow laptop and a fast one. #AgentGames
```

**4/13** — attach clip 03

```text
A fresh engine instance replays the trace: terrain rebuilt, engine stepped forward, then score, jumps, landings and scoring events compared against the run's own recorded totals. Separate run, separate check. #AgentGames
```

**5/13** — attach clip 04

```text
The verdict is ACCEPT or FLAG, with a reason, evidence and diagnostics, from a plain HTTP endpoint. The verifier is deterministic TypeScript. No model decides anything. #AgentGames
```

**6/13** — attach clip 05

```text
An accepted run can be stored as a receipt: the trace itself, the verdict, and a link that re-reads the record and replays it again. Same trace, same totals. #AgentGames
```

**7/13** — attach clip 02

```text
The terrain a run was played on is server-signed: an HMAC token over the exact candles, fingerprinted, and enforced before a receipt is issued. The input stream is not signed. #AgentGames
```

**8/13**

```text
Now the honest part, where most "verifiable" claims break:
- no zero-knowledge proof here
- inputs are unattested: nothing says who pressed
- bot and replay share one engine: a consistency check, not a physics oracle
- PASS covers the tested cases only
#AgentGames
```

**9/13**

```text
Why that still matters: replay consistency is the precondition for anything stronger. You cannot prove a claim about a run until the run is reproducible. Determinism first, proof second. #AgentGames
```

**10/13**

```text
Next: commit to a hash of the trace and the engine build, then prove the replayed final state equals the claimed final state. Turn "trust this verdict" into "check this relation". Not built yet, stated as direction. #AgentGames
```

**11/13** — attach clip 06

```text
The agent endpoint takes signed tasks only. An unsigned POST is rejected with 401 before any work runs. #AgentGames
```

**12/13**

```text
Play it: https://candle-climber-runtrace.vercel.app/play
Console: https://candle-climber-runtrace.vercel.app/runproof
Contract and build notes: the repository's docs/runproof/ and docs/competition/

#AgentGames
```

**13/13**

```text
Authorship: the initial game code came from a separate coding agent (Super Z, Base 44); this repository and the verification layer were built with Base44 BaseCode.

Entry for #AgentGames. @ZKVProtocol
```

`#AgentGames` is in all thirteen posts; post 12 carries it even though it makes no
claim, so the tag rule has no exceptions to argue about.

## Alt text

Paste the matching text into X's "ALT" field for each clip. Each one describes what
the clip shows, not what it argues.

**clip 01 — ticks**

```text
RunTrace showcase page in dark console styling. A top strip reads "TAKE · AGENT RECORDING REAL INPUT AT 60 HZ" beside a live counter reading SCORE 130, CANDLES 10, TICK 368. Below it the game canvas shows a candle chart with a small block character mid-jump above orange and green platforms, and a progress bar along the bottom. A caption bar under the frame reads "Real input from a deterministic bot."
```

**clip 02 — signed terrain**

```text
Split view of the same page. Left: the game canvas with the agent mid-run on candle-chart platforms. Right: two console rows. MARKET TERRAIN is tagged SIGNED and lists DOGEUSDT, 2026-11-20, 1w, 219 closed candles, binance, with a run token beginning eyJzeW1ib2wiOiJET0. RECORDER is tagged 60 HZ and reports runproof/v1, cc-fixed-tick-input/v1, 2697 fixed ticks and 51 input events. The caption bar reads "The level is signed: an HMAC run token."
```

**clip 03 — replay**

```text
Split view while a fresh engine replays the recorded trace. Right column: SERVER REPLAY tagged ACCEPT, with "Trace claims match deterministic replay under this local policy", the replay length in fixed ticks, the matched totals (score 1285, 102 candles passed, best streak 6), the input-event and candle counts, and the policy id runproof/deterministic-replay/v1. Caption bar: "A fresh engine replays the trace."
```

**clip 04 — flag**

```text
Console panel centred in the frame. SERVER REPLAY is tagged ACCEPT and lists the replay evidence. Below it, TAMPER CHECK (+1 SCORE) is tagged FLAG and reads: score_mismatch: Claimed score 1286 does not match replayed score 1285. Caption bar: "Add one point to the claim."
```

**clip 05 — receipt**

```text
Console panel centred in the frame. SHAREABLE RECEIPT is tagged EXISTING (the demo reuses the day's receipt) and links to /runproof/r/ea717213-7750-41f5-a003-6993a8eedbad. RE-VERIFY STORED TRACE is tagged MATCH and reads: the receipt's stored trace replays to ACCEPT with the same totals. Caption bar: "The receipt stores the trace itself."
```

**clip 06 — endpoint**

```text
Terminal card on a dark background. The command "curl -i -X POST https://candle-climber-runtrace.vercel.app/api/agentgames" with a JSON body is followed by the real response: HTTP/2 401, content-type and cache-control headers, an x-agent-games-signature header, and the body {"error":"Missing task signature."} A note says it was recorded on 2026-11-20 against the public deployment, unsigned, no work performed. Caption bar: "The agent endpoint takes signed tasks."
```

## Publishing checklist

- [ ] Six clips attached in the order of the map above, alt text pasted.
- [ ] `#AgentGames` present in posts 1–11 and 13.
- [ ] `@ZKVProtocol` tagged in post 13.
- [ ] Thread published from the owner's account; the URL copied into
      [TODO.md](TODO.md) and filed from `/dashboard/submissions`.
- [ ] An archived copy of the published thread saved beside this file
      (`media/thread-archive/`), because the entry is judged on what was live.
