// 단원별 수업 자료실의 계산 (화면·Firebase 와 분리해서 테스트한다).
//   lessons/{id}  { title, summary, lessonNum, unit: "unit1".."unit5", isVisible, createdAt }
//   isVisible === false 면 비공개: 로그인하지 않은 방문자(학생)에게 보이지 않는다.

export const UNITS = [
  { id: "all", label: "전체 자료" },
  { id: "unit1", label: "1단원 시스템" },
  { id: "unit2", label: "2단원 데이터" },
  { id: "unit3", label: "3단원 알고리즘" },
  { id: "unit4", label: "4단원 인공지능" },
  { id: "unit5", label: "5단원 디지털 문화" },
];

/** 검색어 → 단어 목록 (띄어쓰기로 나누고, 대소문자는 가리지 않는다) */
export function searchTerms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 제목에 검색어의 모든 단어가 들어 있는지. "인공지능 윤리" → "인공지능의 윤리적 문제" 도 찾는다 */
export function titleMatches(title, terms) {
  const t = String(title || "").toLowerCase();
  return terms.every((w) => t.includes(w));
}

/**
 * 자료실에 보여 줄 자료.
 *   unit: "all" 이거나 단원 id
 *   query: 제목 검색어 (빈 칸이면 검색 안 함)
 *   showHidden: 비공개 자료도 보일지 (교사)
 */
export function filterLessons(lessons, { unit = "all", query = "", showHidden = false } = {}) {
  const terms = searchTerms(query);
  return lessons.filter(
    (l) =>
      (showHidden || l.isVisible !== false) &&
      (unit === "all" || l.unit === unit) &&
      (terms.length === 0 || titleMatches(l.title, terms))
  );
}

/**
 * 제목을 검색어가 들어간 곳과 아닌 곳으로 나눈다 (검색어를 굵게 보여 주기 위해).
 * 반환: [{ text, hit }]
 */
export function highlightParts(title, terms) {
  const text = String(title || "");
  if (terms.length === 0) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  for (const w of terms) {
    for (let i = lower.indexOf(w); i !== -1; i = lower.indexOf(w, i + 1)) {
      for (let k = i; k < i + w.length; k++) marks[k] = true;
    }
  }
  const parts = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: marks[i] });
  }
  return parts;
}

/** 공개된 자료 중 최근 것 limit 개 (lessons 는 최근 것이 먼저 오도록 정렬돼 있다) */
export function recentLessons(lessons, limit = 4) {
  return lessons.filter((l) => l.isVisible !== false).slice(0, limit);
}

export function unitLabel(unitId) {
  return UNITS.find((u) => u.id === unitId)?.label || "";
}
