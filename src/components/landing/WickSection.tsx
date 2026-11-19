/**
 * Meet Wick — the mascot carries the three moments of a run: climbing,
 * a stamped verdict, and an honest crash. One pose per card, never behind copy.
 */
const POSES = [
  {
    img: "/brand/wick-climb.webp",
    alt: "Wick climbing a candle",
    tag: "CLIMB",
    tone: "up",
    name: "One input at a time",
    copy: "Wick plays the signed level through the same boundary a human plays through. No shortcuts, no hidden state, no second engine.",
  },
  {
    img: "/brand/wick-victory.webp",
    alt: "Wick celebrating a verified run",
    tag: "VERDICT",
    tone: "accent",
    name: "A clean run lands",
    copy: "The replay matches the claim, the verdict is stored, and the run becomes a document you can open, copy and re-check later.",
  },
  {
    img: "/brand/wick-falling.webp",
    alt: "Wick crashing into a candle",
    tag: "CRASH",
    tone: "down",
    name: "A loss is still valid",
    copy: "An honest crash is accepted as a real run. Only a claim that the replay cannot reproduce is flagged as tampering.",
  },
];

export default function WickSection() {
  return (
    <section className="rl-section" id="wick">
      <div className="rl-sec-head">
        <div>
          <p className="rl-sec-kicker">MEET WICK</p>
          <h2 className="rl-sec-title">Wick climbs. The server checks.</h2>
        </div>
        <p className="rl-sec-note">
          The same blockbot on every screen of this build — in the wordmark, on the
          console, and on the receipt that comes out the other side.
        </p>
      </div>

      <div className="rl-poses">
        {POSES.map((pose) => (
          <article key={pose.tag} className={`rl-pose rl-pose--${pose.tone}`}>
            <div className="rl-pose-media">
              <span className="rl-pose-tag">{pose.tag}</span>
              <img src={pose.img} alt={pose.alt} width={512} height={512} loading="lazy" />
            </div>
            <div className="rl-pose-body">
              <h3 className="rl-pose-name">{pose.name}</h3>
              <p className="rl-pose-copy">{pose.copy}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
