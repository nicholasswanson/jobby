'use client'

import { useActionState } from 'react'
import { login, type LoginState } from './actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {})

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 p-6 shadow-sm dark:border-zinc-800"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Jobscout</h1>
          <p className="mt-1 text-sm text-zinc-500">Enter the shared password to continue.</p>
        </div>

        <NextField />

        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-100"
        />

        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-zinc-900 px-3 py-2.5 text-base font-medium text-white transition disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

// Reads the `?next=` param on the client and forwards it through the form.
function NextField() {
  const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null
  return <input type="hidden" name="next" value={next ?? '/'} />
}
