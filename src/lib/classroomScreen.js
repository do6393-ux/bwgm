// 내 학급 "교실 화면"(교실 TV·전자칠판용)의 계산. 화면·Firebase 와 분리해서 테스트한다.
// 날짜는 "YYYY-MM-DD", 시각은 "HH:MM" 문자열.
import { PERIODS, cellText, isEventText } from "./timetable";
import { LESSON_MINUTES, periodState } from "./todayBrief";
import { WEEKDAYS } from "./workCalendar";

const LUNCH_GAP = 30; // 앞 교시가 끝나고 이만큼(분) 넘게 비면 점심시간

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** "09:55" + 45 → "10:40" */
export function addMinutes(hhmm, minutes) {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "2026-11-13" → "11월 13일 금요일" */
export function longDate(key) {
  const [, m, d] = key.split("-").map(Number);
  const wd = new Date(`${key}T00:00:00Z`).getUTCDay();
  return `${m}월 ${d}일 ${WEEKDAYS[wd]}요일`;
}

/**
 * 학급 시간표 칸 → { subject, teacher }.
 * 동기화가 과목·선생님을 따로 저장해 두었으면 나눠 쓰고, 예전 문서처럼 글자만 있으면 통째로 과목 자리에 둔다.
 */
export function splitClassCell(item) {
  if (item && typeof item === "object" && typeof item.subject === "string" && item.subject.trim()) {
    return { subject: item.subject.trim(), teacher: String(item.teacher || "").trim() };
  }
  const text = item && typeof item === "object" ? item.text || "" : String(item || "");
  return { subject: text.trim(), teacher: "" };
}

/**
 * 그날의 교시 목록 (뒤쪽 빈 교시는 뺀다).
 * times: 교시 시작 시각 ["09:00", ...] (모르면 []), isToday: 오늘을 보여 주는지 (아니면 지금·다음 표시 없음)
 * 반환 [{ period, start, end, subject, teacher, changed, event, empty, state }]
 *   state: "now" 수업 중 | "next" 다음 수업 | "past" 끝난 수업 | ""
 */
export function classroomRows(schedule, dayIdx, times, now, isToday) {
  const { current, next } = isToday ? periodState(times, now) : { current: null, next: null };
  const minutes = now.getHours() * 60 + now.getMinutes();

  const rows = Array.from({ length: PERIODS }, (_, r) => {
    const item = schedule ? schedule[`${r + 1}_${dayIdx}`] : null;
    const { subject, teacher } = splitClassCell(item);
    const start = times[r] || "";
    const end = start ? addMinutes(start, LESSON_MINUTES) : "";
    const period = r + 1;
    let state = "";
    if (isToday && subject) {
      if (period === current) state = "now";
      else if (period === next) state = "next";
      else if (end && toMinutes(end) <= minutes) state = "past";
    }
    return {
      period,
      start,
      end,
      subject,
      teacher,
      changed: !!item && typeof item === "object" && item.type === "red" && !isEventText(cellText(schedule, r, dayIdx)),
      event: isEventText(subject),
      empty: !subject,
      state,
    };
  });

  let last = rows.length;
  while (last > 0 && rows[last - 1].empty) last--;
  return rows.slice(0, last);
}

/**
 * 시계 아래 한 줄. rows 는 classroomRows 결과.
 * 예) "2교시 수업 중 · 10:40 끝", "쉬는 시간 · 3교시 10:50 시작", "오늘 수업 끝"
 */
export function classroomStatus(rows, isToday) {
  if (!isToday) return "";
  const now = rows.find((r) => r.state === "now");
  if (now) return `${now.period}교시 수업 중${now.end ? ` · ${now.end} 끝` : ""}`;
  const next = rows.find((r) => r.state === "next");
  if (next) {
    const prev = rows.find((r) => r.period === next.period - 1);
    const started = rows.some((r) => r.state === "past");
    const gap = prev?.end && next.start ? toMinutes(next.start) - toMinutes(prev.end) : 0;
    const label = !started ? "수업 전" : gap >= LUNCH_GAP ? "점심시간" : "쉬는 시간";
    return `${label} · ${next.period}교시${next.start ? ` ${next.start} 시작` : ""}`;
  }
  if (rows.length > 0 && rows.every((r) => r.empty || r.state === "past")) return "오늘 수업 끝";
  return "";
}
