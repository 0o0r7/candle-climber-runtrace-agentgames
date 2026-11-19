/**
 * The pipeline, stated as four steps. Copy stays inside the honesty boundary:
 * deterministic replay and a stored verdict — never a zero-knowledge proof.
 */
const STEPS = [
  {
    name: "SIGN",
    copy: "The day's market chart is fetched server-side and signed. The level a player climbs is the same bytes the verifier holds.",
    meta: "HMAC · SERVER-SIDE",
  },
  {
    name: "RECORD",
    copy: "Inputs are stamped at the simulation boundary — one action per fixed tick, never a rendered frame. The trace is the run.",
    meta: "60 HZ · FIXED TICK",
  },
  {
    name: "REPLAY",
    copy: "The server re-runs the trace through the same deterministic engine and compares its totals with the claimed score.",
    meta: "SAME ENGINE · NO RENDER",
  },
  {
    name: "RECEIPT",
    copy: "The verdict is stored with the trace hash, seed and totals. ACCEPT for an honest run, FLAG for a tampered one.",
    meta: "STORED · RE-VERIFIABLE",
  },
];

export default function PipelineSection() {
  return (
    <section className="rl-section" id="pipeline">
      <div className="rl-sec-head">
        <div>
          <p className="rl-sec-kicker">THE PIPELINE</p>
          <h2 className="rl-sec-title">How a run becomes a receipt.</h2>
        </div>
        <p className="rl-sec-note">
          No zero-knowledge proof, and none claimed. What this build does is replay the
          run and say what it found.
        </p>
      </div>

      <div className="rl-pipe">
        {STEPS.map((step, index) => (
          <article key={step.name} className="rl-pipe-step">
            <span className="rl-pipe-idx">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="rl-pipe-name">{step.name}</h3>
            <p className="rl-pipe-copy">{step.copy}</p>
            <span className="rl-pipe-meta">{step.meta}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
