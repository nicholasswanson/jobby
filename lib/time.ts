// Overnight gate (technical_plan.md § Crawl pipeline step 1): the crawl no-ops
// between 23:00 and 05:59 in America/Los_Angeles. Using Intl means DST is handled
// automatically — no manual offset math.

const PT_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  hour12: false,
})

/** Current hour (0–23) in America/Los_Angeles for the given instant. */
export function getPacificHour(now: Date): number {
  // hourCycle quirk: some environments render midnight as "24"; normalize.
  const hour = Number(PT_FORMATTER.format(now))
  return hour === 24 ? 0 : hour
}

/** True during the overnight quiet window (23:00–05:59 PT), when crawls skip. */
export function isOvernightPacific(now: Date): boolean {
  const hour = getPacificHour(now)
  return hour >= 23 || hour < 6
}
