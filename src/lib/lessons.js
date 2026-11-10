// 단원별 수업 자료실의 계산 (화면·Firebase 와 분리해서 테스트한다).
//   lessons/{id}  { title, summary, content(HTML 본문), lessonNum, unit: "unit1".."unit5", isVisible, createdAt }
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

// 줄을 나누는 태그는 띄어쓰기로, 글자 꾸밈 태그(<strong> 등)는 그냥 지운다 ("<b>디</b>버깅" → "디버깅")
const BLOCK_TAG = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|thead|tbody|blockquote|pre|img|hr|iframe|figure)\b[^>]*>/gi;
const ENTITIES = { nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

function decodeEntity(match, name) {
  if (name[0] === "#") {
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }
  return ENTITIES[name.toLowerCase()] ?? match;
}

/** 자료 본문(HTML) → 글자만. 그림(base64 포함)과 태그는 빼고, 띄어쓰기는 하나로 줄인다 */
export function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(BLOCK_TAG, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();
}

// 본문이 그림 때문에 수백 KB 라서, 자료마다 글자로 바꾼 결과를 한 번만 계산해 둔다.
// 자료가 새로 읽히면(onSnapshot) 새 객체가 오므로 예전 결과는 저절로 버려진다.
const textCache = new WeakMap();

/** 내용 검색에 쓰는 글자: 요약 + 본문 */
export function lessonBodyText(lesson) {
  if (textCache.has(lesson)) return textCache.get(lesson);
  const text = [String(lesson.summary || "").trim(), htmlToText(lesson.content)].filter(Boolean).join(" ");
  textCache.set(lesson, text);
  return text;
}

function countOccurrences(lowerText, w) {
  let n = 0;
  for (let i = lowerText.indexOf(w); i !== -1; i = lowerText.indexOf(w, i + w.length)) n++;
  return n;
}

/**
 * 찾은 단어 앞뒤를 잘라 한 줄로 (카드에서 요약 대신 보여 준다).
 * 단어 중간에서 자르지 않도록 띄어쓰기에 맞춘다.
 */
export function makeSnippet(text, terms, { before = 30, after = 70 } = {}) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const w of terms) {
    const i = lower.indexOf(w);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return text.slice(0, before + after);
  let start = Math.max(0, at - before);
  let end = Math.min(text.length, at + after);
  if (start > 0 && text[start - 1] !== " ") {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > at) end = space;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/**
 * 자료 하나가 검색어에 맞는지.
 *   제목에 모든 단어가 있으면 { where: "title" }
 *   아니면 제목·요약·본문을 합쳐서 모든 단어가 있을 때 { where: "content", hits(요약·본문에 나온 횟수), snippet }
 *   안 맞으면 null
 */
export function matchLesson(lesson, terms) {
  if (terms.length === 0) return { where: "all" };
  if (titleMatches(lesson.title, terms)) return { where: "title" };
  const body = lessonBodyText(lesson);
  const title = String(lesson.title || "").toLowerCase();
  const lowerBody = body.toLowerCase();
  if (!terms.every((w) => title.includes(w) || lowerBody.includes(w))) return null;
  const hits = terms.reduce((n, w) => n + countOccurrences(lowerBody, w), 0);
  return { where: "content", hits, snippet: makeSnippet(body, terms) };
}

/**
 * 자료실 검색 결과: [{ lesson, match }]
 *   제목에서 찾은 자료가 먼저, 내용에서만 찾은 자료가 뒤에 온다 (각각은 원래 순서 = 최근 것 먼저).
 *   unit: "all" 이거나 단원 id
 *   query: 검색어 (빈 칸이면 검색 안 함)
 *   showHidden: 비공개 자료도 보일지 (교사)
 */
export function searchLessons(lessons, { unit = "all", query = "", showHidden = false } = {}) {
  const terms = searchTerms(query);
  const results = [];
  for (const lesson of lessons) {
    if (!showHidden && lesson.isVisible === false) continue;
    if (unit !== "all" && lesson.unit !== unit) continue;
    const match = matchLesson(lesson, terms);
    if (match) results.push({ lesson, match });
  }
  const rank = (r) => (r.match.where === "content" ? 1 : 0);
  return results.sort((a, b) => rank(a) - rank(b)); // 같은 순위끼리는 순서가 그대로 (안정 정렬)
}

/** 자료실에 보여 줄 자료 (searchLessons 에서 자료만) */
export function filterLessons(lessons, options) {
  return searchLessons(lessons, options).map((r) => r.lesson);
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
