'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { AUTH_ENABLED, isValidSession, SESSION_COOKIE } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { companies } from '@/lib/db/schema'
import { getJobDetail, restoreToInbox, setJobStatus } from '@/lib/db/queries'

async function assertSession() {
  if (!AUTH_ENABLED) return // login temporarily disabled
  const session = (await cookies()).get(SESSION_COOKIE)?.value
  if (!isValidSession(session)) throw new Error('unauthorized')
}

export async function triageJob(jobId: number, status: 'interested' | 'not_a_fit') {
  await assertSession()
  await setJobStatus(jobId, status)
  revalidatePath('/')
  revalidatePath('/interested')
}

export async function loadJobDetail(jobId: number) {
  await assertSession()
  return getJobDetail(jobId)
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
