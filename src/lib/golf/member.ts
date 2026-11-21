import type { SessionUser } from '../auth/session'

// 골프 스코어는 1인 전용이다. GOLF_OWNER_EMAIL(Wrangler secret / .dev.vars) 계정만 접근할 수 있다.

export interface GolfContext {
  user: SessionUser
}

export function getOwnerEmail(locals: App.Locals): string | null {
  const v = (locals.runtime?.env as { GOLF_OWNER_EMAIL?: string } | undefined)?.GOLF_OWNER_EMAIL
  return v?.trim().toLowerCase() || null
}

export const isOwner = (user: SessionUser, ownerEmail: string | null): boolean =>
  !!ownerEmail && user.email.toLowerCase() === ownerEmail

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
