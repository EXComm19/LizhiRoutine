/**
 * Strips surrounding whitespace and quote characters from an env value.
 *
 * Some deployment platforms (and `.env.local` files copy-pasted out of
 * dashboards) wrap values in single or double quotes, which then leak into
 * URLs, headers, and secrets. Use this for every env access that feeds an
 * HTTP request, regex, file path, or comparison.
 */
export function cleanEnvValue(value: string | undefined): string {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

/**
 * Read an integer-shaped env var, clamping it to [min, max] and falling
 * back to `fallback` when missing, non-numeric, or non-positive.
 */
export function parseEnvNumber(
  raw: string | undefined,
  {
    min,
    max,
    fallback,
  }: { min: number; max: number; fallback: number },
): number {
  const cleaned = cleanEnvValue(raw);
  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

/**
 * Returns true when the env value is the literal string "true"
 * (case-insensitive). Anything else — including "1", "yes", missing — is
 * treated as false to keep boolean-shaped flags strict.
 */
export function envFlag(raw: string | undefined): boolean {
  return cleanEnvValue(raw).toLocaleLowerCase() === "true";
}
