import { golfApi } from '../../../lib/golf/api'
import { json } from '../../../lib/golf/member'
import { saveRound } from '../../../lib/golf/repo'

export const prerender = false

export const POST = golfApi(async ({ ctx, db, body }) => {
  const id = await saveRound(db, ctx.user.id, body)
  return json({ id }, 201)
})
