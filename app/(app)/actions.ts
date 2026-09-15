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
  getApplication,
  getJobDetail,
  getProfile,
  getResume,
  getTailoring,
  restoreToInbox,
  setJobStatus,
  upsertApplication,
  upsertTailoring,
} from '@/lib/db/queries'
import { generateTailoredResume } from '@/lib/ai/tailor'
import { detectAts } from '@/lib/apply/ats'
import { applyAgentConfigured, dispatchApplyWorker } from '@/lib/apply/dispatch'

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

// ---- Apply ------------------------------------------------------------------

export async function loadApplication(jobId: number) {
  await assertSession()
  return getApplication(jobId)
}

/** Whether the résumé + profile + agent config are ready enough to apply. */
export async function getApplyReadiness() {
  await assertSession()
  const [resume, profile] = await Promise.all([getResume(), getProfile()])
  return {
    hasResume: Boolean(resume),
    hasProfile: Boolean(profile?.fullName && profile?.email),
    agentConfigured: applyAgentConfigured(),
  }
}

/** Enqueue the apply agent for a job. mode 'fill' stops at review; 'submit' also submits. */
export async function startApplication(jobId: number, mode: 'fill' | 'submit' = 'fill') {
  await assertSession()
  const detail = await getJobDetail(jobId)
  if (!detail) throw new Error('Job not found')

  const ats = detectAts(detail.url)
  if (!ats) {
    await upsertApplication(jobId, {
      status: 'unsupported',
      atsType: null,
      applyUrl: detail.url,
      error: 'This posting is not on Greenhouse/Lever/Ashby — apply manually via the posting link.',
    })
    revalidatePath('/interested')
    return
  }

  await upsertApplication(jobId, {
    status: 'queued',
    atsType: ats,
    applyUrl: detail.url,
    autoSubmit: mode === 'submit',
    error: null,
    screenshotBase64: null,
    log: [{ step: 'queued', at: new Date().toISOString() }],
  })

  const dispatched = await dispatchApplyWorker(jobId, mode)
  if (!dispatched) {
    await upsertApplication(jobId, {
      status: 'failed',
      error:
        'Apply agent not configured. Set BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID and GH_DISPATCH_TOKEN.',
    })
  }
  revalidatePath('/interested')
}

/** Approve the reviewed application and submit it. */
export async function submitApplication(jobId: number) {
  await assertSession()
  await upsertApplication(jobId, {
    status: 'queued',
    autoSubmit: true,
    log: [{ step: 'submit-approved', at: new Date().toISOString() }],
  })
  const dispatched = await dispatchApplyWorker(jobId, 'submit')
  if (!dispatched) {
    await upsertApplication(jobId, { status: 'failed', error: 'Apply agent not configured.' })
  }
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
