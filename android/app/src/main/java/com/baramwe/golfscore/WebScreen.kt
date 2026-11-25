package com.baramwe.golfscore

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * 웹뷰 한 장 + 네이티브 스켈레톤 + 재시도 화면 + 당겨서 새로고침을 묶은 컨트롤러.
 * MainActivity 의 탭마다, DetailActivity 에 하나씩 쓴다. root 는 view_web_screen.xml 을 inflate 한 뷰.
 *
 * 흐름: load() → 웹뷰는 투명(alpha 0)인 채로 로드, 스켈레톤 표시
 *       → 웹이 Android.onRenderComplete() 호출 → 스켈레톤 숨기고 웹뷰 페이드인
 *       → 통신 실패면 브라우저 에러 화면 대신 네이티브 재시도 화면
 */
class WebScreen(
    private val context: Context,
    val root: View,
    private val initialUrl: String,
    private val callbacks: Callbacks,
) {
    interface Callbacks {
        /** 웹이 Android.openDetail(url) 호출 — 상세 화면으로 이동 */
        fun onOpenDetail(url: String)
        fun onTitle(title: String) {}
    }

    private val swipe: SwipeRefreshLayout = root.findViewById(R.id.swipe)
    val webView: WebView = root.findViewById(R.id.web)
    private val skeleton: View = root.findViewById(R.id.skeleton)
    private val errorView: View = root.findViewById(R.id.error)
    private val main = Handler(Looper.getMainLooper())
    private val baseHost = Uri.parse(BuildConfig.BASE_URL).host

    private var revealed = false
    private var failed = false
    private var loadedOnce = false
    private var pulse: ValueAnimator? = null
    private val fallbackReveal = Runnable { reveal() }

    init {
        setupWebView()
        swipe.setColorSchemeColors(ContextCompat.getColor(context, R.color.primary))
        swipe.setProgressBackgroundColorSchemeColor(ContextCompat.getColor(context, R.color.panel))
        // 웹뷰 스크롤이 맨 위(scrollY == 0)일 때만 당겨서 새로고침
        swipe.setOnChildScrollUpCallback { _, _ -> webView.scrollY > 0 || webView.alpha < 1f }
        swipe.setOnRefreshListener { reload(quiet = true) }
        errorView.findViewById<Button>(R.id.retry).setOnClickListener { retry() }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        // 디버그 빌드는 chrome://inspect 로 웹뷰를 들여다볼 수 있게
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.setBackgroundColor(ContextCompat.getColor(context, R.color.page))
        webView.alpha = 0f
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isLongClickable = false
        webView.setOnLongClickListener { true } // 롱프레스 텍스트 선택 메뉴 막기
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            userAgentString = "$userAgentString ${APP_UA_TOKEN}/${BuildConfig.VERSION_NAME}"
        }
        webView.addJavascriptInterface(Bridge(), "Android")
        webView.webViewClient = Client()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView, title: String?) {
                title?.let { callbacks.onTitle(it.substringBefore(" · ").trim()) }
            }
        }
    }

    /** 처음 로드 (스켈레톤부터) */
    fun load() {
        if (loadedOnce) return
        loadedOnce = true
        startLoading(webView.url ?: initialUrl, fresh = true)
    }

    /**
     * 새로고침. quiet 면 지금 화면을 그대로 둔 채 다시 받는다 (당겨서 새로고침·상세에서 돌아왔을 때).
     * 오프라인이면 재시도 화면.
     */
    fun reload(quiet: Boolean) {
        if (!loadedOnce) return load()
        if (!isOnline()) {
            showError()
            return
        }
        if (!quiet || failed) showSkeleton()
        failed = false
        revealed = false
        webView.reload()
    }

    /** 다른 주소로 이동 (로그인 후 탭 복귀 등) */
    fun navigate(url: String) {
        loadedOnce = true
        startLoading(url, fresh = true)
    }

    fun canGoBack() = webView.canGoBack()
    fun goBack() = webView.goBack()
    fun currentUrl(): String? = webView.url

    fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush()
    }

    fun onResume() = webView.onResume()

    fun destroy() {
        main.removeCallbacksAndMessages(null)
        pulse?.cancel()
        webView.removeJavascriptInterface("Android")
        webView.destroy()
    }

    private fun startLoading(url: String, fresh: Boolean) {
        if (!isOnline()) {
            showError()
            return
        }
        failed = false
        revealed = false
        if (fresh) showSkeleton()
        webView.loadUrl(url)
    }

    private fun retry() {
        errorView.visibility = View.GONE
        val url = webView.url
        if (url == null || url.startsWith("data:") || url == "about:blank") startLoading(initialUrl, fresh = true)
        else {
            if (!isOnline()) return showError()
            failed = false
            revealed = false
            showSkeleton()
            webView.reload()
        }
    }

    private fun showSkeleton() {
        errorView.visibility = View.GONE
        webView.animate().cancel()
        webView.alpha = 0f
        skeleton.visibility = View.VISIBLE
        skeleton.alpha = 1f
        if (pulse == null) {
            pulse = ObjectAnimator.ofFloat(skeleton, View.ALPHA, 1f, 0.45f).apply {
                duration = 750
                repeatMode = ValueAnimator.REVERSE
                repeatCount = ValueAnimator.INFINITE
            }
        }
        pulse?.start()
    }

    /** 웹 렌더 완료 → 스켈레톤 걷고 웹뷰 페이드인 */
    private fun reveal() {
        main.removeCallbacks(fallbackReveal)
        if (failed || revealed) {
            swipe.isRefreshing = false
            return
        }
        revealed = true
        swipe.isRefreshing = false
        pulse?.cancel()
        skeleton.animate().alpha(0f).setDuration(150).withEndAction { skeleton.visibility = View.GONE }.start()
        webView.animate().alpha(1f).setDuration(180).start()
    }

    private fun showError() {
        failed = true
        main.removeCallbacks(fallbackReveal)
        swipe.isRefreshing = false
        pulse?.cancel()
        skeleton.visibility = View.GONE
        webView.animate().cancel()
        webView.alpha = 0f
        errorView.visibility = View.VISIBLE
    }

    private fun isOnline(): Boolean {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun isOurs(url: String?): Boolean = url != null && Uri.parse(url).host == baseHost

    private fun openExternal(url: String) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
        }
    }

    /** window.Android — 웹(src/lib/golf/app.ts, GolfLayout.astro)과 짝 */
    private inner class Bridge {
        @JavascriptInterface
        fun onRenderComplete() {
            main.post { if (isOurs(webView.url)) reveal() }
        }

        @JavascriptInterface
        fun openDetail(url: String) {
            main.post {
                if (!isOurs(webView.url)) return@post // 우리 사이트가 띄운 페이지만 브릿지 사용
                if (isOurs(url)) callbacks.onOpenDetail(url) else openExternal(url)
            }
        }
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (isOurs(url)) return false
            openExternal(url) // 외부 링크는 브라우저로
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            main.removeCallbacks(fallbackReveal)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (failed) return
            val path = url?.let { Uri.parse(it).path } ?: ""
            val golfPage = path.startsWith("/private/golf")
            // 로그인 등 사이트 공용 페이지는 배경색이 없어(흰 바탕 전제) 다크 바탕 위에서 글자가 안 보인다
            view.setBackgroundColor(if (golfPage) ContextCompat.getColor(context, R.color.page) else android.graphics.Color.WHITE)
            if (!golfPage) {
                // 로그인 화면 등 브릿지 신호를 안 보내는 페이지는 로드 완료 시점에 보여준다
                reveal()
            } else if (!revealed) {
                // 스크립트 오류로 신호가 안 와도 스켈레톤에 갇히지 않게
                main.postDelayed(fallbackReveal, FALLBACK_REVEAL_MS)
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) {
                view.stopLoading()
                showError()
            }
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (request.isForMainFrame && response.statusCode >= 500) showError()
        }
    }

    companion object {
        const val APP_UA_TOKEN = "GolfScoreApp"
        private const val FALLBACK_REVEAL_MS = 4000L
    }
}
