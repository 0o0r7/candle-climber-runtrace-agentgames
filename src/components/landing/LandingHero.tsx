import Link from "next/link";

/**
 * Hero — the claim first, the mascot second. Wick stands on a candle chart
 * inside a specimen frame (direction A's signature detail): the game is a
 * specimen under a protocol, not the whole product.
 */
// Today's level, drawn as the chart it is: a body per candle plus its wick.
// Deterministic (no Math.random) so the server and client render the same
// picture. Heights are % of the chart band.
const CANDLES = [
  { body: 16, up: true, wickTop: 8, wickBottom: 6 },
  { body: 30, up: true, wickTop: 10, wickBottom: 8 },
  { body: 22, up: false, wickTop: 6, wickBottom: 12 },
  { body: 40, up: true, wickTop: 12, wickBottom: 6 },
  { body: 27, up: true, wickTop: 6, wickBottom: 9 },
  { body: 18, up: false, wickTop: 7, wickBottom: 5 },
  { body: 48, up: true, wickTop: 14, wickBottom: 6 },
  { body: 34, up: false, wickTop: 8, wickBottom: 10 },
  { body: 56, up: true, wickTop: 12, wickBottom: 7 },
  { body: 42, up: true, wickTop: 9, wickBottom: 6 },
  { body: 25, up: false, wickTop: 6, wickBottom: 11 },
  { body: 62, up: true, wickTop: 16, wickBottom: 6 },
  { body: 45, up: false, wickTop: 10, wickBottom: 8 },
  { body: 38, up: true, wickTop: 7, wickBottom: 6 },
];

const RAIL = [
  { name: "SIGN", note: "signed terrain" },
  { name: "RECORD", note: "60 Hz inputs" },
  { name: "REPLAY", note: "same engine" },
  { name: "RECEIPT", note: "stored verdict" },
];

export default function LandingHero() {
  return (
    <section className="rl-hero">
      <div className="rl-hero-grid">
        <div className="rl-hero-copy">
          <p className="rl-eyebrow">
            <img src="/brand/wick-climb.webp" alt="" width={26} height={26} className="rl-eyebrow-avatar" />
            RUNTRACE <span className="rl-eyebrow-sep">/</span> AGENT GAMES ENTRY
          </p>

          <h1 className="rl-title">
            THE GAME IS
            <br />
            THE INPUT.
            <br />
            THE <em>RECEIPT</em>
            <br />
            IS THE OUTPUT.
          </h1>

          <p className="rl-sub">
            Candle Climber is a skill platformer whose terrain is a signed market chart.
            Every jump is stamped at a fixed 60 Hz tick, replayed by a deterministic
            engine, and filed as a receipt anyone can open.
          </p>

          <div className="rl-cta">
            <Link href="/runproof/showcase" className="rl-btn rl-btn--primary">
              WATCH THE AGENT PLAY
            </Link>
            <Link href="/play" className="rl-btn rl-btn--ghost">
              PLAY IT YOURSELF
            </Link>
          </div>

          <ol className="rl-rail" aria-label="How a run is verified">
            {RAIL.map((step, index) => (
              <li key={step.name} className="rl-rail-step">
                <span className="rl-rail-idx">{String(index + 1).padStart(2, "0")}</span>
                <span className="rl-rail-name">{step.name}</span>
                <span className="rl-rail-note">{step.note}</span>
              </li>
            ))}
          </ol>
        </div>

        <aside className="rl-specimen" aria-label="Wick climbing today's signed chart">
          <div className="rl-specimen-bar">
            <span className="rl-live">
              <i className="rl-dot" aria-hidden="true" />
              AGENT RUN
            </span>
            <span className="rl-specimen-id">SPECIMEN 001</span>
          </div>

          <div className="rl-stage">
            <span className="rl-tick rl-tick--tl" aria-hidden="true" />
            <span className="rl-tick rl-tick--tr" aria-hidden="true" />
            <span className="rl-tick rl-tick--bl" aria-hidden="true" />
            <span className="rl-tick rl-tick--br" aria-hidden="true" />

            <div className="rl-chart" aria-hidden="true">
              {CANDLES.map((candle, index) => (
                <span
                  key={index}
                  className={candle.up ? "rl-candle is-up" : "rl-candle is-down"}
                  style={{ height: `${candle.body}%` }}
                >
                  <i
                    className="rl-candle-wick"
                    style={{ top: `-${candle.wickTop}px`, bottom: `-${candle.wickBottom}px` }}
                  />
                </span>
              ))}
            </div>

            <span className="rl-score-pop" aria-hidden="true">
              +120
            </span>

            <img
              src="/brand/wick-hero.webp"
              alt="Wick, the Candle Climber mascot, standing on today's chart"
              width={700}
              height={700}
              className="rl-wick"
            />
            <span className="rl-wick-shadow" aria-hidden="true" />

            <span className="rl-verdict-stamp" aria-hidden="true">
              VERDICT · ACCEPT
            </span>
          </div>

          <div className="rl-specimen-foot">
            <span>TERRAIN 0x9F2C…A1</span>
            <span>TICK 004 812</span>
            <span>60 HZ</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
