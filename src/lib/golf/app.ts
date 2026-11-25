// 안드로이드 하이브리드 앱(android/) 연동.
// 앱 WebView 는 User-Agent 끝에 APP_UA_TOKEN 을 붙인다. 브라우저에서 확인할 땐 ?isApp=true.
export const APP_UA_TOKEN = 'GolfScoreApp'

export function isGolfApp(request: Request, url: URL): boolean {
  if (url.searchParams.get('isApp') === 'true') return true
  return (request.headers.get('user-agent') ?? '').includes(APP_UA_TOKEN)
}

/** 앱 WebView 에 주입되는 JS 브릿지 (android/…/WebScreen.kt 의 Bridge 와 짝) */
interface AndroidBridge {
  onRenderComplete(): void
  openDetail(url: string): void
}

const bridge = (): AndroidBridge | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { Android?: AndroidBridge }).Android

/** 상세 화면으로 이동: 앱이면 네이티브 DetailActivity, 아니면 일반 이동 */
export function openDetail(href: string) {
  const abs = new URL(href, location.href).href
  const b = bridge()
  if (b) b.openDetail(abs)
  else location.href = abs
}
