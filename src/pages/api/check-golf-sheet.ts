// bluewine_golf 파일 구조 확인 API
import type { APIRoute } from 'astro'
import { getGoogleAuthToken } from '../../lib/google-auth'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    console.log('⛳️ bluewine_golf 파일 체크 API 호출됨')

    // 1. 인증 토큰 획득
    let envKey = (locals as any)?.runtime?.env?.GCP_SERVICE_ACCOUNT_KEY || 
                 (request as any)?.cf?.env?.GCP_SERVICE_ACCOUNT_KEY

    if (!envKey) {
      return new Response(JSON.stringify({ error: 'GCP Key not found' }), { status: 500 })
    }

    const accessToken = await getGoogleAuthToken(envKey)
    
    // 2. 최근 스프레드시트 파일 목록 조회 (디버깅용)
    // 이름 필터링 없이 최근 수정된 10개 파일 조회
    const searchQuery = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&orderBy=modifiedTime desc&pageSize=10&fields=files(id,name)`
    
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!searchResponse.ok) {
      throw new Error(`File search failed: ${searchResponse.status}`)
    }

    const searchData = await searchResponse.json()
    const files = searchData.files || []
    
    console.log('📂 접근 가능한 스프레드시트 목록:', files)

    // "bluewine_golf" 찾기
    const targetFile = files.find((f: any) => f.name.includes('bluewine_golf'))

    if (!targetFile) {
        return new Response(JSON.stringify({ 
            error: 'File not found in accessible list',
            accessibleFiles: files 
        }), { status: 404 })
    }

    const fileId = targetFile.id
    console.log(`✅ 파일 발견: ${targetFile.name} (${fileId})`)

    // 3. 시트 메타데이터 조회 (시트 목록 확인)
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=sheets.properties`
    const metaResponse = await fetch(metaUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    const metaData = await metaResponse.json()
    const sheets = metaData.sheets || []
    
    const sheetInfo = sheets.map((s: any) => ({
      title: s.properties.title,
      gridProperties: s.properties.gridProperties
    }))

    console.log('📋 시트 목록:', sheetInfo)

    // 4. 첫 번째 시트 데이터 읽기 (구조 분석용)
    // A1부터 Z100까지 읽어서 데이터 분포 확인
    const firstSheetName = sheetInfo[0].title
    const range = `${firstSheetName}!A1:Z100`
    const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${encodeURIComponent(range)}`
    
    const dataResponse = await fetch(dataUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    const sheetData = await dataResponse.json()
    const rows = sheetData.values || []

    // 5. 표 구분 가능성 분석
    // 빈 행이 연속으로 나타나는지, 헤더가 여러 번 나타나는지 체크
    
    return new Response(JSON.stringify({
      success: true,
      fileId,
      sheets: sheetInfo,
      sampleData: {
        rowCount: rows.length,
        firstRow: rows[0],
        rawData: rows // 전체 데이터를 반환하여 직접 확인
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Check Golf Sheet Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to check sheet',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
