// 교무실 "오늘 한눈에" 카드의 계산 (화면·Firebase 와 분리해서 테스트한다).
// 날짜는 "YYYY-MM-DD" 문자열 (workCalendar.js 와 같다).
import { addDays, dateKey, dDay, isDateKey, pendingEvents, weekdayOf } from "./workCalendar";
import { PERIODS, cellText, isCellChanged, isEventText } from "./timetable";

export const LESSON_MINUTES = 45; // 중학교 한 교시

/** 카드가 보여 줄 날: 평일이면 오늘, 주말이면 다음 월요일 */
export function targetSchoolDay(now = new Date()) {
  const today = dateKey(now);
  const wd = weekdayOf(today); // 0 일 ~ 6 토
  const date = wd === 6 ? addDays(today, 2) : wd === 0 ? addDays(today, 1) : today;
  return { date, today, isToday: date === today, dayIdx: weekdayOf(date) - 1 };
}

/** 그 주의 월요일 */
export function mondayOf(key) {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

/**
 * 보여 줄 날이 동기화 문서 "this" / "next" 중 어느 주에 들어 있는지.
 * 동기화는 평일 아침에만 돌기 때문에 월요일 아침 동기화 전에는 "this" 가 아직 지난주다.
 * 그래서 문서가 기록된 날(updatedAt)로 그 문서가 어느 주인지 따진다.
 * updatedAt 을 모르면 평일은 "this", 주말(다음 월요일을 볼 때)은 "next" 로 둔다.
 */
export function pickWeekKey(targetDate, isToday, thisUpdatedAt, nextUpdatedAt) {
  const target = mondayOf(targetDate);
  const weekOf = (ms, offset) => (Number.isFinite(ms) ? addDays(mondayOf(dateKey(new Date(ms))), offset) : null);
  if (weekOf(thisUpdatedAt, 0) === target) return "this";
  if (weekOf(nextUpdatedAt, 7) === target) return "next";
  if (thisUpdatedAt == null && nextUpdatedAt == null) return isToday ? "this" : "next";
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
