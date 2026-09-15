'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { AUTH_ENABLED, isValidSession, SESSION_COOKIE } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { companies } from '@/lib/db/schema'
import {
  getJobDetail,
  getTailoring,
  restoreToInbox,
  setJobStatus,
  upsertTailoring,
} from '@/lib/db/queries'
import { generateTailoredResume } from '@/lib/ai/tailor'

async function assertSession() {
  if (!AUTH_ENABLED) return // login temporarily disabled
  const session = (await cookies()).get(SESSION_COOKIE)?.value
  if (!isValidSession(session)) throw new Error('unauthorized')
}

export async function triageJob(jobId: number, status: 'interested' | 'not_a_fit') {
  await assertSession()
  await setJobStatus(jobId, status)

  // On "interested", kick off résumé tailoring after the response is sent so the
  // triage stays instant. generateTailoredResume manages its own status.
  if (status === 'interested') {
    const existing = await getTailoring(jobId)
    if (existing?.status !== 'ready') {
      await upsertTailoring(jobId, { status: 'pending', error: null })
      after(() => generateTailoredResume(jobId))
    }
  }

  revalidatePath('/')
  revalidatePath('/interested')
}

export async function loadJobDetail(jobId: number) {
  await assertSession()
  return getJobDetail(jobId)
}

export async function loadTailoring(jobId: number) {
  await assertSession()
  return getTailoring(jobId)
}

/** Manually (re)generate the tailored résumé for a job. */
export async function regenerateTailoring(jobId: number) {
  await assertSession()
  await upsertTailoring(jobId, { status: 'pending', error: null })
  after(() => generateTailoredResume(jobId))
}

/** Move a filtered/triaged job (back) into the inbox. */
export async function restoreJobToInbox(jobId: number) {
  await assertSession()
  await restoreToInbox(jobId)
  revalidatePath('/')
  revalidatePath('/settings')
}

export async function setCompanyActive(companyId: number, active: boolean) {
  await assertSession()
  await db.update(companies).set({ active }).where(eq(companies.id, companyId))
  revalidatePath('/companies')
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  redirect('/login')
}
