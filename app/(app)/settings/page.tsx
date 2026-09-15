import {
  getActivityHistory,
  getBlockedCompanies,
  getFilteredJobs,
} from '@/lib/db/queries'
import { relativeDate } from '@/lib/format'
import SettingsView from './SettingsView'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [blocked, activity, filtered] = await Promise.all([
    getBlockedCompanies(),
    getActivityHistory(),
    getFilteredJobs(),
  ])
  const now = new Date()

  return (
    <SettingsView
      blocked={blocked}
      activity={activity.map((a) => ({
        id: a.id,
        title: a.title,
        url: a.url,
        status: a.status as 'interested' | 'not_a_fit',
        companyName: a.companyName,
        whenLabel: a.triagedAt ? relativeDate(a.triagedAt, now) : '',
      }))}
      filtered={filtered.map((f) => ({
        id: f.id,
        title: f.title,
        snippet: f.snippet,
        location: f.location,
        url: f.url,
        reason: (f.filterReason as 'seniority' | 'geo' | 'onsite' | null) ?? null,
        companyName: f.companyName,
      }))}
    />
  )
}
