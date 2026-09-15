import Anthropic from '@anthropic-ai/sdk'

// Model for all Claude calls (résumé tailoring + apply agent). Per the
// claude-api guidance, default to the most capable Opus tier.
export const CLAUDE_MODEL = 'claude-opus-4-8'

let _client: Anthropic | undefined

/** Lazy singleton so importing this module during `next build` never needs the key. */
export function anthropic(): Anthropic {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set (see .env.example)')
  }
  _client = new Anthropic()
  return _client
}
