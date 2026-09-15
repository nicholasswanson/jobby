import { createHash } from 'node:crypto'

/**
 * Dedupe hash for a job: sha256(companyId | lower(trim(title)) | lower(trim(location))).
 * Spec: technical_plan.md § Crawl pipeline step 5. Stable across runs so a repeat
 * crawl of an unchanged posting collides and only bumps last_seen.
 */
export function dedupeHash(
  companyId: number,
  title: string,
  location: string | null | undefined,
): string {
  const norm = (s: string) => s.trim().toLowerCase()
  const key = `${companyId}|${norm(title)}|${norm(location ?? '')}`
  return createHash('sha256').update(key).digest('hex')
}
