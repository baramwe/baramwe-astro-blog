---
name: login_check
description: Cloudflare Wrangler 로그인 사용자를 확인합니다. `wrangler whoami` 결과를 보여준 뒤, 로그아웃하고 새로운 사용자로 로그인할지 사용자에게 묻습니다. '로그인 확인', 'login_check', 'wrangler 사용자 확인', '클플 로그인 확인' 등의 요청에 사용합니다.
---

# login_check

Cloudflare Wrangler 현재 인증 사용자를 확인하고, 필요 시 사용자 변경 흐름을 안내한다.

## 실행 절차

### 1. 현재 사용자 확인

다음 명령을 실행하여 결과를 사용자에게 그대로 보여준다.

```bash
npx wrangler whoami
```

결과에는 로그인 이메일, Account Name, Account ID, 토큰 권한 스코프가 포함된다. 이 정보를 요약 없이 핵심(이메일 + Account ID)만 한 줄로 정리해 사용자에게 전달한다.

만약 출력이 "You are not authenticated" 류라면 2단계 질문 없이 바로 로그인 안내로 넘어간다.

### 2. 사용자 변경 여부 질문

`AskUserQuestion` 도구를 사용해 다음과 같이 묻는다.

- 질문: "로그아웃하고 새로운 사용자로 로그인 할까요?"
- header: "로그인 변경"
- 옵션:
  - "예, 변경" — 로그아웃 후 새 사용자 로그인 안내
  - "아니오, 유지" — 현재 세션 유지

### 3. 응답 처리

**"예, 변경" 선택 시:**

```bash
npx wrangler logout
```

로그아웃 결과를 보여준 뒤, 다음 안내문을 출력한다.

> 새 계정으로 로그인하려면 프롬프트에 다음을 입력하세요 (브라우저 인증 필요):
>
> ```
> ! npx wrangler login
> ```

`!` 프리픽스 이유: `wrangler login`은 브라우저 OAuth를 요구하는 인터랙티브 명령이라 일반 Bash 도구 호출로는 완결되지 않는다. 사용자가 직접 셸 명령으로 실행해야 인증 콜백을 받을 수 있다.

**"아니오, 유지" 선택 시:**

추가 동작 없이 종료한다.

## 주의사항

- `wrangler logout`은 인증 토큰을 즉시 폐기한다. 진행 중인 배포·`wrangler tail` 등이 있을 가능성이 있으면 먼저 사용자에게 확인한다.
- 이 스킬은 Cloudflare Workers를 사용하는 프로젝트(bluewine, freeroad)에서만 의미가 있다.
- `wrangler` 버전 업데이트 알림이 함께 떠도 무시한다 — 업데이트는 별개 작업이며 사용자가 명시적으로 요청할 때만 진행한다.
