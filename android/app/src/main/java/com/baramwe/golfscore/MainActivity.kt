package com.baramwe.golfscore

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.PopupWindow
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.bottomnavigation.BottomNavigationView

/**
 * 상단 툴바·하단 탭은 네이티브, 각 탭 본문은 웹뷰.
 * 탭 웹뷰 3장을 앱 시작 때 미리(투명하게) 로드해 두어 탭 전환이 즉시 된다.
 */
class MainActivity : AppCompatActivity(), WebScreen.Callbacks {

    private data class Tab(val menuId: Int, val url: String, val screen: WebScreen)

    private lateinit var tabs: List<Tab>
    private lateinit var bottomNav: BottomNavigationView
    private var current = 0
    /** 상세 화면에 다녀오면 데이터가 바뀌었을 수 있어 다시 받아야 하는 탭 */
    private val stale = mutableSetOf<Int>()
    private var returningFromDetail = false
    private val main = Handler(Looper.getMainLooper())
    private val preloadOthers = Runnable { tabs.forEach { it.screen.load() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_search -> onOpenDetail(Routes.SEARCH)
                R.id.action_settings -> showSettingsMenu(toolbar.findViewById(R.id.action_settings) ?: toolbar)
                else -> return@setOnMenuItemClickListener false
            }
            true
        }
        // 로고를 누르면 홈 탭으로
        findViewById<View>(R.id.logo).setOnClickListener { onGoHome() }

        val container = findViewById<FrameLayout>(R.id.tab_container)
        tabs = listOf(
            R.id.tab_home to Routes.HOME,
            R.id.tab_friends to Routes.FRIENDS,
            R.id.tab_ranking to Routes.RANKING,
        ).map { (id, url) ->
            val view = layoutInflater.inflate(R.layout.view_web_screen, container, false)
            container.addView(view)
            Tab(id, url, WebScreen(this, view, url, this))
        }

        bottomNav = findViewById(R.id.bottom_nav)
        bottomNav.setOnItemSelectedListener { item ->
            select(tabs.indexOfFirst { it.menuId == item.itemId })
            true
        }
        // 같은 탭을 다시 누르면 맨 위로
        bottomNav.setOnItemReselectedListener { tabs[current].screen.webView.pageUp(true) }

        // 홈을 먼저 받고, 홈이 뜬 뒤에 나머지 탭을 미리 받는다 (시작 때 네트워크·CPU 를 홈이 독차지)
        select(0)
        main.postDelayed(preloadOthers, PRELOAD_FALLBACK_MS) // 홈이 실패·지연돼도 결국 받도록

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val screen = tabs[current].screen
                when {
                    screen.canGoBack() -> screen.goBack() // 탭 안의 정렬·더보기 이동 되돌리기
                    current != 0 -> bottomNav.selectedItemId = tabs[0].menuId
                    else -> finish()
                }
            }
        })
    }

    /** 톱니 메뉴: 기본 오버플로 팝업은 최소 폭이 넓어서, 텍스트 폭에 맞춘 팝업을 직접 띄운다 */
    private fun showSettingsMenu(anchor: View) {
        val content = layoutInflater.inflate(R.layout.view_menu_popup, null)
        val popup = PopupWindow(content, ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, true).apply {
            elevation = 8 * resources.displayMetrics.density
            animationStyle = android.R.style.Animation_Dialog
        }
        mapOf(
            R.id.action_new_round to Routes.NEW_ROUND,
            R.id.action_clubs to Routes.CLUBS,
            R.id.action_manage to Routes.MANAGE,
        ).forEach { (id, url) ->
            content.findViewById<View>(id).setOnClickListener {
                popup.dismiss()
                onOpenDetail(url)
            }
        }
        // 톱니 아래, 화면 오른쪽 끝에서 8dp 띄워서
        content.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
        val gap = (8 * resources.displayMetrics.density).toInt()
        popup.showAsDropDown(anchor, anchor.width - content.measuredWidth - gap, 0)
    }

    private fun select(index: Int) {
        if (index < 0) return
        current = index
        tabs.forEachIndexed { i, t -> t.screen.root.visibility = if (i == index) View.VISIBLE else View.INVISIBLE }
        val tab = tabs[index]
        tab.screen.load() // 아직 안 받은 탭이면 지금 받기 (이미 받았으면 무시)
        val url = tab.screen.currentUrl()
        when {
            // 다른 탭에서 로그인했으면 로그인 화면에 머물던 탭은 원래 주소로
            url != null && url.contains("/auth/") -> tab.screen.navigate(tab.url)
            stale.remove(index) -> tab.screen.reload(quiet = true)
        }
    }

    override fun onOpenDetail(url: String) {
        returningFromDetail = true
        Routes.openDetail(this, url)
    }

    override fun onRevealed(screen: WebScreen) {
        if (screen === tabs[0].screen) {
            main.removeCallbacks(preloadOthers)
            preloadOthers.run()
        }
    }

    override fun onGoHome() {
        bottomNav.selectedItemId = tabs[0].menuId
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // 상세 화면에서 '홈'을 누르면 상세들을 닫고 여기로 온다
        if (intent.getBooleanExtra(EXTRA_GO_HOME, false)) onGoHome()
    }

    override fun onRestart() {
        super.onRestart()
        if (returningFromDetail) {
            returningFromDetail = false
            stale.addAll(tabs.indices.filter { it != current })
            tabs[current].screen.reload(quiet = true)
        }
    }

    override fun onResume() {
        super.onResume()
        tabs.forEach { it.screen.onResume() }
    }

    override fun onPause() {
        tabs.forEach { it.screen.onPause() }
        super.onPause()
    }

    override fun onDestroy() {
        main.removeCallbacks(preloadOthers)
        tabs.forEach { it.screen.destroy() }
        super.onDestroy()
    }

    companion object {
        const val EXTRA_GO_HOME = "go_home"
        private const val PRELOAD_FALLBACK_MS = 5000L
    }
}
