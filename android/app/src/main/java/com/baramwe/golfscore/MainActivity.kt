package com.baramwe.golfscore

import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.content.res.AppCompatResources
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        // 오버플로(⋮)를 웹 헤더처럼 톱니바퀴로
        toolbar.overflowIcon = AppCompatResources.getDrawable(this, R.drawable.ic_settings)?.mutate()?.apply {
            setTint(getColor(R.color.subdued))
        }
        toolbar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_search -> Routes.SEARCH
                R.id.action_new_round -> Routes.NEW_ROUND
                R.id.action_clubs -> Routes.CLUBS
                R.id.action_manage -> Routes.MANAGE
                else -> null
            }?.let { onOpenDetail(it); true } ?: false
        }

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

        tabs.forEach { it.screen.load() } // 3장 모두 미리 로드
        select(0)

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

    private fun select(index: Int) {
        if (index < 0) return
        current = index
        tabs.forEachIndexed { i, t -> t.screen.root.visibility = if (i == index) View.VISIBLE else View.INVISIBLE }
        val tab = tabs[index]
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
        tabs.forEach { it.screen.destroy() }
        super.onDestroy()
    }
}
