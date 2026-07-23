/**
 * fonepay-tax-refund — REMOVED
 * ───────────────────────────
 * Tax refund / IRD submission has been removed from the project.
 * This file is kept as a placeholder to avoid deployment errors
 * for any existing references. No tax functionality remains.
 */
export default async function (): Promise<Response> {
  return new Response(
    JSON.stringify({ error: 'Tax refund functionality has been removed' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  );
}
