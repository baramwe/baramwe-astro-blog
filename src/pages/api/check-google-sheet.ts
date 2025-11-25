// Google Sheets 파일 존재 확인 API
import type { APIRoute } from 'astro'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    console.log('📊 Google Sheets 파일 체크 API 호출됨')
    
    // GCP 서비스 계정 키 가져오기
    let serviceAccountKey: string | undefined
    let environmentType = 'unknown'

    // 1. 환경 확인 및 서비스 계정 키 가져오기
    if ((locals as any)?.runtime?.env?.GCP_SERVICE_ACCOUNT_KEY) {
      serviceAccountKey = (locals as any).runtime.env.GCP_SERVICE_ACCOUNT_KEY
      environmentType = 'wrangler-dev-runtime'
    } else if ((request as any)?.cf?.env?.GCP_SERVICE_ACCOUNT_KEY) {
      serviceAccountKey = (request as any).cf.env.GCP_SERVICE_ACCOUNT_KEY
      environmentType = 'cloudflare-workers'
    }

    console.log(`🌍 감지된 환경: ${environmentType}`)
    console.log(`🔑 GCP 키 사용 가능: ${!!serviceAccountKey}`)

    if (!serviceAccountKey) {
      console.error('❌ GCP_SERVICE_ACCOUNT_KEY를 찾을 수 없습니다')
      return new Response(JSON.stringify({
        error: 'GCP service account key not found',
        environment: environmentType,
        message: 'GCP_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 2. 서비스 계정 키 파싱
    let credentials
    try {
      credentials = JSON.parse(serviceAccountKey)
      console.log(`✅ GCP 서비스 계정 키 파싱 완료: ${credentials.client_email}`)
    } catch (parseError) {
      console.error('❌ GCP 키 파싱 실패:', parseError)
      return new Response(JSON.stringify({
        error: 'Failed to parse GCP service account key',
        message: 'GCP 서비스 계정 키 형식이 올바르지 않습니다.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 3. JWT 토큰 생성 (직접 구현)
    const jwt = await createJWT(credentials)
    console.log('🔐 JWT 토큰 생성 완료')

    // 4. Access Token 획득
    const accessToken = await getAccessToken(jwt)
    console.log('🔑 Access Token 획득 완료')

    // 5. "주가투_Portfolio" 파일 검색 (fetch API 사용)
    const targetFileName = '주가투_Portfolio'
    console.log(`🔍 "${targetFileName}" 파일 검색 중...`)

    const searchQuery = `name contains '${targetFileName}' and mimeType='application/vnd.google-apps.spreadsheet'`
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink)&pageSize=10`
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error(`❌ Drive API 요청 실패: ${searchResponse.status} ${searchResponse.statusText}`)
      console.error(`❌ 에러 내용: ${errorText}`)
      throw new Error(`Drive API request failed: ${searchResponse.status} - ${errorText}`)
    }

    const searchData = await searchResponse.json()
    const files = searchData.files || []
    console.log(`📋 검색된 파일 수: ${files.length}`)

    // 6. 검색 결과 로깅
    let targetFile = null
    files.forEach((file, index) => {
      console.log(`📄 [${index + 1}] 파일명: "${file.name}"`)
      console.log(`   - ID: ${file.id}`)
      console.log(`   - 생성일: ${file.createdTime}`)
      console.log(`   - 수정일: ${file.modifiedTime}`)
      console.log(`   - 링크: ${file.webViewLink}`)
      
      if (file.name === targetFileName) {
        targetFile = file
        console.log(`✅ 정확히 일치하는 파일 발견: "${file.name}"`)
      }
    })

    // 7. 결과 반환
    const result = {
      success: true,
      environment: environmentType,
      targetFileName,
      searchResults: {
        totalFound: files.length,
        exactMatch: !!targetFile,
        files: files.map(file => ({
          id: file.id,
          name: file.name,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink,
          isExactMatch: file.name === targetFileName
        }))
      }
    }

    if (targetFile) {
      console.log(`🎯 "${targetFileName}" 파일이 성공적으로 발견되었습니다!`)
      console.log(`📍 파일 ID: ${targetFile.id}`)
      console.log(`🔗 파일 링크: ${targetFile.webViewLink}`)
    } else {
      console.log(`❌ "${targetFileName}" 파일을 찾을 수 없습니다`)
      if (files.length > 0) {
        console.log(`💡 유사한 파일들이 ${files.length}개 발견되었습니다`)
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Google Sheets 파일 체크 실패:', error)
    
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
      console.error(`❌ 에러 상세: ${error.message}`)
      if (error.stack) {
        console.error(`📍 스택 트레이스:`, error.stack)
      }
    }

    return new Response(JSON.stringify({
      error: 'Google Sheets file check failed',
      message: errorMessage,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// JWT 토큰 생성 함수
async function createJWT(credentials: any) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }

  // JWT 헤더
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  // Base64 URL 인코딩
  const base64UrlEncode = (obj: any) => {
    return btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)
  
  const signingInput = `${encodedHeader}.${encodedPayload}`
  
  // Private key 처리
  const privateKey = credentials.private_key.replace(/\\n/g, '\n')
  
  // Web Crypto API를 사용한 서명
  const keyData = await crypto.subtle.importKey(
    'pkcs8',
    str2ab(privateKeyToPem(privateKey)),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyData,
    new TextEncoder().encode(signingInput)
  )

  const encodedSignature = arrayBufferToBase64Url(signature)
  return `${signingInput}.${encodedSignature}`
}

// Access Token 획득 함수
async function getAccessToken(jwt: string) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    console.error(`❌ Token 요청 실패: ${tokenResponse.status} ${tokenResponse.statusText}`)
    console.error(`❌ 에러 내용: ${errorText}`)
    throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// 헬퍼 함수들
function str2ab(str: string) {
  const buf = new ArrayBuffer(str.length)
  const bufView = new Uint8Array(buf)
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}

function privateKeyToPem(privateKey: string) {
  // PEM 형식에서 헤더/푸터 제거하고 base64 디코드
  const pemContent = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\n/g, '')
  return atob(pemContent)
}

function arrayBufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
