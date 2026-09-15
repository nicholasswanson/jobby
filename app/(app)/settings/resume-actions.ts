'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { AUTH_ENABLED, isValidSession, SESSION_COOKIE } from '@/lib/auth'
import { upsertProfile, upsertResume, type ProfileInput } from '@/lib/db/queries'

async function assertSession() {
  if (!AUTH_ENABLED) return
  const session = (await cookies()).get(SESSION_COOKIE)?.value
  if (!isValidSession(session)) throw new Error('unauthorized')
}

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export type ResumeState = { error?: string; ok?: boolean }

export async function uploadResume(_prev: ResumeState, formData: FormData): Promise<ResumeState> {
  await assertSession()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a PDF to upload.' }
  }
  if (file.type && file.type !== 'application/pdf') {
    return { error: 'Résumé must be a PDF.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'File is too large (max 5 MB).' }
  }

  const dataBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  await upsertResume({
    fileName: file.name || 'resume.pdf',
    mimeType: 'application/pdf',
    dataBase64,
  })
  revalidatePath('/settings')
  return { ok: true }
}

function boolOf(formData: FormData, name: string): boolean {
  return formData.get(name) === 'on' || formData.get(name) === 'true'
}

// extra answers come from a textarea, one per line as "question :: answer"
function parseExtraAnswers(raw: string): { question: string; answer: string }[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf('::')
      if (idx === -1) return { question: line, answer: '' }
      return { question: line.slice(0, idx).trim(), answer: line.slice(idx + 2).trim() }
    })
    .filter((qa) => qa.question)
}

export type ProfileState = { error?: string; ok?: boolean }

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  await assertSession()
  const str = (name: string) => {
    const v = formData.get(name)
    return typeof v === 'string' && v.trim() ? v.trim() : null
  }

  const input: ProfileInput = {
    fullName: str('fullName'),
    email: str('email'),
    phone: str('phone'),
    location: str('location'),
    linkedinUrl: str('linkedinUrl'),
    websiteUrl: str('websiteUrl'),
    workAuthorization: str('workAuthorization'),
    requiresSponsorship: boolOf(formData, 'requiresSponsorship'),
    willingToRelocate: boolOf(formData, 'willingToRelocate'),
    declineDemographics: boolOf(formData, 'declineDemographics'),
    extraAnswers: parseExtraAnswers(String(formData.get('extraAnswers') ?? '')),
  }

  await upsertProfile(input)
  revalidatePath('/settings')
  return { ok: true }
}
