/**
 * Import a person's base résumé PDF (and optionally their basic application
 * profile fields) straight into the database — the CLI twin of Settings › Résumé.
 *
 *   npm run resume:import -- --profile brodi --file ~/path/resume.pdf \
 *     [--name "Full Name"] [--email x@y.com] [--phone "..."] [--location Remote] \
 *     [--linkedin https://linkedin.com/in/...] [--website https://...]
 *
 * Idempotent: re-running replaces the PDF and merges the given profile fields.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { isProfileKey } from '../lib/filters'
import { getProfile, upsertProfile, upsertResume, type ProfileInput } from '../lib/db/queries'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const profile = arg('profile')
  const file = arg('file')
  if (!isProfileKey(profile)) throw new Error('--profile must be one of the keys in lib/filters.ts SEARCH_PROFILES')
  if (!file) throw new Error('--file <path to PDF> is required')

  const bytes = readFileSync(file)
  if (bytes.subarray(0, 4).toString() !== '%PDF') throw new Error('File does not look like a PDF')
  await upsertResume(profile, {
    fileName: basename(file),
    mimeType: 'application/pdf',
    dataBase64: bytes.toString('base64'),
  })
  console.log(`résumé stored for ${profile}: ${basename(file)} (${(bytes.length / 1024).toFixed(0)} KB)`)

  const fields: ProfileInput = {}
  const name = arg('name')
  const email = arg('email')
  const phone = arg('phone')
  const location = arg('location')
  const linkedin = arg('linkedin')
  const website = arg('website')
  if (name) fields.fullName = name
  if (email) fields.email = email
  if (phone) fields.phone = phone
  if (location) fields.location = location
  if (linkedin) fields.linkedinUrl = linkedin
  if (website) fields.websiteUrl = website
  if (Object.keys(fields).length > 0) {
    const existing = await getProfile(profile)
    await upsertProfile(profile, { ...(existing ?? {}), ...fields })
    console.log(`application profile updated for ${profile}: ${Object.keys(fields).join(', ')}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
