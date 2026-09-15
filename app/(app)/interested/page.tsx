import { getInterested } from '@/lib/db/queries'
import { relativeDate } from '@/lib/format'
import type { RemoteType } from '@/lib/filters'
import InterestedList, { type InterestedItem } from './InterestedList'

export const dynamic = 'force-dynamic'

export default async function InterestedPage() {
  const rows = await getInterested()
  const now = new Date()

  if (rows.length === 0) {
    return (
      <div className="mt-20 text-center text-zinc-500">
        <p className="text-lg font-medium">No saved roles yet</p>
        <p className="mt-1 text-sm">Mark inbox cards “Interested” and they’ll collect here.</p>
      </div>
    )
  }

  const items: InterestedItem[] = rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    title: r.title,
    snippet: r.snippet,
    location: r.location,
    remoteType: (r.remoteType as RemoteType | null) ?? null,
    salaryText: r.salaryText,
    url: r.url,
    savedLabel: r.triagedAt ? relativeDate(r.triagedAt, now) : null,
    closedWhileInterested: r.closedWhileInterested,
  }))

  return <InterestedList items={items} />
}
