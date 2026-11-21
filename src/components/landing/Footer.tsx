import Link from "next/link";

/**
 * Closing band + footer. This build has its own identity: no token strip, no
 * partner rails, no cross-links to the other deployment (PRODUCT-IDENTITY.md).
 */
export default function Footer() {
  return (
    <>
      <section className="rl-final">
        <p className="rl-sec-kicker">START HERE</p>
        <h2 className="rl-final-title">
          Climb today&apos;s chart.
          <br />
          Leave with a <em>receipt.</em>
        </h2>
        <div className="rl-cta rl-cta--center">
          <Link href="/play" className="rl-btn rl-btn--primary">
            ENTER THE GAME
          </Link>
          <Link href="/runproof" className="rl-btn rl-btn--ghost">
            OPEN THE CONSOLE
          </Link>
        </div>
      </section>

      <footer className="rl-footer">
        <div className="rl-footer-brand">
          <img src="/brand/wick-climb.webp" alt="" width={34} height={34} loading="lazy" />
          <div>
            <p className="rl-footer-word">RUNTRACE</p>
            <p className="rl-footer-tag">CANDLE CLIMBER · AGENT GAMES ENTRY</p>
          </div>
        </div>

        <nav className="rl-footer-links" aria-label="Footer">
          <Link href="/play">PLAY</Link>
          <Link href="/runproof">CONSOLE</Link>
          <Link href="/runproof/showcase">SHOWCASE</Link>
          <Link href="/leaderboard">LEADERBOARD</Link>
          <Link href="/privacy">PRIVACY</Link>
          <Link href="/terms">TERMS</Link>
        </nav>

        <p className="rl-footer-note">
          Built on the Candle Climber engine. This build claims deterministic replay and
          server-side verification — not a zero-knowledge proof, and not proof of human
          play. The bundled gatekeeper prover is an experimental module, local-only, never
          verified on zkVerify.
        </p>
      </footer>
    </>
  );
}
