import { golfApi } from '../../../lib/golf/api'
import { json } from '../../../lib/golf/member'
import { searchIndex } from '../../../lib/golf/repo'

export const prerender = false

export const GET = golfApi(async ({ ctx, db }) => json(await searchIndex(db, ctx.user.id)))
