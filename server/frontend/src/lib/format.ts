// GLSD -- Usage display formatting utilities
// D-15, D-16: Smart cost formatting with sub-cent threshold
// D-10: Duration formatting with human-readable output

/**
 * Format a USD cost value for display.
 * - Zero: "$0.00" (D-16)
 * - Sub-cent (> 0 but < 0.01): "< $0.01" (D-15)
 * - Otherwise: "$X.XX" with 2 decimal places (D-15)
 */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd > 0 && usd < 0.01) return '< $0.01';
  return `$${usd.toFixed(2)}`;
}

/**
 * Format a duration in milliseconds for display.
 * - < 1000ms: "< 1s"
 * - < 60000ms: "{N}s"
 * - >= 60000ms: "{M}m{S}s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

/**
 * Format a token count for compact display.
 * - >= 1000: "{N.N}k"
 * - Otherwise: raw number as string
 */
export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
