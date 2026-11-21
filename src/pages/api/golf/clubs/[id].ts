import { golfApi } from '../../../../lib/golf/api'
import { json } from '../../../../lib/golf/member'
import { deleteClub } from '../../../../lib/golf/repo'

export const prerender = false

export const DELETE = golfApi(async ({ db, context }) => {
  await deleteClub(db, String(context.params.id))
  return json({ ok: true })
})
