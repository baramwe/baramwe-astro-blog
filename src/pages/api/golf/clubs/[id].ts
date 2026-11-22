import { golfApi } from '../../../../lib/golf/api'
import { json } from '../../../../lib/golf/member'
import { deleteClub, updateClub } from '../../../../lib/golf/repo'

export const prerender = false

export const PATCH = golfApi(async ({ db, body, context }) => {
  await updateClub(db, String(context.params.id), body)
  return json({ ok: true })
})

export const DELETE = golfApi(async ({ db, context }) => {
  await deleteClub(db, String(context.params.id))
  return json({ ok: true })
})
