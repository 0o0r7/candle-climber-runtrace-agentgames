import Link from "next/link";

/**
 * Hero — the claim first, the mascot second. Wick stands on a candle chart
 * inside a specimen frame (direction A's signature detail): the game is a
 * specimen under a protocol, not the whole product.
 */
const BARS = [
  { h: 18, up: true },
  { h: 34, up: true },
  { h: 26, up: false },
  { h: 44, up: true },
  { h: 30, up: true },
  { h: 20, up: false },
  { h: 52, up: true },
  { h: 38, up: false },
  { h: 58, up: true },
  { h: 46, up: true },
  { h: 28, up: false },
  { h: 64, up: true },
  { h: 50, up: false },
  { h: 40, up: true },
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
            <div className="rl-bars" aria-hidden="true">
              {BARS.map((bar, index) => (
                <span
                  key={index}
                  className={bar.up ? "rl-bar rl-bar--up" : "rl-bar rl-bar--down"}
                  style={{ height: `${bar.h}%` }}
                />
              ))}
            </div>
            <img
              src="/brand/wick-hero.webp"
              alt="Wick, the Candle Climber mascot, standing on the chart"
              width={700}
              height={700}
              className="rl-wick"
            />
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
