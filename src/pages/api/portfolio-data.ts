import type { APIRoute } from 'astro'
import { getGoogleAuthToken } from '../../lib/google-auth'

export const prerender = false

// "주가투_Portfolio" 파일 ID
const FILE_ID = '1r6YH5A24Tjr3D2PuVVaGZqbmpYl2Ju8-bY3MwfPmqsw'

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    console.log('📊 포트폴리오 데이터 API 호출됨')

    // 환경 변수에서 키 가져오기
    let envKey = (locals as any)?.runtime?.env?.GCP_SERVICE_ACCOUNT_KEY || 
                 (request as any)?.cf?.env?.GCP_SERVICE_ACCOUNT_KEY

    if (!envKey) {
      return new Response(JSON.stringify({ error: 'GCP Key not found' }), { status: 500 })
    }

    // 토큰 획득
    const accessToken = await getGoogleAuthToken(envKey)
    
    // 1. 시트 이름 알아내기
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${FILE_ID}?fields=sheets.properties.title`
    const metaResponse = await fetch(metaUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!metaResponse.ok) {
      throw new Error(`Failed to fetch spreadsheet metadata: ${metaResponse.status}`)
    }
    
    const metaData = await metaResponse.json()
    const sheetName = metaData.sheets[0].properties.title
    console.log(`📑 시트 이름 발견: ${sheetName}`)

    // 2. 데이터 가져오기 (3행 ~ 끝까지)
    // A열부터 Z열까지 넉넉하게 가져옵니다.
    // A3:Z 로 수정하여 모든 행을 가져옴
    const range = `${sheetName}!A3:Z`
    const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${FILE_ID}/values/${encodeURIComponent(range)}`
    
    const dataResponse = await fetch(dataUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!dataResponse.ok) {
      throw new Error(`Failed to fetch sheet data: ${dataResponse.status}`)
    }

    const sheetData = await dataResponse.json()
    const rows = sheetData.values

    console.log('📋 시트 데이터 행 수:', rows?.length)

    if (!rows || rows.length < 9) {
      return new Response(JSON.stringify({ error: 'Not enough data rows', rows }), { status: 400 })
    }

    // 3. 데이터 파싱 및 매핑
    // API 요청 범위: A3:Z
    // ... (기존 주석) ...
    // rows[8] = 11행 (총 자산)
    // rows[9] = 12행 (빈 행 추정)
    // rows[10] = 13행 (여기서부터 상세 데이터 시작)

    const investorsRow = rows[1] // 4행
    const investmentRow = rows[3] // 6행
    const profitRow = rows[5] // 8행
    const rateRow = rows[7] // 10행
    const assetsRow = rows[8] // 11행

    const investors = []

    // --- 요약 데이터 파싱 (기존 로직) ---
    // C열(인덱스 2)부터 데이터가 시작됨 (A=0, B=1, C=2)
    for (let i = 2; i < investorsRow.length; i++) {
      const name = investorsRow[i]
      // 이름이 없거나 '총 합계'인 경우 제외
      if (!name || name === '총 합계') continue

      // 숫자 파싱 헬퍼 (원, %, 콤마 제거)
      const parseNumber = (str: string) => {
        if (!str) return 0
        const cleanStr = str.replace(/[^\d.-]/g, '')
        const val = parseFloat(cleanStr)
        return isNaN(val) ? 0 : val
      }

      const investmentStr = investmentRow[i] || "0"
      const investment = parseNumber(investmentStr)

      // 투자금이 0원이면 제외
      if (investment === 0) continue

      const profit = parseNumber(profitRow[i] || "0")
      const rate = parseNumber(rateRow[i] || "0")
      const assets = parseNumber(assetsRow[i] || "0")

      investors.push({
        name,
        investment,
        profit,
        rate,
        assets,
        raw: {
            investment: investmentStr,
            profit: profitRow[i] || "0원",
            rate: rateRow[i] || "0%",
            assets: assetsRow[i] || "0원"
        }
      })
    }

    // 4. 총자산 순으로 정렬 (내림차순)
    investors.sort((a, b) => b.assets - a.assets)

    // --- 상세 데이터 파싱 (신규 로직) ---
    // 13행(index 10)부터 끝까지 읽음
    const details = []
    
    // rows[10]이 존재하는지 확인
    if (rows.length > 10) {
        for (let i = 10; i < rows.length; i++) {
            const row = rows[i]
            // B열(Index 1)에 투자자 이름이 없으면 스킵 (빈 행 등)
            if (!row[1]) continue

            details.push({
                investor: row[1],       // B열: 투자자
                stockName: row[3],      // D열: 종목명
                buyDate: row[4],        // E열: 매수일자
                profit: row[8],         // I열: 평가손익 (raw string)
                rate: row[9],           // J열: 수익률 (raw string)
                currentValue: row[10]   // K열: 평가금액 (raw string)
            })
        }
    }

    return new Response(JSON.stringify({
      success: true,
      sheetName,
      count: investors.length,
      data: investors,
      details: details // 상세 데이터 추가
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Portfolio API Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch portfolio data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
