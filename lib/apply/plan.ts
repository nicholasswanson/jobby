import { anthropic, CLAUDE_MODEL } from '../ai/client'
import type { ApplicationProfile } from '../db/schema'

export type FormField = {
  ref: string // stable id we assign for locating the element later
  label: string // visible label / aria-label / placeholder
  type: 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file' | 'other'
  name?: string
  required: boolean
  options?: string[] // for select / radio / checkbox groups
}

export type FieldAction = {
  ref: string
  action: 'fill' | 'select' | 'check' | 'upload' | 'skip'
  value?: string // fill: text; select/check: the exact option label to choose
  reason?: string
}

const SYSTEM = `You fill out a job application form on the candidate's behalf, using ONLY the candidate profile provided. You never invent facts.

Rules:
- Personal fields (name, email, phone, location, LinkedIn, website/portfolio): fill from the profile.
- Résumé / CV file inputs: action "upload".
- Work-authorization questions ("Are you authorized to work in the US?", visa sponsorship): answer from the profile's workAuthorization / requiresSponsorship. Pick the option that matches (e.g. authorized = Yes; needs sponsorship uses requiresSponsorship).
- Optional demographic / EEO questions (gender, race/ethnicity, veteran status, disability): if the profile says declineDemographics, choose the "decline to self-identify" / "I don't wish to answer" / "prefer not to say" option (or skip if no such option). Never guess a demographic value.
- Custom screening / free-text questions: answer ONLY if the profile's extraAnswers contains a clearly matching Q&A; otherwise action "skip".
- For select/radio/checkbox, "value" MUST be exactly one of the field's given options.
- If you cannot confidently answer a field from the profile, action "skip". Do not fabricate.
- Required fields you must skip are fine — a human will review before submitting.`

const SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          action: { type: 'string', enum: ['fill', 'select', 'check', 'upload', 'skip'] },
          value: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['ref', 'action'],
        additionalProperties: false,
      },
    },
  },
  required: ['actions'],
  additionalProperties: false,
} as const

/** Ask Claude to map each form field to a fill action using the candidate profile. */
export async function planFill(
  fields: FormField[],
  profile: ApplicationProfile,
): Promise<FieldAction[]> {
  const profileForModel = {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedinUrl: profile.linkedinUrl,
    websiteUrl: profile.websiteUrl,
    workAuthorization: profile.workAuthorization,
    requiresSponsorship: profile.requiresSponsorship,
    willingToRelocate: profile.willingToRelocate,
    declineDemographics: profile.declineDemographics,
    extraAnswers: profile.extraAnswers ?? [],
  }

  const message = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Candidate profile:\n${JSON.stringify(profileForModel, null, 2)}\n\nForm fields:\n${JSON.stringify(fields, null, 2)}\n\nReturn the fill actions.`,
      },
    ],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  const raw = textBlock && 'text' in textBlock ? textBlock.text : '{"actions":[]}'
  const parsed = JSON.parse(raw) as { actions: FieldAction[] }
  return parsed.actions
}
