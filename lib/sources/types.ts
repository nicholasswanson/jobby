// The normalized shape every source produces. Per-source normalizers Zod-parse
// the raw ATS/aggregator payload at the boundary and map it to this type.
export type NormalizedPosting = {
  // The ATS's own job id when available (string form). Used for reference only;
  // dedupe is by hash of company + title + location.
  externalId: string | null
  title: string
  location: string | null
  salaryText: string | null
  url: string
  postedAt: Date | null
  // Aggregator sources (Remotive, WWR) carry their own company name; ATS-board
  // sources leave this null because the company is known from the board itself.
  companyName?: string | null
}

export type SourceType = 'greenhouse' | 'lever' | 'ashby' | 'remotive' | 'wwr'
