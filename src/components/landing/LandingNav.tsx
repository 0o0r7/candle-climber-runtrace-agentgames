import Link from "next/link";

/**
 * Landing header — the product's own navigation, not the old game site's.
 * Wick rides in the wordmark, the routes are this build's routes, and the
 * honesty chip states what the pipeline does (and does not) claim.
 */
const LINKS = [
  { href: "/runproof", label: "CONSOLE" },
  { href: "/runproof/showcase", label: "SHOWCASE" },
  { href: "/leaderboard", label: "LEADERBOARD" },
  { href: "/play", label: "PLAY" },
];

export default function LandingNav() {
  return (
    <header className="rl-nav">
      <Link href="/" className="rl-nav-brand" aria-label="RunTrace — Candle Climber">
        <img src="/brand/wick-climb.webp" alt="" width={28} height={28} className="rl-nav-avatar" />
        <span className="rl-nav-word">RUNTRACE</span>
        <span className="rl-nav-sub">CANDLE CLIMBER</span>
      </Link>
      <nav className="rl-nav-links" aria-label="Primary">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="rl-nav-link">
            {link.label}
          </Link>
        ))}
      </nav>
      <Link href="/play" className="rl-btn rl-btn--primary rl-btn--sm">
        ENTER THE GAME
      </Link>
    </header>
  );
}
