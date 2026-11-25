package com.baramwe.golfscore

import android.app.Activity
import android.content.Intent
import android.os.Build

/** 웹 경로 모음 — src/pages/private/golf/score 와 맞춘다 */
object Routes {
    private val BASE = "${BuildConfig.BASE_URL}/private/golf/score"
    val HOME = BASE
    val FRIENDS = "$BASE/friends"
    val RANKING = "$BASE/ranking"
    val SEARCH = "$BASE/search"
    val NEW_ROUND = "$BASE/rounds/new"
    val CLUBS = "$BASE/clubs"
    val MANAGE = "$BASE/manage"

    /** 상세 화면을 오른쪽에서 밀어 넣으며 연다 */
    fun openDetail(from: Activity, url: String) {
        from.startActivity(Intent(from, DetailActivity::class.java).putExtra(DetailActivity.EXTRA_URL, url))
        if (Build.VERSION.SDK_INT >= 34) {
            from.overrideActivityTransition(Activity.OVERRIDE_TRANSITION_OPEN, R.anim.slide_in_right, R.anim.slide_out_left)
        } else {
            @Suppress("DEPRECATION")
            from.overridePendingTransition(R.anim.slide_in_right, R.anim.slide_out_left)
        }
    }
}
