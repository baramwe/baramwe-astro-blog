package com.baramwe.golfscore

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar

/** openDetail(url) 로 열리는 상세 화면. 오른쪽에서 밀려 들어오고, 뒤로 가면 오른쪽으로 빠진다. */
class DetailActivity : AppCompatActivity(), WebScreen.Callbacks {

    private lateinit var screen: WebScreen
    private lateinit var toolbar: MaterialToolbar
    private var returningFromDetail = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_detail)
        if (Build.VERSION.SDK_INT >= 34) {
            overrideActivityTransition(Activity.OVERRIDE_TRANSITION_CLOSE, R.anim.slide_in_left, R.anim.slide_out_right)
        }

        toolbar = findViewById(R.id.toolbar)
        toolbar.setNavigationOnClickListener { close() }

        val url = intent.getStringExtra(EXTRA_URL) ?: Routes.HOME
        val container = findViewById<FrameLayout>(R.id.screen_container)
        val view = layoutInflater.inflate(R.layout.view_web_screen, container, false)
        container.addView(view)
        screen = WebScreen(this, view, url, this)
        screen.load()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = close()
        })
    }

    private fun close() {
        finish()
        if (Build.VERSION.SDK_INT < 34) {
            @Suppress("DEPRECATION")
            overridePendingTransition(R.anim.slide_in_left, R.anim.slide_out_right)
        }
    }

    override fun onTitle(title: String) {
        toolbar.title = title
    }

    override fun onOpenDetail(url: String) {
        returningFromDetail = true
        Routes.openDetail(this, url)
    }

    /** 홈 링크: 상세 화면들을 모두 닫고 메인 홈 탭으로 (새 상세로 홈을 띄우지 않는다) */
    override fun onGoHome() {
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_GO_HOME, true),
        )
        if (Build.VERSION.SDK_INT < 34) {
            @Suppress("DEPRECATION")
            overridePendingTransition(R.anim.slide_in_left, R.anim.slide_out_right)
        }
    }

    override fun onRestart() {
        super.onRestart()
        // 더 깊은 상세(예: 수정 화면)에서 돌아오면 바뀐 내용을 다시 받는다
        if (returningFromDetail) {
            returningFromDetail = false
            screen.reload(quiet = true)
        }
    }

    override fun onResume() {
        super.onResume()
        screen.onResume()
    }

    override fun onPause() {
        screen.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        screen.destroy()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
    }
}
