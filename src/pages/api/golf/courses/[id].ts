import { golfApi } from '../../../../lib/golf/api'
import { json } from '../../../../lib/golf/member'
import { deleteCourse, updateCoursePars } from '../../../../lib/golf/repo'

export const prerender = false

export const PATCH = golfApi(async ({ db, body, context }) => {
  await updateCoursePars(db, String(context.params.id), body)
  return json({ ok: true })
})

export const DELETE = golfApi(async ({ db, context }) => {
  await deleteCourse(db, String(context.params.id))
  return json({ ok: true })
})
