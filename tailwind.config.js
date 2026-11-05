// 색은 모두 src/index.css 의 변수(탭별 테마)를 가리킨다.
// 예) bg-surface, text-ink-muted, border-line, text-accent, hover:bg-accent/10
// 같은 클래스 이름이 탭에 따라 다른 색이 되므로, 색을 바꾸려면 index.css 의 해당 탭 블록만 고치면 된다.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // 글꼴은 index.html 에서 불러온다. Space Mono 에는 한글이 없으므로 한글은 Pretendard 로 이어서 그리게 한다.
      fontFamily: {
        sans: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "Roboto", "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "sans-serif"],
        mono: ['"Space Mono"', "Pretendard", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "monospace"],
      },
      colors: {
        page: token("page"),             // 페이지 배경
        well: token("well"),             // 카드 안쪽에 푹 들어간 면 (입력칸, 표 머리글)
        "well-2": token("well-2"),
        surface: token("surface"),       // 카드·패널
        raised: token("raised"),         // 올라온 면 / 호버 면
        paper: token("paper"),           // 밝은 종이색 (입력칸 등)
        line: token("line"),             // 기본 테두리
        "line-strong": token("line-strong"),
        "line-hover": token("line-hover"),
        ink: token("ink"),               // 본문 글자
        "ink-strong": token("ink-strong"),
        "ink-muted": token("ink-muted"),
        "ink-faint": token("ink-faint"),
        "ink-ghost": token("ink-ghost"), // 가장 흐린 글자 (빈 칸 표시 등)
        nav: token("nav"),               // 헤더 탭 글자
        "nav-active": token("nav-active"),
        accent: token("accent"),         // 탭의 포인트 색
        "accent-strong": token("accent-strong"),
        "accent-ink": token("accent-ink"), // 포인트 색 면 위에 올리는 글자색
        ok: token("ok"),
        "ok-strong": token("ok-strong"),
        warn: token("warn"),
        danger: token("danger"),
        "danger-soft": token("danger-soft"),
        info: token("info"),
        "info-soft": token("info-soft"),
      },
      // 모서리 둥글기 단계. 카드 > 패널 > 입력/작은 버튼
      borderRadius: {
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        card: "1.5rem",
        panel: "1rem",
        field: "0.75rem",
        // 탭의 분위기에 따라 달라지는 값 (교무실·수업은 각지게, 학급·업무는 둥글게). index.css 참고
        dialog: "var(--r-dialog)",
        control: "var(--r-control)",
      },
      // 헤더 "내 학급" 명찰이 마우스를 올리면 살랑 흔들린다 (Header.jsx: group-hover:animate-swing)
      keyframes: {
        swing: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(10deg)" },
          "75%": { transform: "rotate(-10deg)" },
        },
      },
      animation: {
        swing: "swing 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}
