# GCP API 로컬 개발환경 설정 가이드 🛠️

## 📋 설정 완료 상황

✅ **Cloudflare Workers 환경**: `GCP_SERVICE_ACCOUNT_KEY` 시크릿 설정 완료  
✅ **로컬 개발 환경**: `.dev.vars` 파일을 통한 환경변수 설정 완료  

---

## 🔧 로컬 개발 환경 사용법

### 1. 로컬 개발 서버 실행
```bash
# 개발 서버 시작
npm run build && npx wrangler dev --port 8888 --local

# 또는 간단히
npx wrangler dev
```

### 2. 환경변수 확인
서버 실행 시 다음과 같은 메시지가 나타나면 정상 설정:
```
Using vars defined in .dev.vars
Your Worker has access to the following bindings:
env.GCP_SERVICE_ACCOUNT_KEY ("(hidden)")      Environment Variable      local
```

### 3. API에서 GCP 사용 예시
```typescript
import type { APIRoute } from 'astro'

export const GET: APIRoute = async (context) => {
  try {
    // 환경변수에서 GCP 서비스 계정 키 가져오기
    let gcpKey: string | undefined

    // 로컬 환경
    if (typeof process !== 'undefined') {
      gcpKey = process.env.GCP_SERVICE_ACCOUNT_KEY
    }
    // Cloudflare Workers 환경
    else {
      const runtime = (context.locals as any)?.runtime
      gcpKey = runtime?.env?.GCP_SERVICE_ACCOUNT_KEY
    }

    if (!gcpKey) {
      throw new Error('GCP_SERVICE_ACCOUNT_KEY not found')
    }

    // JSON 파싱
    const credentials = JSON.parse(gcpKey)
    
    // Google Cloud SDK 사용
    // const auth = new google.auth.GoogleAuth({
    //   credentials: credentials,
    //   scopes: ['https://www.googleapis.com/auth/cloud-platform']
    // })

    return new Response(JSON.stringify({
      success: true,
      project_id: credentials.project_id
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
```

---

## 📁 파일 구조

```
프로젝트/
├── .dev.vars              # 로컬 개발용 환경변수 (git에서 제외됨)
├── .gitignore             # GCP 키 파일 보안 설정 포함
└── src/pages/api/
    └── your-api.ts        # GCP를 사용하는 API 파일
```

---

## 🔒 보안 주의사항

### ❌ 절대 하지 말 것:
- `.dev.vars` 파일을 git에 커밋하지 마세요
- GCP 서비스 계정 JSON 파일을 코드에 직접 포함하지 마세요
- private_key를 로그에 출력하지 마세요

### ✅ 보안 모범사례:
- 환경변수만 사용하여 인증 정보 관리
- `.gitignore`에 민감한 파일들 등록 완료
- 로컬과 프로덕션 환경 분리 완료

---

## 🚀 현재 설정된 GCP 정보

- **프로젝트 ID**: `joogatu`
- **서비스 계정**: `joogatu@joogatu.iam.gserviceaccount.com`
- **환경**: 로컬 개발 환경과 Cloudflare Workers 환경 모두 지원

---

## 🧪 테스트 완료

✅ 로컬 환경에서 `process.env`를 통해 환경변수 접근 성공  
✅ GCP 서비스 계정 키 JSON 파싱 및 검증 완료  
✅ Cloudflare Workers와 로컬 환경 간 호환성 확인 완료

이제 GCP API를 사용한 개발을 시작할 수 있습니다! 🎉
