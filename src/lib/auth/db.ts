export interface AuthEnv {
  DB: D1Database
  RESEND_API_KEY?: string
  AUTH_MAIL_FROM?: string
}

export function getEnv(locals: any, request?: Request): AuthEnv | null {
  if (locals?.runtime?.env?.DB) return locals.runtime.env as AuthEnv
  if ((request as any)?.cf?.env?.DB) return (request as any).cf.env as AuthEnv
  return null
}

export function getDB(locals: any, request?: Request): D1Database | null {
  return getEnv(locals, request)?.DB ?? null
}
