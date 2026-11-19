import RunTraceConsole from "@/components/runproof/RunTraceConsole";

export const metadata = {
  title: "RunTrace — verified run receipts",
  description: "Play today's market chart; the server replays the run and issues a shareable receipt.",
};

export default function RunProofPage() {
  return <RunTraceConsole />;
}
