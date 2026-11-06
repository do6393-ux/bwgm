// 정보부 업무 달력의 순수 계산 함수들. 날짜는 전부 "YYYY-MM-DD" 문자열로 다룬다.
// (문자열이면 시간대·서머타임 문제가 없고, 사전순 비교가 곧 날짜 순서 비교가 된다)

export const TITLE_MAX = 120; // firestore.rules 의 work_events 제한과 같게 둘 것
export const NOTE_MAX = 1000;

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n, width = 2) => String(n).padStart(width, "0");
const DAY_MS = 86400000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 실제로 있는 날짜인지 ("2026-02-30" 은 아니다) */
export function isDateKey(value) {
  if (typeof value !== "string") return false;
  const m = KEY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 기기의 현지 날짜 → "YYYY-MM-DD" */
export function dateKey(date) {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const utcMs = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

function keyFromUtc(ms) {
  const dt = new Date(ms);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(key, n) {
  return keyFromUtc(utcMs(key) + n * DAY_MS);
}

/** b - a (일 수). b 가 나중이면 양수 */
export function diffDays(a, b) {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

/** 0(일) ~ 6(토) */
export function weekdayOf(key) {
  return new Date(utcMs(key)).getUTCDay();
}

/** month 는 1~12. delta 만큼 달을 옮긴다 */
export function shiftMonth({ year, month }, delta) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 그 달을 덮는 주(일요일 시작) 목록. 각 주는 날짜 키 7개 */
export function monthWeeks(year, month) {
  const first = `${pad(year, 4)}-${pad(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${pad(year, 4)}-${pad(month)}-${pad(lastDay)}`;
  const weeks = [];
  for (let start = addDays(first, -weekdayOf(first)); diffDays(start, last) >= 0; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/** 깨진 데이터(날짜가 없거나 시작이 마감보다 늦음)는 달력에서 건너뛴다 */
export function isValidEvent(e) {
  return !!e && isDateKey(e.start) && isDateKey(e.end) && e.start <= e.end;
}

/**
 * 한 주(7일) 안에 일정 막대를 어느 줄(lane)·어느 칸에 그릴지 계산한다.
 * 일정이 여러 날이면 막대 하나로 이어지고, 주를 넘어가면 다음 주에서 이어서 그린다.
 * 반환: { bars: [{ event, startCol, endCol, lane, clippedStart, clippedEnd }], laneCount }
 */
export function layoutWeek(week, events) {
  const weekStart = week[0];
  const weekEnd = week[6];
  const startColOf = (e) => Math.max(0, diffDays(weekStart, e.start));

  const inWeek = events
    .filter((e) => isValidEvent(e) && e.start <= weekEnd && e.end >= weekStart)
    .sort((a, b) => {
      if (startColOf(a) !== startColOf(b)) return startColOf(a) - startColOf(b);
      if (a.end !== b.end) return a.end < b.end ? 1 : -1; // 같은 날 시작이면 긴 것이 위
      return String(a.id).localeCompare(String(b.id));
    });

  const laneEnds = []; // lane 마다 마지막으로 차지한 칸
  const bars = inWeek.map((event) => {
    const startCol = startColOf(event);
    const endCol = Math.min(6, diffDays(weekStart, event.end));
    let lane = laneEnds.findIndex((last) => last < startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endCol);
    } else {
      laneEnds[lane] = endCol;
    }
    return { event, startCol, endCol, lane, clippedStart: event.start < weekStart, clippedEnd: event.end > weekEnd };
  });
  return { bars, laneCount: laneEnds.length };
}

/** 그 달(1일~말일)과 겹치는 일정, 시작일 순 */
export function eventsInMonth(events, year, month) {
  const first = `${pad(year, 4)}-${pad(month)}-01`;
  const last = `${pad(year, 4)}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
  return events
    .filter((e) => isValidEvent(e) && e.start <= last && e.end >= first)
    .sort((a, b) => (a.start === b.start ? (a.end < b.end ? -1 : a.end > b.end ? 1 : 0) : a.start < b.start ? -1 : 1));
}

/** 끝나지 않은 일정을 마감일 순으로 (이미 지난 것이 맨 앞) */
export function pendingEvents(events) {
  return events
    .filter((e) => isValidEvent(e) && !e.done)
    .sort((a, b) => (a.end === b.end ? (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) : a.end < b.end ? -1 : 1));
}

/** 마감일까지 남은 날. days: 남은 일수(지났으면 음수), label: "D-3" / "D-DAY" / "D+2" */
export function dDay(endKey, todayKey) {
  const days = diffDays(todayKey, endKey);
  const label = days > 0 ? `D-${days}` : days === 0 ? "D-DAY" : `D+${-days}`;
  return { days, label };
}

/** "11/20(목)" 또는 "11/20(목) ~ 11/27(목)" */
export function formatPeriod(start, end) {
  const one = (key) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}(${WEEKDAYS[weekdayOf(key)]})`;
  return start === end ? one(start) : `${one(start)} ~ ${one(end)}`;
}

/** 시작일을 따로 고르지 않았을 때의 시작일: 오늘 (마감이 이미 지난 날이면 마감 당일 하루짜리) */
export function defaultStart(end, today) {
  return isDateKey(end) && end < today ? end : today;
}

/** 저장 전 점검. 문제가 있으면 안내 문구, 없으면 null */
export function validateEvent({ title, start, end, note }) {
  if (!String(title || "").trim()) return "업무 이름을 입력해 주세요.";
  if (title.trim().length > TITLE_MAX) return `업무 이름은 ${TITLE_MAX}자까지 쓸 수 있습니다.`;
  if (!isDateKey(end)) return "마감일을 골라 주세요.";
  if (!isDateKey(start)) return "시작일을 골라 주세요.";
  if (start > end) return "시작일이 마감일보다 늦을 수 없습니다.";
  if (String(note || "").length > NOTE_MAX) return `메모는 ${NOTE_MAX}자까지 쓸 수 있습니다.`;
  return null;
}
