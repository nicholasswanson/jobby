import { getInbox } from '@/lib/db/queries'
import { relativeDate } from '@/lib/format'
import type { RemoteType } from '@/lib/filters'
import InboxList, { type InboxItem } from './InboxList'

export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

export default async function InboxPage() {
  const rows = await getInbox()
  const now = new Date()

  const items: InboxItem[] = rows.map((r) => {
    const effective = r.postedAt ?? r.firstSeen
    return {
      id: r.id,
      companyId: r.companyId,
      companyName: r.companyName,
      title: r.title,
      snippet: r.snippet,
      location: r.location,
      remoteType: (r.remoteType as RemoteType | null) ?? null,
      salaryText: r.salaryText,
      url: r.url,
      postedLabel: relativeDate(effective, now),
      postedAtMs: effective ? new Date(effective).getTime() : null,
      // "New" = first appeared in the inbox within the last 24h.
      isNew: r.firstSeen ? now.getTime() - new Date(r.firstSeen).getTime() < DAY_MS : false,
    }
  })

  return <InboxList items={items} />
}
