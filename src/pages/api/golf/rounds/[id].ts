import { golfApi } from '../../../../lib/golf/api'
import { json } from '../../../../lib/golf/member'
import { deleteRound, getRound, saveRound } from '../../../../lib/golf/repo'

export const prerender = false

// 모든 핸들러는 owner_user_id 로 범위 제한된 repo 함수만 사용한다. 남의 라운드는 404.
export const GET = golfApi(async ({ ctx, db, context }) => {
  const round = await getRound(db, ctx.user.id, String(context.params.id))
  return round ? json({ round }) : json({ error: 'not found' }, 404)
})

export const PUT = golfApi(async ({ ctx, db, body, context }) => {
  const id = await saveRound(db, ctx.user.id, body, String(context.params.id))
  return json({ id })
})

export const DELETE = golfApi(async ({ ctx, db, context }) => {
  await deleteRound(db, ctx.user.id, String(context.params.id))
  return json({ ok: true })
})
