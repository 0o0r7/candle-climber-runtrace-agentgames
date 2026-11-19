/**
 * Build surface (docs/PRODUCT-IDENTITY.md).
 *
 * This repository holds two products: the live Candle Climber game with its
 * token/vault/death-card economy, and this build — the Agent Games entry,
 * which ships the game engine plus RunTrace (deterministic replay, receipts).
 *
 * The other deployment's economy surfaces (holder vault, death-card mint,
 * token rails) are not part of this entry's claims, so they are hidden here.
 * Engine, scoring, boards, duels and receipts are untouched: this constant
 * gates presentation only.
 */
export const SHOW_TOKEN_ECONOMY = false;
