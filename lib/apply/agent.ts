import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Browserbase from '@browserbasehq/sdk'
import { chromium, type Page } from 'playwright-core'
import { getApplication, getProfile, getResume, getTailoring, upsertApplication } from '../db/queries'
import { planFill, type FieldAction, type FormField } from './plan'

type LogEntry = { step: string; detail?: string; at: string }

function now() {
  return new Date().toISOString()
}

// --- DOM field extraction (runs in the page) ---------------------------------

async function extractFields(page: Page): Promise<FormField[]> {
  return page.evaluate(() => {
    const out: {
      ref: string
      label: string
      type: FormFieldType
      name?: string
      required: boolean
      options?: string[]
    }[] = []
    type FormFieldType =
      | 'text'
      | 'email'
      | 'tel'
      | 'url'
      | 'textarea'
      | 'select'
      | 'radio'
      | 'checkbox'
      | 'file'
      | 'other'

    const labelFor = (el: Element): string => {
      const id = el.getAttribute('id')
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`)
        if (l?.textContent) return l.textContent.trim()
      }
      const wrap = el.closest('label')
      if (wrap?.textContent) return wrap.textContent.trim()
      const aria = el.getAttribute('aria-label') || el.getAttribute('placeholder')
      if (aria) return aria.trim()
      // Nearest preceding label-ish text
      const prev = el.closest('div,section,fieldset')?.querySelector('label,legend')
      return prev?.textContent?.trim() || el.getAttribute('name') || ''
    }

    let i = 0
    const seenRadioGroups = new Set<string>()

    document.querySelectorAll('input, select, textarea').forEach((el) => {
      const tag = el.tagName.toLowerCase()
      const inputType = (el.getAttribute('type') || 'text').toLowerCase()
      if (['hidden', 'submit', 'button', 'reset', 'search'].includes(inputType)) return
      if ((el as HTMLElement).offsetParent === null && inputType !== 'file') return // not visible

      const ref = `f${i++}`
      el.setAttribute('data-jobby-ref', ref)
      const required =
        el.hasAttribute('required') || el.getAttribute('aria-required') === 'true'
      const name = el.getAttribute('name') || undefined

      if (tag === 'select') {
        const options = Array.from(el.querySelectorAll('option'))
          .map((o) => o.textContent?.trim() || '')
          .filter(Boolean)
        out.push({ ref, label: labelFor(el), type: 'select', name, required, options })
        return
      }
      if (tag === 'textarea') {
        out.push({ ref, label: labelFor(el), type: 'textarea', name, required })
        return
      }
      if (inputType === 'file') {
        out.push({ ref, label: labelFor(el) || 'Résumé', type: 'file', name, required })
        return
      }
      if (inputType === 'radio') {
        if (name && seenRadioGroups.has(name)) return
        if (name) seenRadioGroups.add(name)
        const group = name
          ? Array.from(document.querySelectorAll(`input[type=radio][name="${CSS.escape(name)}"]`))
          : [el]
        const options = group.map((g) => labelFor(g)).filter(Boolean)
        out.push({
          ref,
          label: name ? labelFor(el).replace(/\s+/g, ' ') : labelFor(el),
          type: 'radio',
          name,
          required,
          options,
        })
        return
      }
      if (inputType === 'checkbox') {
        out.push({ ref, label: labelFor(el), type: 'checkbox', name, required, options: ['Yes', 'No'] })
        return
      }
      const t: FormFieldType = (['text', 'email', 'tel', 'url'] as const).includes(inputType as never)
        ? (inputType as FormFieldType)
        : 'text'
      out.push({ ref, label: labelFor(el), type: t, name, required })
    })

    return out
  })
}

// --- Apply the plan ----------------------------------------------------------

async function applyPlan(page: Page, actions: FieldAction[], resumePath: string, log: LogEntry[]) {
  for (const a of actions) {
    const el = page.locator(`[data-jobby-ref="${a.ref}"]`)
    try {
      if (a.action === 'skip') continue
      if (a.action === 'upload') {
        await el.setInputFiles(resumePath)
        log.push({ step: 'upload', detail: a.ref, at: now() })
        continue
      }
      if (a.action === 'fill' && a.value != null) {
        await el.fill(a.value)
        log.push({ step: 'fill', detail: `${a.ref}`, at: now() })
        continue
      }
      if (a.action === 'select' && a.value != null) {
        await el.selectOption({ label: a.value }).catch(() => el.selectOption(a.value!))
        log.push({ step: 'select', detail: `${a.ref}=${a.value}`, at: now() })
        continue
      }
      if (a.action === 'check' && a.value != null) {
        // Click the radio/checkbox in this field's group whose label matches value.
        const name = await el.getAttribute('name')
        const byLabel = page.getByLabel(a.value, { exact: false })
        if ((await byLabel.count()) > 0) await byLabel.first().check().catch(() => {})
        else if (name) {
          const opt = page.locator(`input[name="${name}"]`).filter({ hasText: a.value })
          await opt.first().check().catch(() => el.check().catch(() => {}))
        } else {
          await el.check().catch(() => {})
        }
        log.push({ step: 'check', detail: `${a.ref}=${a.value}`, at: now() })
      }
    } catch (err) {
      log.push({ step: 'field-error', detail: `${a.ref}: ${(err as Error).message}`, at: now() })
    }
  }
}

// --- Orchestration -----------------------------------------------------------

export async function runApply(jobId: number, mode: 'fill' | 'submit'): Promise<void> {
  const log: LogEntry[] = [{ step: 'start', detail: mode, at: now() }]
  const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
    upsertApplication(jobId, { status: status as never, log, ...extra })

  try {
    const [app, profile, resume, tailoring] = await Promise.all([
      getApplication(jobId),
      getProfile(),
      getResume(),
      getTailoring(jobId),
    ])
    if (!app?.applyUrl) throw new Error('No apply URL')
    if (!profile) throw new Error('No application profile — fill it in Settings')
    if (!resume) throw new Error('No résumé — upload it in Settings')

    await setStatus('running')

    // Prefer the tailored résumé PDF if ready; else the original.
    let resumeBytes: Buffer
    if (tailoring?.status === 'ready' && tailoring.tailoredMarkdown) {
      // The tailored PDF is produced by the /api/tailored route; regenerate here
      // from the same renderer to avoid an HTTP hop.
      const { renderToBuffer } = await import('@react-pdf/renderer')
      const ResumeDocument = (await import('../../app/api/tailored/[jobId]/ResumeDocument')).default
      resumeBytes = Buffer.from(
        await renderToBuffer(ResumeDocument({ markdown: tailoring.tailoredMarkdown })),
      )
    } else {
      resumeBytes = Buffer.from(resume.dataBase64, 'base64')
    }
    const resumePath = join(tmpdir(), `resume-${jobId}.pdf`)
    writeFileSync(resumePath, resumeBytes)

    // Remote browser (Browserbase) over CDP.
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! })
    const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID! })
    log.push({ step: 'session', detail: session.id, at: now() })
    const sessionUrl = `https://www.browserbase.com/sessions/${session.id}`

    const browser = await chromium.connectOverCDP(session.connectUrl)
    try {
      const context = browser.contexts()[0] ?? (await browser.newContext())
      const page = context.pages()[0] ?? (await context.newPage())
      await page.goto(app.applyUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      // Some boards hide the form behind an "Apply" button.
      const applyBtn = page.getByRole('button', { name: /apply/i }).first()
      if (await applyBtn.count()) await applyBtn.click().catch(() => {})
      await page.waitForTimeout(1500)

      const fields = await extractFields(page)
      log.push({ step: 'fields', detail: `${fields.length} fields`, at: now() })

      const actions = await planFill(fields, profile)
      log.push({ step: 'plan', detail: `${actions.filter((a) => a.action !== 'skip').length} actions`, at: now() })

      await applyPlan(page, actions, resumePath, log)

      const shot = await page.screenshot({ fullPage: true })
      const screenshotBase64 = shot.toString('base64')

      if (mode === 'submit') {
        const submit = page
          .getByRole('button', { name: /submit application|submit|apply now/i })
          .first()
        await submit.click({ timeout: 15_000 })
        await page.waitForTimeout(4000)
        log.push({ step: 'submitted', at: now() })
        await setStatus('submitted', { sessionUrl, screenshotBase64 })
      } else {
        await setStatus('needs_review', { sessionUrl, screenshotBase64 })
      }
    } finally {
      await browser.close().catch(() => {})
    }
  } catch (err) {
    log.push({ step: 'error', detail: (err as Error).message, at: now() })
    await upsertApplication(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      log,
    })
  }
}
