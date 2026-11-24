// 교실 화면 "우리 반 일정": 선생님이 직접 넣는 일정 (수행평가·체육복 챙기기 등).
// classroom_screens/{id}.classEvents 에 [{ id, title, start, end }] 로 저장하고,
// 교실 화면 "다가오는 일정"에 나이스 학사일정과 날짜 순으로 섞어서 보여 준다.
// 날짜는 "YYYY-MM-DD" 문자열. 글자 수·개수는 firestore.rules 의 classEvents 검사와 같게 둘 것.
import { cleanText } from "./classroomChat";
import { isDateKey } from "./workCalendar";

export const CLASS_EVENT_MAX = 20; // 넣어 둘 수 있는 개수
export const CLASS_EVENT_TITLE_MAX = 20; // 일정 이름 글자 수

const ID_RE = /^[a-z0-9]{1,16}$/;

/** 저장된 값(믿을 수 없음) → 올바른 일정만, 시작일 순 */
export function cleanClassEvents(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const list = [];
  for (const e of value) {
    if (!e || typeof e !== "object") continue;
    const title = cleanText(e.title, CLASS_EVENT_TITLE_MAX);
    const start = e.start;
    const end = isDateKey(e.end) && e.end >= start ? e.end : start;
    if (!title || !isDateKey(start) || typeof e.id !== "string" || !ID_RE.test(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    list.push({ id: e.id, title, start, end });
    if (list.length >= CLASS_EVENT_MAX) break;
  }
  return sortClassEvents(list);
}

/** 시작일 순 (같으면 먼저 끝나는 것 먼저, 그다음 이름) */
export function sortClassEvents(list) {
  return [...list].sort((a, b) =>
    a.start !== b.start ? (a.start < b.start ? -1 : 1) : a.end !== b.end ? (a.end < b.end ? -1 : 1) : a.title < b.title ? -1 : a.title > b.title ? 1 : 0
  );
}

/** 끝난 일정 빼기 (오늘 끝나는 것은 남긴다) */
export function dropPastEvents(list, today) {
  return list.filter((e) => e.end >= today);
}

export function makeEventId(random = Math.random) {
  let id = "";
  while (id.length < 10) id += Math.floor(random() * 36).toString(36);
  return id;
}

/**
 * 입력 칸 값 확인. 반환 { event } 또는 { error: "화면에 띄울 문장" }
 * input: { title, start, end } (end 는 "" 이면 하루짜리)
 */
export function checkClassEvent(input, today) {
  const title = cleanText(input.title, CLASS_EVENT_TITLE_MAX);
  if (!title) return { error: "일정 이름을 써 주세요." };
  if (!isDateKey(input.start)) return { error: "날짜를 골라 주세요." };
  const end = input.end ? input.end : input.start;
  if (!isDateKey(end)) return { error: "끝나는 날을 다시 골라 주세요." };
  if (end < input.start) return { error: "끝나는 날이 시작하는 날보다 앞이에요." };
  if (end < today) return { error: "이미 지난 날짜예요." };
  return { event: { title, start: input.start, end } };
}

/**
 * 넣기·고치기 결과 목록. 지난 일정은 이때 같이 정리한다.
 * editId: 고칠 일정 id (없으면 새로 넣기). 반환 { list } 또는 { error }
 */
export function upsertClassEvent(list, event, today, editId = null, newId = makeEventId) {
  const kept = dropPastEvents(list, today);
  if (editId) {
    if (!kept.some((e) => e.id === editId)) return { error: "고칠 일정이 없어요. 이미 지나서 빠졌을 수 있어요." };
    return { list: sortClassEvents(kept.map((e) => (e.id === editId ? { ...event, id: editId } : e))) };
  }
  if (kept.length >= CLASS_EVENT_MAX) return { error: `일정은 ${CLASS_EVENT_MAX}개까지 넣을 수 있어요. 필요 없는 것을 지워 주세요.` };
  let id = newId();
  while (kept.some((e) => e.id === id)) id = newId();
  return { list: sortClassEvents([...kept, { ...event, id }]) };
}

/** 지우기 (지난 일정도 같이 정리) */
export function removeClassEvent(list, id, today) {
  return dropPastEvents(list, today).filter((e) => e.id !== id);
}

/**
 * 교실 화면 "다가오는 일정": 학사일정(neisSchedule 의 일정)과 우리 반 일정을 시작일 순으로 섞어 limit 개.
 * 우리 반 일정에는 mine: true 가 붙는다. 같은 날이면 우리 반 일정을 먼저 둔다.
 */
export function mergeUpcoming(schoolEvents, classEvents, today, limit = 3) {
  const mine = (classEvents || []).map((e) => ({ ...e, id: `class|${e.id}`, kind: "", off: false, note: "", mine: true }));
  return [...(schoolEvents || []), ...mine]
    .filter((e) => e.end >= today)
    .sort((a, b) => (a.start !== b.start ? (a.start < b.start ? -1 : 1) : (b.mine ? 1 : 0) - (a.mine ? 1 : 0)))
    .slice(0, limit);
}
