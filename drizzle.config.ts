import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'

// Next.js uses .env.local; load it (falling back to .env) for drizzle-kit too.
config({ path: '.env.local' })
config()

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (see .env.example)')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
