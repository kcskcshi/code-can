/**
 * Votes are stored in tenths (a vote is +10, an attack tick is −1). These
 * helpers turn tenths into the human-facing decimal string.
 */

/** Tenths → "12.3" (always one decimal place). */
export function fmtVotes(tenths: number): string {
  return (tenths / 10).toFixed(1)
}

/** Tenths → signed delta like "+1.0" or "−0.3" (uses a real minus sign). */
export function fmtDelta(tenths: number): string {
  const v = (Math.abs(tenths) / 10).toFixed(1)
  return `${tenths < 0 ? '−' : '+'}${v}`
}
