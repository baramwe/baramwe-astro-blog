import React, { useState } from "react";
import clsx from "clsx";

const stories = [
  {
    title: "2025 삿포로 골프 대전, 개막!",
    content: (
      <>
        <p>일본 삿포로, 8인의 골프 괴짜들이 '짱팀'과 '조밥팀'으로 갈라져 명예(!)를 건 대격돌을 시작한다.</p>
        <p>누가 백돌이 행을 면하고, 누가 폭망할 것인가?</p>
        <ul>
          <li>참가자: 민, 코지, 딜런, 쭌, 라파엘, 홉, 블루와인, 탑숩</li>
        </ul>
        <p>티는 올랐다. 골프정신에 진심인 우리 8인은 오늘도 왜인지 유쾌하게 싸운다!</p>
      </>
    )
  },
  {
    title: "민, 코수염과 뼈아픈(?) 부상 투혼",
    content: (
      <>
        <p>민: 지난 대회 졸전을 만회하려고 억지로 연습하다 그만 갈비뼈가 금가버렸다.</p>
        <p>아무에게도 말 안 하고, 멋지게 기른 코수염을 쓰다듬으며 조용히 짱팀 형님들 '물어 뜯기' 준비에 돌입!</p>
        <p>그의 묵묵한 근성과 미소 뒤에는 사실 '헉헉' 숨 넘어가는 고통이 함께했다나, 뭐라나…</p>
        <p>마지막에, 과연 민은 형님들에게 통쾌한 한 방을 성공!</p>
      </>
    )
  },
  {
    title: "강력한 우승후보의 몰락과 백돌이 선고(코지 & 딜런)",
    content: (
      <>
        <p>코지: 안경 뒤에 가려진 냉정함, 오늘만큼은 온데간데 없다! 드라이버는 나무를 때리고, 볼은 뒤로 굴러가고...</p>
        <p>스코어카드는 백돌이 인증! 이 구역의 모범 백돌이 탄생~</p>
        <p>딜런: 전 대회 우승자라 자부했지만, 스웨덴힐CC의 억센 크로바 러프에 번번이 덫에 걸리고, 원색 반바지&벙거지 패션만 무사고 귀국!</p>
        <p>두 사람에게 오늘 대회는 그저 '망샷'의 연속이었다. 아쉽?</p>
      </>
    )
  },
  {
    title: "생크병의 전염과 귀국, 그리고 프로의 재활(?)",
    content: (
      <>
        <p>쭌: 기대를 한몸에 받았으나, '생크병'에 걸려 정신력이 무너지고, 조밥팀을 떠돌며 기약 없이 고국행 티켓을 끊었다.</p>
        <p>라파엘: 지난 대회 생크로 신음했으나, 이번엔 훌륭히 극복…?</p>
        <p>하지만 드라이버가 배신! (짤순이 짤순이~) 그래도 명랑함과 썬크림 빛나는 창백미는 변함없다.</p>
        <p>그래, 긍정의 힘이다! (비타민 한 접시 추가)</p>
      </>
    )
  },
  {
    title: "최대 우승후보의 폭주! 그리고 이미지만으로의 한계",
    content: (
      <>
        <p>홉: 장신(參加자 중 최고 키!), 호리호리한 체형. 오늘따라 아이언샷과 드라이버가 미쳐 돌아간다!</p>
        <p>러프도 그린도 모두 그에겐 별 무섭지 않은 놀이터.</p>
        <p>모두의 탄식 속에 압도적 실력으로 우승! 오늘의 챔피언이여 만세~</p>
        <p>블루와인: '골프 연습? 이미지는 마음에서 완성되는 것!' 하지만 샷포로 골프장 거친 필드 앞에선 이미지 한 방으론 부족했나...</p>
        <p>덩치와 근육, 그리고 이미지 트레이닝이 남았다...!</p>
      </>
    )
  },
  {
    title: "골프 꿈나무의 희망찬 도전과 마지막 한 컷!",
    content: (
      <>
        <p>탑숩: 이번만은 좋은 컨디션! 어깨 턴의 달인, 벙거지 모자는 행운의 상징!</p>
        <p>뛰어난 가능성으로 상위권 굳히기 성공, 내년에 더 무서워질 이 남자!</p>
        <p>마지막, 짱팀과 조밥팀은 뜨거운 악수를 나누며 삿포로 대전은 유쾌하게 마무리됐다.</p>
        <p>오늘 결과가 뭐든, 우린 골프에 진심이니까! 내년에 또 만나자, 백돌이들도!⛳</p>
      </>
    )
  }
];

export default function StoryBook() {
  const [page, setPage] = useState(0);

  const handlePrev = () => setPage(p => (p > 0 ? p - 1 : p));
  const handleNext = () => setPage(p => (p < stories.length - 1 ? p + 1 : p));

  return (
    <div className="storybook-container">
      <div className={clsx("storybook-page", "fade-in")}>
        <h4>{stories[page].title}</h4>
        <div>{stories[page].content}</div>
      </div>
      <div className="storybook-controls">
        <button onClick={handlePrev} disabled={page === 0}>← 이전</button>
        <span>{page + 1} / {stories.length}</span>
        <button onClick={handleNext} disabled={page === stories.length - 1}>다음 →</button>
      </div>
      <style>{`
        .storybook-container {
          margin:auto;
          max-width:600px;
          background:#fffef6;
          border-radius:18px;
          box-shadow:0 0 12px #ccc;
          padding:40px 30px 20px 30px;
          min-height:440px;
        }
        .storybook-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 28px;
        }
        .storybook-page {
          transition: all .5s cubic-bezier(.8, -0.16, .4, 1.2);
          min-height: 340px;
        }
        .fade-in {
          animation: fadeIn .4s;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(12%);}
          to   { opacity: 1; transform: translateX(0);}
        }
        button {
          background: #d9f99d;
          border: none;
          border-radius: 8px;
          padding: 8px 22px;
          font-weight: bold;
          font-size: 18px;
          color: #23380c;
          transition: background .2s;
        }
        button[disabled] {
          background:#eaeaea;
          color:#aaa;
        }
      `}</style>
    </div>
  );
}
