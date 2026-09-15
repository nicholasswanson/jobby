import { anthropic, CLAUDE_MODEL } from './client'
import { getJobDetail, getResume, upsertTailoring } from '../db/queries'

const SYSTEM = `You tailor a candidate's résumé to a specific job posting.

ABSOLUTE RULE — NEVER FABRICATE. You may only rephrase, reorder, and re-emphasize
experience, skills, and achievements that ALREADY appear in the résumé PDF. Do NOT
invent or add employers, job titles, dates, degrees, certifications, tools, metrics,
or responsibilities. If the job wants something the résumé doesn't show, do not add
it. Preserve every factual detail exactly (company names, titles, employment dates,
school, graduation). You are adjusting wording and ordering only, to surface the
best genuine matches for this role.

Output a COMPLETE tailored résumé in clean Markdown:
- Line 1: the candidate's name as an H1 (# Name)
- Contact line (email · phone · location · links) if present in the résumé
- A short "Summary" tuned to this role (built only from real résumé content)
- "Experience" with each role and re-emphasized bullet points
- "Skills" and "Education" as present in the original
Then a one-sentence rationale explaining why this candidate genuinely matches.`

const SCHEMA = {
  type: 'object',
  properties: {
    tailoredMarkdown: {
      type: 'string',
      description: 'The complete tailored résumé in Markdown.',
    },
    rationale: {
      type: 'string',
      description: 'One sentence on why the candidate matches this role.',
    },
  },
  required: ['tailoredMarkdown', 'rationale'],
  additionalProperties: false,
} as const

/**
 * Generate a tailored résumé for a job and persist it. Idempotent; safe to
 * re-run. Sets job_tailoring.status to ready/error itself.
 */
export async function generateTailoredResume(jobId: number): Promise<void> {
  try {
    const [resume, detail] = await Promise.all([getResume(), getJobDetail(jobId)])
    if (!resume) {
      await upsertTailoring(jobId, { status: 'error', error: 'No résumé uploaded.' })
      return
    }
    if (!detail) {
      await upsertTailoring(jobId, { status: 'error', error: 'Job not found.' })
      return
    }

    const c = detail.company
    const jobContext = [
      `Role: ${detail.title}`,
      c?.name ? `Company: ${c.name}${c.oneLiner ? ` — ${c.oneLiner}` : ''}` : '',
      c?.industry ? `Industry: ${c.industry}` : '',
      detail.location ? `Location: ${detail.location}` : '',
      '',
      'Job description:',
      detail.description ?? '(no description captured)',
    ]
      .filter(Boolean)
      .join('\n')

    const message = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: resume.dataBase64,
              },
            },
            {
              type: 'text',
              text: `Here is the candidate's résumé (PDF above). Tailor it to this job.\n\n${jobContext}`,
            },
          ],
        },
      ],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    const raw = textBlock && 'text' in textBlock ? textBlock.text : ''
    const parsed = JSON.parse(raw) as { tailoredMarkdown: string; rationale: string }

    await upsertTailoring(jobId, {
      status: 'ready',
      tailoredMarkdown: parsed.tailoredMarkdown,
      rationale: parsed.rationale,
      model: CLAUDE_MODEL,
      error: null,
    })
  } catch (err) {
    await upsertTailoring(jobId, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
