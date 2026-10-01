import { getInbox, getLatestRun, resolveFeed } from '@/lib/db/queries'
import { relativeDate } from '@/lib/format'
import { getCurrentProfile } from '@/lib/profile'
import type { RemoteType } from '@/lib/filters'
import InboxList, { type InboxItem } from './InboxList'

export const dynamic = 'force-dynamic'

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ feed?: string }>
}) {
  const { feed: feedParam } = await searchParams
  const who = await getCurrentProfile()
  const feed = resolveFeed(who, feedParam)
  const [rows, [latestRun]] = await Promise.all([getInbox(who, feed), getLatestRun()])
  const now = new Date()
  // "New" = first seen in the most recent crawl (matches the header's "N new").
  const newCutoff = latestRun?.startedAt ? new Date(latestRun.startedAt).getTime() : Infinity

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
      isNew: r.firstSeen ? new Date(r.firstSeen).getTime() >= newCutoff : false,
    }
  })

  return <InboxList items={items} />
}
