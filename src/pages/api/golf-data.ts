import type { APIRoute } from 'astro'
import { getGoogleAuthToken } from '../../lib/google-auth'

export const prerender = false

const TARGET_FILE_NAME = 'bluewine_golf'

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    console.log('⛳️ 골프 데이터 API 호출됨')

    let envKey = (locals as any)?.runtime?.env?.GCP_SERVICE_ACCOUNT_KEY || 
                 (request as any)?.cf?.env?.GCP_SERVICE_ACCOUNT_KEY

    if (!envKey) {
      return new Response(JSON.stringify({ error: 'GCP Key not found' }), { status: 500 })
    }

    const accessToken = await getGoogleAuthToken(envKey)
    
    // 1. 파일 검색
    const searchQuery = `name contains '${TARGET_FILE_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name)`
    
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!searchResponse.ok) throw new Error('File search failed')
    
    const searchData = await searchResponse.json()
    const files = searchData.files || []
    
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: 'Golf data file not found' }), { status: 404 })
    }

    const fileId = files[0].id

    // 2. 데이터 읽기 ('2025' 시트 기준)
    // 전체 데이터를 한 번에 가져옵니다.
    const range = '2025!A1:Z'
    const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${encodeURIComponent(range)}`
    
    const dataResponse = await fetch(dataUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    const sheetData = await dataResponse.json()
    const rows = sheetData.values || []

    // 3. 데이터 파싱 및 집계
    const tournaments = []
    let currentTournament: any = null

    // 전체 행 순회
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        
        // 헤더 행 발견 ("PRO"로 시작)
        if (row[0] && row[0].toString().toUpperCase() === 'PRO') {
            // 이전 대회가 진행 중이었다면 저장 (하지만 로직상 바로 아래 데이터 처리하므로 필요 없음)
            
            // 새 대회 시작
            currentTournament = {
                headerRow: row,
                games: [], // 각 열(Column)별 경기 정보
                players: []
            }
            tournaments.push(currentTournament)

            // 헤더 파싱 (날짜, 골프장)
            // 1열(이름) 이후부터 "평균" 전까지가 경기 데이터
            for (let j = 1; j < row.length; j++) {
                const cell = row[j]
                if (!cell) continue;
                if (cell === '평균' || cell === 'Total' || cell === '순위') break;

                // 줄바꿈으로 날짜/골프장 분리
                const parts = cell.split('\n')
                const date = parts[0] || ''
                const course = parts.length > 1 ? parts[1] : ''
                
                currentTournament.games.push({
                    colIndex: j,
                    date: date.trim(),
                    course: course.trim()
                })
            }
            continue
        }

        // 빈 행이면 건너뛰기
        if (!row[0] || row.length === 0) continue

        // 데이터 행 처리 (현재 대회가 있을 때만)
        if (currentTournament) {
            const name = row[0]
            const scores = []
            
            // 각 경기별 스코어 파싱
            for (const game of currentTournament.games) {
                const scoreStr = row[game.colIndex]
                // 숫자가 아닌 경우 (참석 안함 등) 처리
                const score = parseInt(scoreStr)
                if (!isNaN(score)) {
                    scores.push({
                        ...game,
                        score,
                        rank: row[row.length - 1] // 순위는 마지막 열에 있다고 가정 (Total 다음)
                    })
                }
            }

            if (scores.length > 0) {
                currentTournament.players.push({
                    name,
                    scores,
                    total: parseInt(row[row.length - 2]) || 0, // Total은 끝에서 두번째
                    rank: row[row.length - 1] || '-' // 순위는 끝에서 첫번째
                })
            }
        }
    }

    // 4. 선수별 통계 집계
    const playerStats: Record<string, any> = {}

    tournaments.forEach(tournament => {
        tournament.players.forEach((p: any) => {
            if (!playerStats[p.name]) {
                playerStats[p.name] = {
                    name: p.name,
                    rounds: [],
                    totalScoreSum: 0,
                    roundCount: 0,
                    bestScore: 999,
                    worstScore: 0
                }
            }

            const stat = playerStats[p.name]
            
            p.scores.forEach((s: any) => {
                stat.rounds.push({
                    date: s.date,
                    course: s.course,
                    score: s.score,
                    rank: p.rank // 해당 대회의 순위
                })
                
                stat.totalScoreSum += s.score
                stat.roundCount++
                if (s.score < stat.bestScore) stat.bestScore = s.score
                if (s.score > stat.worstScore) stat.worstScore = s.score
            })
        })
    })

    // 최종 통계 계산 (평균, 핸디 등)
    const resultPlayers = Object.values(playerStats).map(p => {
        const average = p.roundCount > 0 ? parseFloat((p.totalScoreSum / p.roundCount).toFixed(1)) : 0
        const handicap = parseFloat((average - 72).toFixed(1)) // 간단한 핸디 계산

        return {
            name: p.name,
            roundCount: p.roundCount,
            averageScore: average,
            bestScore: p.bestScore === 999 ? 0 : p.bestScore,
            worstScore: p.worstScore,
            handicap: handicap,
            rounds: p.rounds.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()) // 최신순 정렬 시도 (날짜 포맷에 따라 다를 수 있음)
        }
    })

    // 평균 스코어 기준 정렬 (오름차순) -> 핸디 낮은 순
    resultPlayers.sort((a, b) => a.averageScore - b.averageScore)

    return new Response(JSON.stringify({
        success: true,
        playerStats: resultPlayers
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Golf Data API Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch golf data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
