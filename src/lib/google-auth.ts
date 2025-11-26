// Google API 인증 유틸리티
import type { Env } from './db'

export async function getGoogleAuthToken(envOrKey: any) {
  // GCP 서비스 계정 키 가져오기
  let serviceAccountKey: string | undefined

  if (typeof envOrKey === 'string') {
    serviceAccountKey = envOrKey
  } else if (envOrKey?.GCP_SERVICE_ACCOUNT_KEY) {
    serviceAccountKey = envOrKey.GCP_SERVICE_ACCOUNT_KEY
  }

  if (!serviceAccountKey) {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY not found')
  }

  // 서비스 계정 키 파싱
  const credentials = JSON.parse(serviceAccountKey)
  
  // JWT 토큰 생성
  const jwt = await createJWT(credentials)
  
  // Access Token 획득
  return await getAccessToken(jwt)
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

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  const base64UrlEncode = (obj: any) => {
    return btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)
  
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const privateKey = credentials.private_key.replace(/\\n/g, '\n')
  
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
