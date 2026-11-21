import { golfApi } from '../../../../../lib/golf/api'
import { json } from '../../../../../lib/golf/member'
import { createCourse } from '../../../../../lib/golf/repo'

export const prerender = false

export const POST = golfApi(async ({ ctx, db, body, context }) => {
  const id = await createCourse(db, ctx.user.id, String(context.params.id), body)
  return json({ id }, 201)
})
