# 골프 스코어 안드로이드 앱 (개인 설치용)

`/private/golf/score` 를 감싼 하이브리드 앱. 상단 툴바·하단 탭·스켈레톤·재시도 화면은 네이티브, 본문은 WebView.

## 웹 쪽 연동 (src/)

- `src/lib/golf/app.ts` — User-Agent 에 `GolfScoreApp` 이 있거나 `?isApp=true` 면 앱 뷰
- `src/layouts/GolfLayout.astro` — 앱 뷰면 헤더·탭·바깥 여백 없이 본문만, 텍스트 선택·핀치 줌·스크롤바 끔
  - 렌더 완료(load + client:load 아일랜드 hydrate) 후 `Android.onRenderComplete()`
  - 다른 페이지로 가는 링크는 `Android.openDetail(url)` (같은 경로의 정렬·필터 링크는 그 자리에서)
- `src/pages/private/golf/score/search.astro` — 앱 상단 검색 버튼이 여는 검색 화면

## 빌드

`local.properties` (커밋 안 됨):

```
sdk.dir=/Users/<you>/Library/Android/sdk
golf.baseUrl=https://baramwe.com
```

```
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
```

## 폰에 설치

갤럭시 설정 → 휴대전화 정보 → 소프트웨어 정보 → 빌드번호 7번 탭 → 개발자 옵션 → USB 디버깅 켜고 USB 연결 후:

```
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

또는 APK 파일을 폰으로 옮겨 직접 설치 (출처를 알 수 없는 앱 허용 필요).

처음 실행하면 로그인 화면이 나온다 — 한 번 로그인하면 쿠키(30일)가 앱에 남는다.
