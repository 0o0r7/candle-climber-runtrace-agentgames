import Link from "next/link";

/**
 * The receipt as an object (direction B's certificate treatment, kept for the
 * receipt surfaces). The figures are a labelled sample — the live receipts come
 * out of the console and the showcase, so this card never poses as a stored run.
 */
export default function ReceiptTeaser() {
  return (
    <section className="rl-section" id="receipt">
      <div className="rl-cert-wrap">
        <div className="rl-cert" aria-label="Sample receipt">
          <div className="rl-cert-top">
            <span>RUNTRACE RECEIPT</span>
            <span>№ 0042</span>
          </div>

          <div className="rl-cert-main">
            <div>
              <p className="rl-cert-label">VERDICT</p>
              <p className="rl-cert-verdict">ACCEPT</p>
              <p className="rl-cert-sub">replay matches the claim</p>
            </div>
            <span className="rl-cert-stamp" aria-hidden="true">
              REPLAYED
              <br />
              60 HZ
            </span>
          </div>

          <dl className="rl-cert-fields">
            <div>
              <dt>SCORE</dt>
              <dd>1 284</dd>
            </div>
            <div>
              <dt>TICKS</dt>
              <dd>4 812</dd>
            </div>
            <div>
              <dt>TERRAIN</dt>
              <dd>0x9f2c…a1</dd>
            </div>
            <div>
              <dt>TRACE HASH</dt>
              <dd>0x4b7e…90</dd>
            </div>
          </dl>

          <p className="rl-cert-note">SAMPLE RECEIPT · ILLUSTRATIVE, NOT A STORED RUN</p>
        </div>

        <div className="rl-cert-copy">
          <p className="rl-sec-kicker">THE RECEIPT</p>
          <h2 className="rl-sec-title">Every run leaves a document.</h2>
          <p className="rl-cert-text">
            The receipt is the product. It carries the verdict, the replayed totals, the
            seed, the terrain and the full trace — and it offers one button that replays
            the run again from scratch.
          </p>
          <div className="rl-cta">
            <Link href="/runproof/showcase" className="rl-btn rl-btn--primary">
              WATCH A RUN LAND
            </Link>
            <Link href="/runproof" className="rl-btn rl-btn--ghost">
              OPEN THE CONSOLE
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
