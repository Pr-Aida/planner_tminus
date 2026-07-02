// Safe evaluator for simple minute expressions.
// Allows only integers and the + / - operators. No eval, no parentheses,
// no letters, no other symbols. Returns null when the input is invalid.

const EXPR_RE = /^\d+(?:[+-]\d+)*$/;

/**
 * Evaluate a simple expression like "15+10" or "30-5+3".
 * Returns the numeric result, or null if the expression is invalid.
 * A bare number like "15" is also accepted.
 */
export function evalMinuteExpr(input: string): number | null {
  const trimmed = input.replace(/\s+/g, '');
  if (trimmed === '') return null;
  if (!EXPR_RE.test(trimmed)) return null;

  // Tokenize into signed integers and sum left-to-right.
  // The regex guarantees only digits and +/- in valid order.
  const tokens = trimmed.match(/[+-]?\d+/g);
  if (!tokens) return null;

  let total = 0;
  for (const t of tokens) {
    total += parseInt(t, 10);
    if (!Number.isFinite(total)) return null;
  }
  return total;
}
