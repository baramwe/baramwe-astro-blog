import type { APIRoute } from 'astro'

export const prerender = false

const MODEL = '@cf/openai/gpt-oss-120b'
const GATEWAY_ID = 'dylan-deepseek-gw'

// 도입부에 랜덤으로 하나 골라 인용할 골프 격언/유머 모음
const GOLF_QUOTES: string[] = [
  '골프의 90%는 멘탈이다. 나머지 10%도 멘탈이다.',
  "가장 중요한 샷은 바로 '다음 샷'이다.",
  '골프는 실수를 줄이는 게임이지, 완벽을 기하는 게임이 아니다.',
  '연습을 하면 할수록, 나는 더욱 운이 좋아진다.',
  '골프는 아침에 당신을 미치게 했다가, 오후에 당신을 매료시키는 유일한 게임이다.',
  '골프와 섹스의 공통점: 못해도 즐겁다.',
  '골프공은 물을 무서워하지 않는다. 다만 물 속으로 다이빙하는 것을 좋아할 뿐이다.',
  '골프 채를 새로 산다고 실력이 느는 건 아니지만, 기분은 확실히 좋아진다.',
  '백스윙은 3초, 다운스윙은 0.5초, 자괴감은 18홀 내내.',
  '멀리 가는 공보다 똑바로 가는 공이 결국 먼저 도착한다.',
  '퍼팅은 지나가지 않으면 들어가지 않는다.',
  '드라이버는 쇼, 퍼팅은 돈이다.',
  '골프 코스에서 성격이 드러나는 것이 아니라, 골프가 성격을 만든다.',
  '함께 골프를 쳐보지 않은 사람과는 절대 비즈니스를 하지 마라.',
  "내가 골프를 그만두지 못하는 이유는 딱 하나, 어쩌다 한 번 맞는 그 '오잘공' 때문이다.",
  '골프는 공을 치는 운동이 아니라, 내 성질을 죽이는 수련이다.',
  "골프에서 가장 위험한 구질은 '슬라이스'가 아니라 '설마'다.",
  '골프는 100m를 걷기 위해 4시간 동안 고민하는 가장 비효율적이고 아름다운 스포츠다.',
  '골프공은 달걀과 같다. 하얗고, 12개씩 팔리며, 일주일 뒤에는 또 새로 사야 한다.',
  '골프는 신이 일찍 은퇴한 사람들을 벌주기 위해 만든 게임이다.',
  "연습장에서는 누구나 타이거 우즈다. 필드만 나가면 그냥 '타이거'가 될 뿐.",
  '연습을 하루 거르면 내가 알고, 이틀 거르면 갤러리가 알고, 사흘 거르면 온 세상이 안다.',
  '골프 실력을 늘리는 세 가지: 레슨 받기, 끊임없이 연습하기... 아니면 그냥 속이기.',
  '고수는 한 타를 버림으로써 위기를 극복하지만, 하수는 한 타를 아끼려다 위기를 자초한다.',
  '어떤 사람의 본성을 알고 싶다면 그와 함께 골프를 쳐보라.',
  '골프는 비폭력적인 게임처럼 보이지만 내면적으로는 매우 폭력적이다.',
  '공을 보지 않고 고개를 들면, 당신의 스코어는 하늘로 치솟는다.',
  "골프는 나이와 상관없이 '구력'과 '평정심'이 '힘'을 이기는 게임이다.",
  '헤드업을 하는 이유는 결과가 궁금해서가 아니라, 내 샷에 확신이 없어서다.',
]

function pickRandomQuote(): string {
  return GOLF_QUOTES[Math.floor(Math.random() * GOLF_QUOTES.length)]
}

interface PlayerRound {
  tournamentId?: number
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

순위 평가 규칙 (매우 중요):
- 우선순위 1순위: 각 대회에서 "1위(우승)를 몇 번 했는가". 컨텍스트의 "1위 N회" 수치를 가장 무겁게 다루기. 우승 횟수 많은 선수를 가장 먼저, 가장 비중 있게 칭찬.
- 우선순위 2순위: 2위·3위 입상 횟수.
- 우선순위 3순위: 평균 타수 종합 순위. (평균만 살짝 낮다고 1위 횟수 많은 선수를 깎아내리지 말 것.)
- "평균이 1위라서 짱이다" 식의 단순 평균 1위 찬양은 피하기. 우승 횟수가 진짜 챔피언의 척도.

선수 프로필 (해설에 캐릭터로 녹여서 사용):
- 박청주: 언더파를 목표로 레슨 중이지만 좀처럼 실력이 안 늘고 있음. 입버릇처럼 "조만간 복수하겠다"고 함. 대회를 추진해 주는 고마운 대표님이기도 함. 다른 사람이 샷하고 궁시렁거리면 "상국아! 안 궁금하다고!"라고 받아치는 유행어의 주인공.
- 주영준: 한때 쌩크로 고생했고 지금도 가끔 쌩크가 터짐.
- 허민: 멤버 중 막내.
- 박병준: 늘 유쾌한 선수. 쌩크로 고생한 적 있고, 페어웨이보다 거친 러프에서 샷을 자주 함. 공이 좌우로 깊숙이 박혀 "죽었나?" 싶을 때 "봤어! 봤어!"를 외치는 유행어의 주인공.
- 김기대: 역대 우승 경력이 가장 많고 늘 우승 후보로 거론되는 선수.
- 피영창: 늘 우승 후보지만 아직 대회 우승 0회. 신중한 플레이 스타일.
- 박성규: 멤버 중 나이가 가장 많고 노쇠해서 비거리는 짧지만, 얍삽한 설거지(어프로치/퍼터)와 유틸리티 활용이 강점.
- 전상국: "난 좀 잘치면 안되냐?" 유행어의 주인공. 기복이 좀 심한 편.
- 손형술: 설거지(어프로치·퍼터)가 좋고 최근에는 드라이버 비거리도 부쩍 늘었음.
프로필은 모든 선수에 매번 다 언급할 필요 없음. 해당 선수 얘기 나올 때 캐릭터에 맞춰 자연스럽게 한두 마디 곁들이면 충분.

도입부 규칙 (첫 1~3문장, 한 문단):
- 컨텍스트에 적힌 "오늘의 골프 격언"을 큰따옴표로 정확히 그대로 한 번 인용할 것. 임의 변경·요약·번역 금지.
- 인용 직후 그 격언의 맥락에 맞춰 친구처럼 받아치는 위트 한 마디를 짧게 붙이기.
  예) "퍼팅은 지나가지 않으면 들어가지 않는다." 쫄지 말란 말이야!
  예) "드라이버는 쇼, 퍼팅은 돈이다." 우리 중에 쇼만 하다 통장 빈 놈 누군지 알지?
- 그다음 한 줄은 컨텍스트의 "조회 모드"에 따라 분기:
  * 현재 시즌(조회 모드: 현재 시즌)이면 → 그 계절감을 한 줄로 자연스럽게 이어 붙이기.
    봄(3~5월): "따뜻해졌네, 니들 대회 안 햐?" 류.
    여름(6~8월): 더위·새벽 티오프·체력 농담.
    가을(9~11월): 단풍 라운드·시즌 절정.
    겨울(12~2월): 한국 추워서 못 친다는 푸념 + 따뜻한 동남아(태국·베트남·필리핀·하이난) 한 번 던지기.
  * 회고 모드(조회 모드: 회고)면 → 계절·날씨 묘사는 절대 쓰지 말고, "그 해 YYYY년 시즌 돌이켜보면…", "YYYY년엔 누가 잘 쳤더라" 같이 과거를 되짚는 한 줄로 이어 붙이기.
- 도입부 끝나면 자연스럽게 본론(우승 횟수·선수 평가)으로 넘어갈 것. 본론도 회고 모드면 과거형("우승했었다", "잘 쳤다")으로, 현재 시즌이면 현재 진행형("우승하고 있다", "기대된다")으로 톤을 맞출 것.

내용 규칙:
- 한국어 평문 1~2개 문단. 분량은 **최소 350자, 권장 400~450자, 최대 500자**(공백 포함). 350자 미만 금지, 500자 초과도 금지.
- 모든 선수를 다 짚지 말 것. 잘 친 1~2명 + 인상적인 한 명(상승세든 하락세든) 정도만 가볍게 언급. 톤은 "지난 경기 잘 쳤더라, 기대된다" 수준으로 부담 없이.
- 최근 경기 기준 상승세 / 하락세 선수를 짚어주기.
- 갑자기 성적이 좋아진 선수가 있으면 칭찬 + 놀라움.
- 현재 시즌 모드에서 아직 시작 안 한 대회(스코어가 비어있는 표)가 있으면 참가 선수 이름 보고 "기대된다" / "또 무너질 듯" 등 친구 같은 예측.
- 회고 모드면 빈 대회 표는 "그 해엔 못 치고 넘어간 라운드" 정도로 짧게 짚거나 그냥 생략. 미래 예측 표현 절대 금지.
- 구체적인 숫자(우승 횟수, 평균 타수, 베스트 스코어)를 가볍게 인용.
- 머리말/꼬리말/마크다운/이모지 남발 금지. 자연스러운 줄글 1~3문단으로.
- 출력은 한국어 본문만. 따옴표나 코드블록으로 감싸지 말 것.
- 매우 중요: 절대로 외국어 단어를 섞지 말 것. 한자(平均/實力 등), 영어(Recently, average), 프랑스어/스페인어/이탈리아어/일본어/베트남어 단어 모두 금지. 골프 용어도 한국어로(예: "평균 타수", "베스트 스코어"). 외래어가 꼭 필요하면 한글 표기만 허용(예: "버디", "이글", "샷").
- 대회는 "표 1"·"표 2"가 아니라 컨텍스트에 적힌 실제 대회 지명으로 부를 것. (예: 컨텍스트가 "[제주 라운드]"라면 "제주 라운드에서…" 식으로)
- 선수 호칭은 가끔(전체 언급의 30~50% 정도) 성을 떼고 이름만 부르면 친근감이 산다. 예: "박성규" → "성규", "피영창" → "영창", "김기대" → "기대". 한 사람을 세 번 언급할 때 한두 번 정도가 적당. 단, 두 글자 이름(예: "허민")이나 영문/특이 이름은 그대로 풀네임 유지. 매번이 아니라 자연스러운 곳에서만.`

function getKstSeasonInfo(now: Date = new Date()): {
  todayLabel: string
  todayYear: number
  season: string
  hint: string
} {
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth() + 1
  const d = kst.getUTCDate()
  const todayLabel = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  let season = '봄'
  let hint = ''
  if (m >= 3 && m <= 5) {
    season = '봄'
    hint = '따뜻해지는 시즌. 라운드 시작하기 좋은 때.'
  } else if (m >= 6 && m <= 8) {
    season = '여름'
    hint = '더위·장마. 새벽 티오프, 체력 관리 농담이 어울림.'
  } else if (m >= 9 && m <= 11) {
    season = '가을'
    hint = '단풍 라운드, 골프 시즌 절정.'
  } else {
    season = '겨울'
    hint = '한국 골프장 춥다. 따뜻한 동남아(태국·베트남·필리핀·하이난) 원정 한 마디 곁들이면 자연스러움.'
  }
  return { todayLabel, todayYear: y, season, hint }
}

function countRanks(
  rounds: PlayerRound[],
): { first: number; second: number; third: number } {
  // score.astro 와 동일하게 (tournamentId|rank) 로 대회 단위 중복 제거 후 카운트
  const seen = new Set<string>()
  let first = 0,
    second = 0,
    third = 0
  for (const r of rounds || []) {
    const key = `${r.tournamentId ?? r.region ?? '?'}|${r.rank ?? '-'}`
    if (seen.has(key)) continue
    seen.add(key)
    const n = parseInt(String(r.rank))
    if (n === 1) first++
    else if (n === 2) second++
    else if (n === 3) third++
  }
  return { first, second, third }
}

function buildContext(req: CommentaryRequest): string {
  // 각 선수의 대회별 1·2·3위 횟수 미리 계산
  const playersWithRanks = (req.playerStats || []).map((p) => ({
    ...p,
    rc: countRanks(p.rounds || []),
  }))

  // 우승 횟수 → 2위 → 3위 → 평균 오름차순으로 정렬 (챔피언 우선)
  const championRanked = [...playersWithRanks].sort((a, b) => {
    if (b.rc.first !== a.rc.first) return b.rc.first - a.rc.first
    if (b.rc.second !== a.rc.second) return b.rc.second - a.rc.second
    if (b.rc.third !== a.rc.third) return b.rc.third - a.rc.third
    return a.averageScore - b.averageScore
  })

  const statsLines = championRanked.map((p, i) => {
    const recent = (p.rounds || [])
      .slice(0, 5)
      .map((r) => `${r.date || '?'} ${r.course || '?'} ${r.score}`)
      .join(' / ')
    const rcStr = `우승 ${p.rc.first}회 / 2위 ${p.rc.second}회 / 3위 ${p.rc.third}회`
    return `${i + 1}. ${p.name} | ${rcStr} | 평균 ${p.averageScore} | 베스트 ${p.bestScore} | 라운드 ${p.roundCount}회 | 핸디 ${p.handicap} | 최근: ${recent || '없음'}`
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

  const { todayLabel, todayYear, season, hint } = getKstSeasonInfo()
  const quote = pickRandomQuote()

  // 시트명에서 4자리 연도 추출 (예: '2025', '2025 ', '2025 시즌' 모두 매칭)
  const sheetYearMatch = (req.sheetName || '').match(/\d{4}/)
  const sheetYear = sheetYearMatch ? parseInt(sheetYearMatch[0], 10) : todayYear
  const isPast = sheetYear < todayYear

  const dateBlock = isPast
    ? `[조회 모드: 회고 (시트 ${sheetYear}년 · 오늘 ${todayLabel})]
이 시트는 ${sheetYear}년 시즌으로 현재(${todayYear}년)보다 과거다.
- 도입부에서 날씨·계절 묘사는 절대 쓰지 말 것.
- 대신 "그 해 ${sheetYear}년에는…", "${sheetYear} 시즌 돌이켜보면…" 같은 회고 어투로 운을 떼기.
- 본문도 과거형으로: "누가 잘 쳤다", "그때 우승은 누구였다" 식으로 정리.
- 향후 일정/예측("기대된다", "다음 대회") 같은 표현 금지 — 이미 끝난 시즌이니까.`
    : `[조회 모드: 현재 시즌 (시트 ${sheetYear}년 · 오늘 ${todayLabel}, 계절 ${season})]
${hint}
- 도입부에 계절감을 한 줄 자연스럽게 곁들일 것.`

  return `${dateBlock}

[오늘의 골프 격언]
"${quote}"
→ 도입부에서 이 문장을 큰따옴표로 그대로 한 번 인용하고, 맥락에 맞는 위트 한마디를 짧게 곁들일 것.

[대회 시트: ${req.sheetName || '-'}]

선수별 성적 (우승 횟수 많은 순 — 평균보다 이걸 더 우선해서 언급):
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
        max_tokens: 5120,
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
