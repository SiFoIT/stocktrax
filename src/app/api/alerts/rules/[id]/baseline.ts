/**
 * Whether an alert-rule edit must clear the stored baseline.
 *
 * The baseline outranks the anchor when the rule is evaluated, so a new anchor
 * (or a new reset strategy) must clear it or the edit is ignored. The edit
 * form always sends both fields, so only a value that actually differs from
 * the stored one counts; editing just the threshold keeps the baseline.
 */
export function shouldClearBaseline(
  stored: { anchorValue: number | null; resetStrategy: string },
  patch: { anchorValue?: number | null; resetStrategy?: string }
): boolean {
  const anchorChanged =
    patch.anchorValue !== undefined && (patch.anchorValue ?? null) !== (stored.anchorValue ?? null);
  const strategyChanged =
    patch.resetStrategy !== undefined && patch.resetStrategy !== stored.resetStrategy;
  return anchorChanged || strategyChanged;
}
