import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type DB = PostgresJsDatabase<typeof schema>

let _db: DB | undefined

function getDb(): DB {
  if (_db) return _db

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (see .env.example)')
  }

  // Supabase transaction pooler (port 6543) does not support prepared statements,
  // so disable them. `max: 1` keeps connection use lean in serverless invocations.
  const client = postgres(connectionString, { prepare: false, max: 1 })
  _db = drizzle(client, { schema })
  return _db
}

// Lazy proxy: the postgres client is only constructed on first query, so
// importing this module during `next build` (no DB access) is safe.
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real, prop, receiver)
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export { schema }
