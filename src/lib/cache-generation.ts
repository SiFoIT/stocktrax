/**
 * A counter bumped by every write that invalidates the portfolio summary and
 * the performance series. A computation records the counter when it starts and
 * only stores its result if the counter hasn't moved: otherwise a slow
 * computation that read the ledger before an edit would finish after it and
 * cache the pre-edit figures as fresh.
 */
const state = ((globalThis as { __stocktraxGeneration?: { value: number } }).__stocktraxGeneration ??= {
  value: 0,
});

export function currentGeneration(): number {
  return state.value;
}

export function bumpGeneration(): void {
  state.value++;
}
