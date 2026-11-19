// One RunTrace receipt: the stored verdict plus the trace that produced it.
import { NextResponse } from "next/server";
import { getRunproofStore } from "@/lib/runproof-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "malformed receipt id" }, { status: 400 });
  }
  const receipt = await getRunproofStore().get(id);
  if (!receipt) {
    return NextResponse.json({ error: "receipt not found" }, { status: 404 });
  }
  return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
}
