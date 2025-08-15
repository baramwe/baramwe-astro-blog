import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

// ===== 공통 유틸 =====
const STORAGE_KEY = "golf-mbti-v1";

const LIKERT = [
  { label: "전혀 아님", emoji: "🙅", value: 1 },
  { label: "아님", emoji: "🤔", value: 2 },
  { label: "보통", emoji: "😐", value: 3 },
  { label: "그런 편", emoji: "🙂", value: 4 },
  { label: "매우", emoji: "🙌", value: 5 },
];

const likertToScore = (v) => [null, -2, -1, 0, +1, +2][v];
const getParam = (k) => new URLSearchParams(window.location.search).get(k);
const setShareParam = (type) => {
  const url = new URL(window.location.href);
  url.searchParams.set("type", type);
  return url.toString();
};

function setOGMeta({ title, description, imageUrl }) {
  const ensure = (property, content) => {
    let m = document.querySelector(`meta[property="${property}"]`);
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("property", property);
      document.head.appendChild(m);
    }
    m.setAttribute("content", content);
  };
  ensure("og:type", "website");
  ensure("og:title", title);
  ensure("og:description", description);
  ensure("og:image", imageUrl);
  ensure("twitter:card", "summary_large_image");
  ensure("twitter:title", title);
  ensure("twitter:description", description);
  ensure("twitter:image", imageUrl);
}

async function generateOgImage({ type, title, subtitle }) {
  const w = 1200, h = 630;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0, "#e6fffb"); g.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#10b981"; ctx.beginPath(); ctx.arc(150,150,120,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#38bdf8"; ctx.beginPath(); ctx.arc(1000,520,160,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 80px Inter, system-ui"; ctx.fillText(`⛳️ ${type}`, 80, 210);
  ctx.font = "bold 54px Inter, system-ui"; ctx.fillText(title, 80, 300);
  ctx.font = "32px Inter, system-ui"; wrapText(ctx, subtitle, 80, 370, 1040, 44);
  ctx.fillStyle = "#0ea5e9"; ctx.fillRect(80, 540, 1040, 6);
  return await new Promise((resolve) => canvas.toBlob(b => resolve(URL.createObjectURL(b)), "image/png"));
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(" "); let line = "";
  words.forEach((w,i) => { const t = line + w + " "; if (ctx.measureText(t).width > maxW && i) { ctx.fillText(line, x, y); line = w + " "; y += lh; } else line = t; });
  ctx.fillText(line, x, y);
}

// ===== 질문 정의 (25문항) =====
const QUESTIONS = [
  { id: 1, axis: "EI", text: "라운드 시작 전, 팀원들과 금방 친해져 농담을 주고받는다 🤝" },
  { id: 2, axis: "JP", text: "전날 미리 티업 시간표, 이동 동선, 캐디피까지 꼼꼼히 체크한다 📋" },
  { id: 3, axis: "TF", text: "동반자의 OB에 진심으로 안타까워하고 위로한다 😢" },
  { id: 4, axis: "SN", text: "그린에서 읽을 때, 감(느낌)으로 라인을 결정하는 편이다 ✨" },
  { id: 5, axis: "TF", text: "상대가 벙커에서 모래에 채를 댄 걸 봤다면, 규정을 들어 조용히 지적한다 📏" },
  { id: 6, axis: "EI", text: "골프장에 오면 스태프, 캐디, 옆팀과도 자연스레 인사를 건넨다 👋" },
  { id: 7, axis: "JP", text: "비 예보가 있으면 레인기어, 여벌 장갑, 타월까지 완벽 준비한다 ☔️" },
  { id: 8, axis: "SN", text: "평소 샷은 루틴, 템포, 체크리스트처럼 구체적으로 관리한다 📝" },
  { id: 9, axis: "TF", text: "스코어카드 오기 하나도 용납 못 한다. 정확함이 최우선이다 🧮" },
  { id: 10, axis: "EI", text: "라운드 중간중간 동반자들과 수다에 에너지를 얻는다 💬" },
  { id: 11, axis: "SN", text: "새 장비를 고를 때 스펙보다 ‘필드에서 느낌’이 더 중요하다 🪄" },
  { id: 12, axis: "JP", text: "티샷 순서, 벌타 처리 등 진행 규칙을 깔끔하게 지키는 걸 선호한다 ⛳️" },
  { id: 13, axis: "TF", text: "동반자가 버디 퍼팅을 성공하면 크게 축하하고 기쁨을 공유한다 🎉" },
  { id: 14, axis: "EI", text: "연습장에서도 모르는 사람과 스윙 이야기를 나누며 금세 친해진다 🗣️" },
  { id: 15, axis: "SN", text: "거리 측정은 숫자보다 지형/바람/체감 난도를 더 중시한다 🌬️", reverse: true },
  { id: 16, axis: "JP", text: "캐디의 플레이 진행 요청에 민첩하게 응답해 페이스를 유지한다 ⏱️" },
  { id: 17, axis: "TF", text: "동반자가 규칙을 모르면 친절히 알려주며 상황을 원만히 정리한다 🫱🫲" },
  { id: 18, axis: "EI", text: "긴 퍼팅을 남기면 동반자들과 장난스러운 내기 제안을 한다 😏" },
  { id: 19, axis: "SN", text: "샷 전 체크 포인트(그립/얼라인/볼 위치 등)를 체계적으로 점검한다 ✅" },
  { id: 20, axis: "JP", text: "스코어가 망가져도 계획대로 플레이 흐름을 정리해 다음 홀을 준비한다 🧭" },
  { id: 21, axis: "TF", text: "팀 분위기를 해치는 반칙은 단호히 제지해야 한다고 생각한다 🚫" },
  { id: 22, axis: "SN", text: "핀 위치를 과감히 공략하는 모험을 즐긴다(리스크 감수) 🎯" },
  { id: 23, axis: "EI", text: "라운드 후 19홀(뒤풀이)에서 사람들과 어울리며 피드백을 나눈다 🍻" },
  { id: 24, axis: "JP", text: "필드에서도 연습 루틴처럼 일정한 템포와 순서를 유지한다 🔁" },
  { id: 25, axis: "TF", text: "팀원 실수엔 이해와 격려가 먼저다. 게임은 즐거워야 한다 💚", reverse: true },
];

// ===== 결과 맵핑 =====
const RESULT_MAP = {
  ESTJ: { title: "싱글 도전자(규칙파)", subtitle: "실력은 아직이지만 욕심과 추진력", desc: "진행과 규칙 러버. 가끔은 과감함도!" },
  ENTJ: { title: "골프 군기반장", subtitle: "공정·정의·승부욕", desc: "기획→회고 풀스택 리더." },
  ESFJ: { title: "팀 무드메이커", subtitle: "밝은 에너지 인싸", desc: "동반자 케어 1티어." },
  ENFJ: { title: "멘탈 코치", subtitle: "격려와 조언 리더형", desc: "분위기+실력 투트랙." },
  ISTJ: { title: "정밀 측정기", subtitle: "루틴/재현성 집착", desc: "성실함=실력." },
  INTJ: { title: "전략가", subtitle: "체스 두듯 매니지먼트", desc: "리스크/리턴 계산!" },
  ISFJ: { title: "따뜻한 버디요정", subtitle: "팀 케어 성실형", desc: "배려의 아이콘." },
  INFJ: { title: "영감 스윙러", subtitle: "감성과 통찰", desc: "감각 플레이 강점." },
  ESTP: { title: "죽어도 지른다", subtitle: "공격수", desc: "짜릿한 샷 메이커." },
  ENTP: { title: "아이디어 골퍼", subtitle: "새 장비/새 스윙 실험", desc: "발상의 전환." },
  ESFP: { title: "즐거운 백돌이", subtitle: "라운드는 파티", desc: "분위기 제조기." },
  ENFP: { title: "천재 백돌이", subtitle: "감각 과다 루틴 실종", desc: "영감 폭발형." },
  ISTP: { title: "스윙 공돌이", subtitle: "메커니즘 분석", desc: "문제해결 빠름." },
  INTP: { title: "데이터 브레이커", subtitle: "샷 트래킹 분석가", desc: "이론 최강." },
  ISFP: { title: "감성 페어웨이", subtitle: "풍경/바람/기분", desc: "아티스트." },
  INFP: { title: "꿈꾸는 퍼터", subtitle: "어프로치에 스토리", desc: "미학적 골퍼." },
};

export default function GolfMbtiApp() {
  const [answers, setAnswers] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  });
  const [page, setPage] = useState(0);
  const [sharedType, setSharedType] = useState(() => getParam("type"));
  const [ogUrl, setOgUrl] = useState("");

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(answers)); }, [answers]);

  const total = QUESTIONS.length; const pageSize = 5; const maxPage = Math.ceil(total / pageSize) - 1;
  const pageQuestions = useMemo(() => QUESTIONS.slice(page * pageSize, page * pageSize + pageSize), [page]);
  const progress = Math.round((Object.keys(answers).length / total) * 100);
  const setAnswer = (id, value) => setAnswers((p) => ({ ...p, [id]: value }));
  const canNext = pageQuestions.every((q) => answers[q.id]);

  const reset = () => { localStorage.removeItem(STORAGE_KEY); setAnswers({}); setPage(0); setSharedType(null); };

  const result = useMemo(() => {
    if (sharedType) return { type: sharedType, axes: { EI:0,SN:0,TF:0,JP:0 }, shared:true };
    if (Object.keys(answers).length !== total) return null;
    const axes = { EI:0, SN:0, TF:0, JP:0 };
    QUESTIONS.forEach((q) => { const v = answers[q.id]; if (!v) return; let s = likertToScore(v); if (q.reverse) s = -s; axes[q.axis] += s; });
    const type = [axes.EI>=0?"E":"I", axes.SN>=0?"S":"N", axes.TF>=0?"T":"F", axes.JP>=0?"J":"P"].join("");
    return { type, axes };
  }, [answers, sharedType]);

  useEffect(() => {
    if (!result) return;
    const meta = RESULT_MAP[result.type] || { title: "골프 MBTI", subtitle: "나의 라운드 성향은?" };
    (async () => {
      const img = await generateOgImage({ type: result.type, title: meta.title, subtitle: meta.subtitle });
      setOgUrl(img);
      setOGMeta({ title: `골프 MBTI - ${result.type} | ${meta.title}`, description: meta.subtitle, imageUrl: img });
    })();
  }, [result]);

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-emerald-50 to-sky-50 text-slate-800" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10" style={{ width: '100%', maxWidth: '768px' }}>
        <header className="mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">⛳️ 골프 MBTI 테스트</h1>
          <p className="text-sm sm:text-base mt-2 text-slate-600">5문항씩 답하고 다음으로 넘어가세요. 진행 상황은 자동 저장됩니다.</p>
          <div className="w-full h-3 bg-white/60 rounded-xl mt-4 shadow-inner"><div className="h-3 rounded-xl bg-emerald-400 transition-all" style={{ width: `${progress}%` }} /></div>
          <div className="mt-2 text-xs text-slate-500">진행률 {progress}%</div>
        </header>

        {!result ? (
          <section className="space-y-4">
            <div className="grid gap-6" style={{ gap: '1.5rem' }}>
              {pageQuestions.map((q) => (
                <QuestionCard key={q.id} q={q} value={answers[q.id] || 0} onChange={(v) => setAnswer(q.id, v)} />
              ))}
            </div>
            <div className="grid grid-cols-3 items-center gap-3 pt-2 whitespace-nowrap" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
              <button className="justify-self-start shrink-0 px-4 py-2 rounded-2xl bg-white shadow hover:shadow-md disabled:opacity-40" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page===0} style={{ justifySelf: 'start' }}>◀ 이전</button>
              <div className="justify-self-center text-sm text-slate-500" style={{ justifySelf: 'center' }}>{page + 1} / {maxPage + 1}</div>
              {page !== maxPage ? (
                <button className="justify-self-end shrink-0 px-4 py-2 rounded-2xl bg-emerald-500 text-white shadow hover:shadow-md disabled:opacity-40" onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={!canNext} style={{ justifySelf: 'end' }}>다음 ▶</button>
              ) : (
                <button className="justify-self-end shrink-0 px-4 py-2 rounded-2xl bg-emerald-600 text-white shadow hover:shadow-md disabled:opacity-40" onClick={() => { if (canNext) window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={!canNext} style={{ justifySelf: 'end' }}>결과 보기 🎯</button>
              )}
            </div>
            <div className="pt-4 flex gap-3 justify-end"><button className="px-3 py-2 rounded-xl bg-white shadow hover:shadow-md" onClick={reset}>초기화</button></div>
          </section>
        ) : (
          <ResultView result={result} reset={reset} ogUrl={ogUrl} onShare={() => {
            const url = setShareParam(result.type);
            navigator.clipboard?.writeText(url);
            alert("링크를 복사했어요! 결과 페이지를 공유해보세요.");
          }} />
        )}
      </div>
    </div>
  );
}

function QuestionCard({ q, value, onChange }) {
  return (
    <div className="rounded-2xl p-4 sm:p-5 bg-white shadow-sm hover:shadow transition">
      <div className="flex items-start gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="text-lg sm:text-xl font-semibold bg-emerald-100 text-emerald-800 rounded-lg px-2 py-1 w-10 text-center" style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', minWidth: '2.5rem' }}>{q.id}</span>
        <p className="text-sm sm:text-base leading-relaxed" style={{ margin: 0 }}>{q.text}</p>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-3 sm:gap-4" style={{ columnGap: '1rem', rowGap: '0.75rem' }}>
        {LIKERT.map((opt) => (
          <button key={opt.value} onClick={() => onChange(opt.value)} className={clsx("rounded-xl px-2 py-2 sm:px-3 sm:py-3 border text-xs sm:text-sm", value === opt.value ? "bg-emerald-500 text-white border-emerald-600 shadow" : "bg-white hover:bg-emerald-50 border-slate-200")} aria-pressed={value === opt.value}>
            <div className="inline-flex items-center gap-2" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              <span className="text-lg sm:text-xl">{opt.emoji}</span>
              <span>{opt.label}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultView({ result, reset, ogUrl, onShare }) {
  const { type, axes } = result;
  const meta = RESULT_MAP[type] || { title: "골프 MBTI", subtitle: "나의 라운드 성향은?", desc: "" };
  const bars = [
    { k: "EI", left: "I", right: "E", v: axes.EI },
    { k: "SN", left: "N", right: "S", v: axes.SN },
    { k: "TF", left: "F", right: "T", v: axes.TF },
    { k: "JP", left: "P", right: "J", v: axes.JP },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-3xl p-6 bg-white shadow">
        <div className="text-sm text-slate-500">당신의 골프 MBTI</div>
        <div className="mt-1 text-4xl sm:text-5xl font-extrabold tracking-tight">{type}</div>
        <div className="mt-3 text-xl sm:text-2xl font-semibold">{meta.title}</div>
        <div className="text-slate-600">{meta.subtitle}</div>
        <p className="mt-3 text-slate-700 leading-relaxed">{meta.desc}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="px-4 py-2 rounded-2xl bg-emerald-600 text-white shadow hover:shadow-md" onClick={onShare}>결과 링크 복사 🔗</button>
          {ogUrl && <a className="px-4 py-2 rounded-2xl bg-white border border-slate-200 shadow hover:shadow-md" href={ogUrl} download={`golf-mbti-${type}.png`}>썸네일 다운로드 🖼️</a>}
        </div>
        {ogUrl && (
          <div className="mt-4"><div className="text-sm text-slate-500 mb-1">미리보기(OG 썸네일)</div><img src={ogUrl} alt="OG Thumbnail" className="w-full rounded-xl border" /></div>
        )}
      </div>
      <div className="grid gap-3">{bars.map((b) => (<AxisBar key={b.k} {...b} />))}</div>
      <div className="flex flex-wrap gap-3 justify-end">
        <button className="px-4 py-2 rounded-2xl bg-white shadow hover:shadow-md" onClick={() => { navigator.clipboard?.writeText(type + " - " + meta.title + "\n" + meta.subtitle + "\n" + meta.desc); alert("결과 텍스트를 복사했어요!"); }}>결과 복사 📋</button>
        <button className="px-4 py-2 rounded-2xl bg-emerald-600 text-white shadow hover:shadow-md" onClick={reset}>다시 하기 🔄</button>
      </div>
    </div>
  );
}

function AxisBar({ left, right, v }) {
  const pct = Math.max(0, Math.min(100, Math.round(((v + 20) / 40) * 100)));
  return (
    <div className="bg-white rounded-2xl p-4 shadow">
      <div className="flex items-center justify-between text-sm text-slate-600"><span>{left}</span><span>{right}</span></div>
      <div className="mt-2 h-3 rounded-xl bg-slate-100 overflow-hidden"><div className="h-3 bg-emerald-500" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}