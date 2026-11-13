// 보여 줄 수업일을 고르는 훅. 교무실 "오늘 한눈에"와 내 학급 "교실 화면"이 같이 쓴다.
// 나이스 학사일정을 먼저 받아서, 오늘 수업이 없으면(주말·공휴일·휴업일·방학) 다음 수업일을 고른다.
import { useEffect, useState } from "react";
import { eventsOn, fetchSchoolSchedule, isNoClassDay } from "@/lib/neisSchedule";
import { targetSchoolDay } from "@/lib/todayBrief";
import { addDays, dateKey } from "@/lib/workCalendar";

const WAIT_MS = 4000; // 나이스가 이만큼 늦으면 학사일정 없이(주말·정해진 공휴일만 건너뛰고) 진행
const NO_EVENTS = [];

/**
 * now: 지금 시각 (Date). 진행 중인 방학도 잡히게 두 달 앞부터 넉 달 뒤까지 받는다.
 * 반환 {
 *   today, day(targetSchoolDay 결과), ready(학사일정을 받았거나 기다림이 끝났는지),
 *   status("ok" | "partial" | "error" | "slow"), events(학사일정), skipReason(오늘을 건너뛴 까닭, 오늘이면 "")
 * }
 */
export function useSchoolDay(now) {
  const today = dateKey(now);
  const [school, setSchool] = useState({ key: null, status: "ok", events: NO_EVENTS });
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setSchool((s) => (s.key === today ? s : { key: today, status: "slow", events: NO_EVENTS }));
    }, WAIT_MS);
    fetchSchoolSchedule(addDays(today, -62), addDays(today, 120)).then((r) => {
      clearTimeout(timer);
      if (!cancelled) setSchool({ key: today, ...r });
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [today]);

  const ready = school.key === today;
  const events = ready ? school.events : NO_EVENTS;
  const day = targetSchoolDay(now, (d) => isNoClassDay(events, d));
  const todayOff = eventsOn(events, today).filter((e) => e.kind === "공휴일" || e.kind === "휴업일");
  const wd = now.getDay();
  const skipReason = day.isToday ? "" : todayOff[0]?.title || (wd >= 1 && wd <= 5 ? "공휴일" : "주말");
  return { today, day, ready, status: ready ? school.status : "loading", events, skipReason };
}
