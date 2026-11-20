// Signed Agent Games protocol endpoint.
//
// Implements the general published protocol shape: verify the inbound
// `x-agent-games-signature` over the exact raw body, answer the documented
// `agent-games.preflight.v1` handshake, execute a RunTrace verification task,
// sign every response, and treat the task ID as an idempotency key.
//
// The digest profile is the documented local candidate (HMAC-SHA-256 over the
// raw bytes, UTF-8 key from the displayed secret, lowercase hex). The published
// pages do not name the algorithm, so this is an implemented choice, not a
// confirmed platform contract — see docs/runproof/agentgames-protocol.md.
//
// The route is inert until AGENT_GAMES_HMAC_SECRET is configured: without a
// key there is nothing to verify a signature against, so it answers 503 rather
// than accepting unsigned tasks.
import { NextResponse } from "next/server";
import {
  COMPETITOR_EVIDENCE_TEST_SIGNATURE_PROFILE,
  createAgentGamesHttpHandler,
  encodeDisplayedSecretAsUtf8KeyForCompetitorEvidenceProfile,
} from "@/game/agentgames/adapter";
import { createAgentGamesTaskAdapter } from "@/game/agentgames/tasks";
import { warmProver } from "@/game/agentgames/proving/prover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const secret = process.env.AGENT_GAMES_HMAC_SECRET?.trim();

// Built once per process so the idempotency cache and concurrency guard span
// requests, exactly as the adapter documents.
const handler = secret
  ? createAgentGamesHttpHandler({
      secretBytes: encodeDisplayedSecretAsUtf8KeyForCompetitorEvidenceProfile(secret),
      signatures: COMPETITOR_EVIDENCE_TEST_SIGNATURE_PROFILE.signatures,
      taskAdapter: createAgentGamesTaskAdapter(),
    })
  : null;

// Cold-start warm-up: fetch the official circuit artifacts into /tmp and export
// the verification key so the first gatekeeper task does not pay that cost.
// Fire-and-forget — proving failures are fail-open (decision-only responses).
void warmProver();

export async function POST(request: Request) {
  if (!handler) {
    return NextResponse.json(
      { error: "agent_games_protocol_not_configured", detail: "AGENT_GAMES_HMAC_SECRET is not set on this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return handler(request);
}
