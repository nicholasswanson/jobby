import {
  getActivityHistory,
  getBlockedCompanies,
  getFilteredJobs,
  getProfile,
  getResume,
} from '@/lib/db/queries'
import { relativeDate } from '@/lib/format'
import SettingsView from './SettingsView'
import type { ProfileData, ResumeMeta } from './ResumeTab'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [blocked, activity, filtered, resumeRow, profileRow] = await Promise.all([
    getBlockedCompanies(),
    getActivityHistory(),
    getFilteredJobs(),
    getResume(),
    getProfile(),
  ])
  const now = new Date()

  const resume: ResumeMeta = resumeRow
    ? { fileName: resumeRow.fileName, uploadedLabel: relativeDate(resumeRow.uploadedAt, now) }
    : null

  const profile: ProfileData = {
    fullName: profileRow?.fullName ?? '',
    email: profileRow?.email ?? '',
    phone: profileRow?.phone ?? '',
    location: profileRow?.location ?? '',
    linkedinUrl: profileRow?.linkedinUrl ?? '',
    websiteUrl: profileRow?.websiteUrl ?? '',
    workAuthorization: profileRow?.workAuthorization ?? '',
    requiresSponsorship: profileRow?.requiresSponsorship ?? false,
    willingToRelocate: profileRow?.willingToRelocate ?? false,
    declineDemographics: profileRow?.declineDemographics ?? true,
    extraAnswersText: (profileRow?.extraAnswers ?? [])
      .map((qa) => `${qa.question} :: ${qa.answer}`)
      .join('\n'),
  }

  return (
    <SettingsView
      resume={resume}
      profile={profile}
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
