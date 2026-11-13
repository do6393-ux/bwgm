// 나이스(NEIS) 학사일정. 교무실 "오늘 한눈에"의 학사 줄과 정보 업무 달력이 같이 쓴다.
// 날짜는 workCalendar.js 처럼 "YYYY-MM-DD" 문자열로 다룬다.
import { neisGet, neisRows } from "@/lib/neis";
import { addDays, diffDays, isDateKey } from "@/lib/workCalendar";

const SERVICE = "SchoolSchedule";

/** 매주 들어 있어서 보여 주지 않는 일정 */
const SKIP_TITLES = new Set(["토요휴업일"]);

/** 같은 이름이 이 날 수 안에 다시 나오면 한 일정으로 잇는다 (방학 중에 하루가 빠진 경우가 있다) */
const MERGE_GAP = 2;

/** NEIS 의 "20261119" → "2026-11-19" (이상한 값이면 "") */
export function ymdToKey(ymd) {
  const s = String(ymd || "");
  const key = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.length === 8 && isDateKey(key) ? key : "";
}

function kindOf(sbtr) {
  const s = String(sbtr || "");
  if (s.includes("공휴일")) return "공휴일";
  if (s.includes("휴업일")) return "휴업일";
  return ""; // "해당없음": 수업하는 날의 행사
}

/**
 * 나이스 학사일정 줄(하루에 한 줄) → 이어지는 날을 하나로 묶은 일정 목록 (시작일 순).
 * 반환 [{ id, title, start, end, kind, off, note }]
 *   kind: "공휴일" | "휴업일" | "" (수업일 행사)
 *   off: 날짜 숫자를 빨갛게 칠할 날인지. 공휴일·휴업일이지만 방학은 너무 길어서 칠하지 않는다.
 */
export function mergeScheduleRows(rows) {
  const items = (rows || [])
    .map((r) => ({
      title: String(r?.EVENT_NM || "").trim(),
      date: ymdToKey(r?.AA_YMD),
      kind: kindOf(r?.SBTR_DD_SC_NM),
      note: String(r?.EVENT_CNTNT || "").trim(),
    }))
    .filter((x) => x.title && x.date && !SKIP_TITLES.has(x.title))
    .sort((a, b) => (a.title === b.title ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : a.title < b.title ? -1 : 1));

  const merged = [];
  let cur = null;
  for (const x of items) {
    if (cur && cur.title === x.title && diffDays(cur.end, x.date) <= MERGE_GAP) {
      if (x.date > cur.end) cur.end = x.date;
      if (!cur.note && x.note !== x.title) cur.note = x.note;
      continue;
    }
    cur = { title: x.title, start: x.date, end: x.date, kind: x.kind, note: x.note === x.title ? "" : x.note };
    merged.push(cur);
  }

  return merged
    .map((e) => ({
      ...e,
      id: `${e.start}|${e.title}`,
      off: e.kind === "공휴일" || (e.kind === "휴업일" && !e.title.includes("방학")),
    }))
    .sort((a, b) => (a.start === b.start ? (a.end < b.end ? 1 : a.end > b.end ? -1 : 0) : a.start < b.start ? -1 : 1));
}

/** 일정 옆에 붙이는 짧은 표시 ("공휴일" · "휴업" · "방학", 수업일 행사는 "") */
export function scheduleTag(event) {
  if (event.kind === "공휴일") return "공휴일";
  if (event.kind === "휴업일") return event.title.includes("방학") ? "방학" : "휴업";
  return "";
}

/** date 를 덮는 일정 */
export function eventsOn(events, date) {
  return events.filter((e) => e.start <= date && date <= e.end);
}

/** date 에 수업이 없는지 (공휴일·휴업일·방학). 주말은 따로 본다 */
export function isNoClassDay(events, date) {
  return events.some((e) => (e.kind === "공휴일" || e.kind === "휴업일") && e.start <= date && date <= e.end);
}

/** date 가 빨갛게 칠할 날(공휴일·휴업일)인지 */
export function isOffDay(events, date) {
  return events.some((e) => e.off && e.start <= date && date <= e.end);
}

/**
 * 오늘 기준 언제인지. label: "D-6" · "D-DAY" · "진행 중" · ""(지난 일정), days: 시작까지 남은 날
 */
export function scheduleWhen(event, today) {
  const days = diffDays(today, event.start);
  if (days > 0) return { label: `D-${days}`, days };
  if (event.end < today) return { label: "", days };
  return { label: event.start === event.end ? "D-DAY" : "진행 중", days: 0 };
}

/** 오늘 이후(진행 중 포함) 일정을 가까운 순으로 limit 개 */
export function upcomingSchool(events, today, limit = 3) {
  return events.filter((e) => e.end >= today).slice(0, limit);
}

/** 달력에 보이는 범위(from~to)를 받을 때, 앞뒤로 이만큼 더 받아서 방학처럼 긴 일정이 잘리지 않게 한다 */
export const SCHEDULE_MARGIN_DAYS = 62;

const cache = new Map();

/**
 * from~to (날짜 키) 학사일정. 같은 범위는 한 번만 부른다 (탭을 오가도 다시 받지 않게).
 * 반환 { status, events }
 *   status: "ok" | "partial"(키가 없어 일부만 받음) | "error"(받지 못함)
 */
export function fetchSchoolSchedule(from, to) {
  const cacheKey = `${from}|${to}`;
  if (!cache.has(cacheKey)) {
    const promise = loadSchedule(from, to).then((result) => {
      if (result.status === "error") cache.delete(cacheKey); // 실패는 다음에 다시 시도
      return result;
    });
    cache.set(cacheKey, promise);
  }
  return cache.get(cacheKey);
}

async function loadSchedule(from, to) {
  const json = await neisGet(SERVICE, {
    pSize: "1000",
    AA_FROM_YMD: from.replace(/-/g, ""),
    AA_TO_YMD: to.replace(/-/g, ""),
  });
  if (!json) return { status: "error", events: [] };
  const { rows, total } = neisRows(json, SERVICE);
  return { status: rows.length < total ? "partial" : "ok", events: mergeScheduleRows(rows) };
}

/** 달력의 주 목록(monthWeeks)을 덮는 조회 범위 */
export function scheduleRangeFor(weeks) {
  const first = weeks[0][0];
  const last = weeks[weeks.length - 1][6];
  return { from: addDays(first, -SCHEDULE_MARGIN_DAYS), to: addDays(last, SCHEDULE_MARGIN_DAYS) };
}
