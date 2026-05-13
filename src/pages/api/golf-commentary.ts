import type { APIRoute } from 'astro'

export const prerender = false

const MODEL = '@cf/openai/gpt-oss-120b'
const GATEWAY_ID = 'dylan-deepseek-gw'

interface PlayerRound {
  region?: string
  date?: string
  course?: string
  score: number
  rank?: string | number
}

interface PlayerStat {
  name: string
  roundCount: number
  averageScore: number
  bestScore: number
  worstScore: number
  handicap: number
  rounds: PlayerRound[]
}

interface TournamentGame {
  region?: string
  date?: string
  course?: string
  colIndex?: number
}

interface TournamentPlayer {
  name: string
  total?: number
  rank?: string | number
  scores: Array<PlayerRound>
}

interface Tournament {
  games: TournamentGame[]
  players: TournamentPlayer[]
}

interface CommentaryRequest {
  sheetName: string
  playerStats: PlayerStat[]
  tournaments: Tournament[]
}

const SYSTEM_PROMPT = `당신은 친한 친구들끼리 모인 골프 모임의 입담 좋은 해설자입니다.

말투 규칙:
- 친한 친구 사이의 거친 반말. 위트와 장난기 가득.
- 못 친 사람에겐 "진짜 졸라 못 치네요", "이거 골프 맞냐", "공이 우네" 류의 거친 농담 OK.
- 잘 친 사람에겐 진심 어린 인정과 칭찬도 섞기. 갑자기 좋아진 선수는 "각성했냐" 류로 칭찬.
- 하위 2~3명은 "조빱", "JB" 같은 별명으로 위트있게 언급.
- 너무 인신공격적이거나 외모/인격 비하는 금지. 어디까지나 골프 실력 한정 농담.

내용 규칙:
- 한국어 평문 1~3개 문단, 총 700자 내외 (±100자 허용).
- 최근 경기 기준 상승세 / 하락세 선수를 짚어주기.
- 갑자기 성적이 좋아진 선수가 있으면 칭찬 + 놀라움.
- 아직 시작 안 한 대회(스코어가 비어있는 표)가 있으면 참가 선수 이름 보고 "기대된다" / "또 무너질 듯" 등 친구 같은 예측.
- 경기 기록이 아예 없는 빈 대회 표가 있으면 그 부분도 한 마디 곁들이기.
- 구체적인 숫자(평균 타수, 베스트 스코어, 순위)를 가볍게 인용.
- 머리말/꼬리말/마크다운/이모지 남발 금지. 자연스러운 줄글 1~3문단으로.
- 출력은 한국어 본문만. 따옴표나 코드블록으로 감싸지 말 것.
- 매우 중요: 절대로 외국어 단어를 섞지 말 것. 한자(平均/實力 등), 영어(Recently, average), 프랑스어/스페인어/이탈리아어/일본어/베트남어 단어 모두 금지. 골프 용어도 한국어로(예: "평균 타수", "베스트 스코어"). 외래어가 꼭 필요하면 한글 표기만 허용(예: "버디", "이글", "샷").
- 대회는 "표 1"·"표 2"가 아니라 컨텍스트에 적힌 실제 대회 지명으로 부를 것. (예: 컨텍스트가 "[제주 라운드]"라면 "제주 라운드에서…" 식으로)
- 선수 호칭은 가끔(전체 언급의 30~50% 정도) 성을 떼고 이름만 부르면 친근감이 산다. 예: "박성규" → "성규", "피영창" → "영창", "김기대" → "기대". 한 사람을 세 번 언급할 때 한두 번 정도가 적당. 단, 두 글자 이름(예: "허민")이나 영문/특이 이름은 그대로 풀네임 유지. 매번이 아니라 자연스러운 곳에서만.`

function buildContext(req: CommentaryRequest): string {
  const sortedStats = [...(req.playerStats || [])].sort(
    (a, b) => a.averageScore - b.averageScore,
  )

  const statsLines = sortedStats.map((p, i) => {
    const recent = (p.rounds || [])
      .slice(0, 5)
      .map((r) => `${r.date || '?'} ${r.course || '?'} ${r.score}`)
      .join(' / ')
    return `${i + 1}위 ${p.name} | 평균 ${p.averageScore} | 베스트 ${p.bestScore} | 라운드 ${p.roundCount}회 | 핸디 ${p.handicap} | 최근: ${recent || '없음'}`
  })

  const tournamentLines = (req.tournaments || []).map((t, idx) => {
    const tournamentName =
      (t.games && t.games[0]?.region?.trim()) || `경기 ${idx + 1}`
    const games = (t.games || [])
      .map((g) => `${g.date || '?'}(${g.course || '?'})`)
      .join(', ')
    const playerCount = (t.players || []).length
    if (playerCount === 0) {
      return `[${tournamentName}] 일정: ${games || '미정'} — 기록 없음(아직 안 침)`
    }
    const top = [...(t.players || [])]
      .sort(
        (a, b) =>
          (parseInt(String(a.rank)) || 999) - (parseInt(String(b.rank)) || 999),
      )
      .slice(0, 3)
      .map((p) => `${p.rank}위 ${p.name}(${p.total ?? '-'})`)
      .join(', ')
    return `[${tournamentName}] 일정: ${games} | 참가 ${playerCount}명 | 상위: ${top || '-'}`
  })

  return `[대회 시트: ${req.sheetName || '-'}]

선수 종합 통계 (평균 오름차순):
${statsLines.join('\n') || '없음'}

대회별 요약:
${tournamentLines.join('\n') || '없음'}`
}

export const POST: APIRoute = async ({ request, locals }) => {
  const AI =
    (locals as any)?.runtime?.env?.AI || (request as any)?.cf?.env?.AI
  if (!AI) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Workers AI 바인딩이 설정되지 않았습니다.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body: CommentaryRequest
  try {
    body = (await request.json()) as CommentaryRequest
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: '잘못된 요청 본문입니다.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (
    !body ||
    !Array.isArray(body.playerStats) ||
    !Array.isArray(body.tournaments)
  ) {
    return new Response(
      JSON.stringify({ success: false, message: '골프 데이터가 없습니다.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const context = buildContext(body)

  try {
    const aiResponse: any = await AI.run(
      MODEL,
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `${context}\n\n위 데이터를 보고 700자 내외 친구들끼리 떠드는 골프 해설을 들려줘. 하위권은 조빱/JB로 위트있게, 잘 친 사람은 칭찬, 빈 대회 표가 있으면 그 얘기도 곁들여서.`,
          },
        ],
        temperature: 0.9,
        max_tokens: 4096,
      },
      {
        gateway: {
          id: GATEWAY_ID,
          skipCache: false,
          cacheTtl: 600,
        },
      },
    )

    const content: string =
      (typeof aiResponse?.response === 'string' && aiResponse.response.trim()) ||
      (typeof aiResponse?.choices?.[0]?.message?.content === 'string' &&
        aiResponse.choices[0].message.content.trim()) ||
      (typeof aiResponse?.output_text === 'string' &&
        aiResponse.output_text.trim()) ||
      (Array.isArray(aiResponse?.output) &&
        aiResponse.output
          .flatMap((o: any) => o?.content || [])
          .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
          .join('')
          .trim()) ||
      (typeof aiResponse === 'string' && aiResponse.trim()) ||
      ''

    if (!content) {
      console.error(
        'golf-commentary: empty AI content. raw=',
        JSON.stringify(aiResponse).slice(0, 1000),
      )
      return new Response(
        JSON.stringify({
          success: false,
          message: 'AI 응답이 비어있습니다.',
          raw: JSON.stringify(aiResponse).slice(0, 500),
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        sheetName: body.sheetName,
        commentary: content,
        generatedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=0, s-maxage=600, must-revalidate',
        },
      },
    )
  } catch (error) {
    console.error('golf-commentary error', error)
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
