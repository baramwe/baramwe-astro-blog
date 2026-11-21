import { golfApi } from '../../../lib/golf/api'
import { json } from '../../../lib/golf/member'
import { createClub } from '../../../lib/golf/repo'

export const prerender = false

export const POST = golfApi(async ({ ctx, db, body }) => {
  const id = await createClub(db, ctx.user.id, body)
  return json({ id }, 201)
})
