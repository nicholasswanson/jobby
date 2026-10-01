// Pipeline stages for jobs marked Interested (jobs.pipeline_stage). Ordered as
// shown on /interested; `inactive` is the catch-all for rejected / withdrawn /
// went-cold and sits collapsed at the bottom.

export const PIPELINE_STAGES = [
  { key: 'saved', label: 'Saved' },
  { key: 'applied', label: 'Applied' },
  { key: 'phone_screen', label: 'Phone screen' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer', label: 'Offer' },
  { key: 'inactive', label: 'Inactive' },
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]['key']

export function isPipelineStage(v: unknown): v is PipelineStage {
  return typeof v === 'string' && PIPELINE_STAGES.some((s) => s.key === v)
}

export function stageLabel(key: string): string {
  return PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key
}
