'use client'

import { useActionState } from 'react'
import {
  saveProfile,
  uploadResume,
  type ProfileState,
  type ResumeState,
} from './resume-actions'

export type ResumeMeta = { fileName: string; uploadedLabel: string } | null
export type ProfileData = {
  fullName: string
  email: string
  phone: string
  location: string
  linkedinUrl: string
  websiteUrl: string
  workAuthorization: string
  requiresSponsorship: boolean
  willingToRelocate: boolean
  declineDemographics: boolean
  extraAnswersText: string
}

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-100'

export default function ResumeTab({
  resume,
  profile,
}: {
  resume: ResumeMeta
  profile: ProfileData
}) {
  const [resumeState, resumeAction, resumePending] = useActionState<ResumeState, FormData>(
    uploadResume,
    {},
  )
  const [profileState, profileAction, profilePending] = useActionState<ProfileState, FormData>(
    saveProfile,
    {},
  )

  return (
    <div className="space-y-8">
      {/* Résumé upload */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Résumé</h2>
          <p className="text-xs text-zinc-500">
            The PDF the apply agent attaches and tailors from. It never invents anything not in here.
          </p>
        </div>

        {resume ? (
          <p className="text-sm">
            Current:{' '}
            <a href="/api/resume" target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
              {resume.fileName}
            </a>{' '}
            <span className="text-xs text-zinc-500">· uploaded {resume.uploadedLabel} ago</span>
          </p>
        ) : (
          <p className="text-sm text-zinc-500">No résumé uploaded yet.</p>
        )}

        <form action={resumeAction} className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            accept="application/pdf"
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
          <button
            type="submit"
            disabled={resumePending}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {resumePending ? 'Uploading…' : resume ? 'Replace' : 'Upload'}
          </button>
          {resumeState.error ? <span className="text-sm text-red-600">{resumeState.error}</span> : null}
          {resumeState.ok ? <span className="text-sm text-emerald-600">Saved</span> : null}
        </form>
      </section>

      {/* Application profile */}
      <form action={profileAction} className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Application profile</h2>
          <p className="text-xs text-zinc-500">
            Standard fields the apply agent prefills. Anything it can’t answer from here is left for review.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name" name="fullName" defaultValue={profile.fullName} />
          <Field label="Email" name="email" type="email" defaultValue={profile.email} />
          <Field label="Phone" name="phone" defaultValue={profile.phone} />
          <Field label="Location (city, state)" name="location" defaultValue={profile.location} />
          <Field label="LinkedIn URL" name="linkedinUrl" defaultValue={profile.linkedinUrl} />
          <Field label="Portfolio / website" name="websiteUrl" defaultValue={profile.websiteUrl} />
        </div>

        <label className="block text-xs font-medium text-zinc-500">
          Work authorization
          <input
            name="workAuthorization"
            defaultValue={profile.workAuthorization}
            placeholder="e.g. US citizen; authorized to work in the US"
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
          <Check label="Requires visa sponsorship" name="requiresSponsorship" defaultChecked={profile.requiresSponsorship} />
          <Check label="Willing to relocate" name="willingToRelocate" defaultChecked={profile.willingToRelocate} />
          <Check label="Decline optional demographic / EEO questions" name="declineDemographics" defaultChecked={profile.declineDemographics} />
        </div>

        <label className="block text-xs font-medium text-zinc-500">
          Reusable screening answers — one per line, <code>question :: answer</code>
          <textarea
            name="extraAnswers"
            defaultValue={profile.extraAnswersText}
            rows={4}
            placeholder={'Why do you want to work here? :: I’m excited about applied AI in go-to-market...\nDesired salary :: Open / market'}
            className={`mt-1 ${inputCls} font-mono`}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={profilePending}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {profilePending ? 'Saving…' : 'Save profile'}
          </button>
          {profileState.ok ? <span className="text-sm text-emerald-600">Saved</span> : null}
          {profileState.error ? <span className="text-sm text-red-600">{profileState.error}</span> : null}
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
}: {
  label: string
  name: string
  type?: string
  defaultValue: string
}) {
  return (
    <label className="block text-xs font-medium text-zinc-500">
      {label}
      <input name={name} type={type} defaultValue={defaultValue} className={`mt-1 ${inputCls}`} />
    </label>
  )
}

function Check({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  )
}
