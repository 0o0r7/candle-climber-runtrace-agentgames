import Link from "next/link";
import type { ReactNode } from "react";

export type ProtocolRoute = "console" | "showcase" | "receipt";

const ROUTES: { id: ProtocolRoute; href: string; label: string }[] = [
  { id: "console", href: "/runproof", label: "CONSOLE" },
  { id: "showcase", href: "/runproof/showcase", label: "SHOWCASE" },
];

/**
 * Visual direction A — the RunTrace surfaces read as a protocol console:
 * a hairline header with the route switcher, the claim chip, and a footer
 * that names the entry. The game canvas keeps its own palette.
 */
export default function ProtocolShell({
  active,
  width = 1000,
  children,
}: {
  active: ProtocolRoute;
  width?: number;
  children: ReactNode;
}) {
  return (
    <div className="rt-root">
      <header className="rt-header">
        <Link href="/" className="rt-brand">
          <span className="rt-brand-mark" aria-hidden="true">RT</span>
          <span className="rt-brand-name">RUNTRACE</span>
        </Link>
        <nav className="rt-nav" aria-label="RunTrace routes">
          <Link href="/play">PLAY</Link>
          {ROUTES.map((route) => (
            <Link
              key={route.id}
              href={route.href}
              aria-current={active === route.id ? "page" : undefined}
            >
              {route.label}
            </Link>
          ))}
        </nav>
        <span className="rt-chip" title="Deterministic replay, not a zero-knowledge proof (the bundled gatekeeper prover is an experimental module, local-only, never verified on zkVerify)">
          DETERMINISTIC REPLAY · NO ZK PROOF
        </span>
      </header>
      <main className="rt-page">
        <div className="rt-container" style={{ maxWidth: width }}>
          {children}
        </div>
      </main>
      <footer className="rt-footer">
        <span>RUNTRACE · AGENT GAMES WILDCARD ENTRY</span>
        <span>
          <a href="/play">PLAY</a> · <a href="/leaderboard">LEADERBOARD</a> ·{" "}
          <a href="/runproof">CONSOLE</a> · <a href="/runproof/showcase">SHOWCASE</a>
        </span>
      </footer>
    </div>
  );
}
