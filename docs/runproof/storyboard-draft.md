# RunTrace — local storyboard and copy draft

**Status:** Local draft only; not published. Copy supplied in the project direction.

## Pitch

> “RunTrace makes gameplay runs reproducible for game testing.” It records actual player inputs on fixed simulation ticks and replays them against Candle Climber’s deterministic engine, so a developer can revisit a sequence while inspecting gameplay behavior. Demo uses a local isolated clone and synthetic editable terrain. It does not create a cryptographic proof, integrate with zkVerify, authenticate who played or whether inputs changed, or provide anti-cheat protection. A replay only shows repeatability within the matching engine/build/configuration.

## 2:30 storyboard

1. **0:00–0:15** — Show the game. Say the problem is hard-to-reproduce runs; show “Repeatable gameplay runs.”
2. **0:15–0:35** — Show the isolated clone and synthetic terrain. Say it is a local demo, not production.
3. **0:35–1:05** — Play a short real run and show actual fixed-tick input capture; make no claims beyond visible captured inputs.
4. **1:05–1:40** — Replay that same captured sequence; only say it is identical if the shown build reliably demonstrates that.
5. **1:40–2:00** — Show a practical debugging/test use case actually demonstrated.
6. **2:00–2:25** — Hold a readable limits card: “Synthetic editable terrain. Replay depends on the deterministic engine and matching build/configuration. No cryptographic proof, zkVerify integration, authenticated run, or anti-cheat guarantee.”
7. **2:25–2:30** — Close: “RunTrace makes a run repeatable. This demo does not make it trustless.”

## Words to avoid

Avoid “verified,” “tamper-proof,” “cheat-proof,” “on-chain,” and “zkVerify-powered.”
