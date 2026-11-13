// 교무실 "오늘 한눈에" 카드의 계산 (화면·Firebase 와 분리해서 테스트한다).
// 날짜는 "YYYY-MM-DD" 문자열 (workCalendar.js 와 같다).
import { addDays, dateKey, dDay, diffDays, isDateKey, pendingEvents, weekdayOf } from "./workCalendar";
import { PERIODS, cellText, isCellChanged, isEventText } from "./timetable";

export const LESSON_MINUTES = 45; // 중학교 한 교시
const MAX_LOOKAHEAD = 100; // 겨울방학(두 달 가까이)도 건너뛸 수 있게

/**
 * 날짜가 정해진 국경일·공휴일 (설날·추석·대체공휴일은 나이스 학사일정으로 안다).
 * 겨울방학 때는 나이스에 다음 학년도 학사일정이 아직 없어서 3월 1일을 개학일로 착각할 수 있다.
 */
const FIXED_HOLIDAYS = new Set(["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"]);
export function isFixedHoliday(key) {
  return FIXED_HOLIDAYS.has(key.slice(5));
}

/**
 * 카드가 보여 줄 날: 오늘이 수업하는 날이면 오늘, 아니면(주말·공휴일·휴업일·방학) 다음 수업일.
 * noClass(날짜): 학사일정으로 본 수업 없는 날인지. 학사일정을 모르면 주말과 정해진 공휴일만 건너뛴다.
 * 반환 { date, today, isToday, dayIdx(0 월 ~ 4 금), daysAhead(오늘부터 며칠 뒤) }
 */
export function targetSchoolDay(now = new Date(), noClass = () => false) {
  const today = dateKey(now);
  const isSchoolDay = (key) => {
    const wd = weekdayOf(key); // 0 일 ~ 6 토
    return wd >= 1 && wd <= 5 && !isFixedHoliday(key) && !noClass(key);
  };
  let date = today;
  for (let i = 0; i < MAX_LOOKAHEAD && !isSchoolDay(date); i++) date = addDays(date, 1);
  if (!isSchoolDay(date)) {
    // 학사일정이 이상해서 수업일을 못 찾으면 예전처럼 주말만 건너뛴다
    const wd = weekdayOf(today);
    date = wd === 6 ? addDays(today, 2) : wd === 0 ? addDays(today, 1) : today;
  }
  return { date, today, isToday: date === today, dayIdx: weekdayOf(date) - 1, daysAhead: diffDays(today, date) };
}

/** 받침이 있으면 "이라", 없으면 "라" (예: "주말이라", "지방선거라") */
export function withIra(word) {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(이)라`;
  return code % 28 === 0 ? `${word}라` : `${word}이라`;
}

/** 그 주의 월요일 */
export function mondayOf(key) {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

/** 컴시간 동기화 문서는 이번 주·다음 주 것뿐이라, 그보다 먼 날은 시간표를 알 수 없다 */
export function isBeyondNextWeek(targetDate, today) {
  return mondayOf(targetDate) > addDays(mondayOf(today), 7);
}

/**
 * 보여 줄 날이 동기화 문서 "this" / "next" 중 어느 주에 들어 있는지.
 * 동기화는 평일 아침에만 돌기 때문에 월요일 아침 동기화 전에는 "this" 가 아직 지난주다.
 * 그래서 문서가 기록된 날(updatedAt)로 그 문서가 어느 주인지 따진다.
 * updatedAt 을 모르면 오늘과 같은 주는 "this", 다음 주(주말·연휴 뒤)는 "next" 로 둔다.
 */
export function pickWeekKey(targetDate, sameWeekAsToday, thisUpdatedAt, nextUpdatedAt) {
  const target = mondayOf(targetDate);
  const weekOf = (ms, offset) => (Number.isFinite(ms) ? addDays(mondayOf(dateKey(new Date(ms))), offset) : null);
  if (weekOf(thisUpdatedAt, 0) === target) return "this";
  if (weekOf(nextUpdatedAt, 7) === target) return "next";
  if (thisUpdatedAt == null && nextUpdatedAt == null) return sameWeekAsToday ? "this" : "next";
  return null; // 문서는 있지만 그 주의 것이 아니다 (동기화가 오래 멈춘 경우)
}

/** 교사 시간표 칸 글자 "205정보" → { classLabel: "2-5", subject: "정보" } */
export function parseTeacherCell(text) {
  const clean = String(text || "").trim();
  const m = /^(\d)(\d{2})\s*(.*)$/.exec(clean);
  if (!m) return { classLabel: "", subject: clean };
  return { classLabel: `${m[1]}-${Number(m[2])}`, subject: m[3].trim() };
}

/** 그날의 1~7교시. 빈 교시도 넣는다 */
export function dayLessons(schedule, dayIdx, baseMatrix) {
  return Array.from({ length: PERIODS }, (_, r) => {
    const text = cellText(schedule, r, dayIdx).trim();
    return {
      period: r + 1,
      text,
      ...parseTeacherCell(text),
      event: !!text && isEventText(text),
      changed: isCellChanged(r, dayIdx, schedule, baseMatrix, false),
    };
  });
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * 지금 몇 교시인지. times = 교시 시작 시각 ["09:00", ...]
 * 반환 { current: 수업 중인 교시 | null, next: 다음에 시작할 교시 | null }
 */
export function periodState(times, now = new Date(), lessonMinutes = LESSON_MINUTES) {
  const t = now.getHours() * 60 + now.getMinutes();
  let current = null;
  let next = null;
  times.forEach((start, i) => {
    const s = toMinutes(start);
    if (current === null && t >= s && t < s + lessonMinutes) current = i + 1;
    if (next === null && s > t) next = i + 1;
  });
  return { current, next };
}

/** 끝나지 않은 업무 일정 → 기한 지남 / 오늘 마감 / 이번 주(앞으로 6일 안) 마감 */
export function workDigest(events, today) {
  const pending = pendingEvents(events);
  const weekEnd = addDays(today, 6);
  const withDay = (e) => ({ ...e, dday: dDay(e.end, today).label });
  return {
    overdue: pending.filter((e) => e.end < today).map(withDay),
    dueToday: pending.filter((e) => e.end === today).map(withDay),
    thisWeek: pending.filter((e) => e.end > today && e.end <= weekEnd).map(withDay),
  };
}

/** 공개 중이고 마감이 오늘 이후인 과제, 마감이 가까운 순으로 limit 개 */
export function upcomingHomework(list, today, limit = 2) {
  return list
    .filter((h) => h.open !== false && isDateKey(h.due) && h.due >= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
    .slice(0, limit)
    .map((h) => ({ ...h, dday: dDay(h.due, today).label }));
}
