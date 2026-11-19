import ReceiptView from "@/components/runproof/ReceiptView";

export const metadata = {
  title: "RunTrace — run receipt",
  description: "A stored Candle Climber run and the deterministic replay that verified it.",
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptView id={id} />;
}
