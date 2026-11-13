// 교무실 "오늘 한눈에" 카드: 오늘(주말이면 다음 월요일) 내 수업 · 급식 · 정보 업무 마감 · 학사일정 · 과제 마감.
// PC 에서는 늘 펼쳐 두고, 휴대폰에서는 한 줄 요약만 보이다가 누르면 펼친다 (교사 시간표가 첫 화면에 다 보이게).
// 정보 업무·과제 칸은 정보 업무 권한(canWork)이 있을 때만 보인다.
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowRight, ChevronDown } from "lucide-react";
import { db } from "@/lib/firebase";
import { fetchPeriodTimes, fetchTeacherSchedule } from "@/lib/timetable";
import { fetchLunch } from "@/lib/neisMeal";
import { eventsOn, fetchSchoolSchedule, scheduleTag, scheduleWhen, upcomingSchool } from "@/lib/neisSchedule";
import { WEEKDAYS, addDays, formatPeriod } from "@/lib/workCalendar";
import { findPart } from "@/lib/workParts";
import { buildClassGrid, targetClasses } from "@/lib/homework";
import { hashOfSubtab } from "@/lib/classSubtabs";
import { useAllRosters, useClassSettings, useHomeworkList } from "@/lib/homeworkApi";
import { dayLessons, periodState, pickWeekKey, targetSchoolDay, upcomingHomework, workDigest } from "@/lib/todayBrief";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

const WORK_LIMIT = 5;
const SCHOOL_LIMIT = 3;
const SCHOOL_SOON_DAYS = 7; // 이 안에 다가오는 학사일정은 포인트 색으로
const WORK_VIEW_KEY = "work_view"; // TabWork.jsx 의 VIEW_KEY 와 같게 (정보 업무 탭이 처음 열 작은 탭)

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useWorkEvents(enabled) {
  const [state, setState] = useState({ events: [], loaded: false });
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      query(collection(db, "work_events"), orderBy("start")),
      (snap) => setState({ events: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loaded: true }),
      (err) => {
        console.error("work_events listener:", err);
        setState({ events: [], loaded: true });
      }
    );
  }, [enabled]);
  return state;
}

function ColumnTitle({ children, aside }) {
  return (
    <div className="flex items-baseline justify-between mb-3 font-mono text-[11px] text-ink-faint">
      <span className="uppercase tracking-widest">{children}</span>
      {aside}
    </div>
  );
}

function Loading({ rows = 4, label }) {
  return (
    <SkeletonGroup label={label} className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${55 + ((i * 17) % 35)}%`, animationDelay: `-${i * 120}ms` }} />
      ))}
    </SkeletonGroup>
  );
}

export default function TodayBrief({ teacherName, teacherCode, teacherBase, canWork, onOpenTab }) {
  const now = useNow();
  const day = targetSchoolDay(now);
  const [open, setOpen] = useState(false);

  // ── 시간표: 이번 주·다음 주 문서를 둘 다 읽고, 보여 줄 날이 들어 있는 쪽을 고른다 ──
  const ttKey = `${teacherName}|${teacherCode}|${day.date}`;
  const [tt, setTt] = useState({ key: null, schedule: null, times: [], status: "loading" });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!teacherName && !teacherCode) {
        setTt({ key: ttKey, schedule: null, times: [], status: "noTeacher" });
        return;
      }
      const [thisWeek, nextWeek, times] = await Promise.all([
        fetchTeacherSchedule("this", teacherName, teacherCode),
        fetchTeacherSchedule("next", teacherName, teacherCode),
        fetchPeriodTimes(),
      ]);
      if (cancelled) return;
      const weekKey = pickWeekKey(
        day.date,
        day.isToday,
        thisWeek.schedule ? thisWeek.updatedAt : null,
        nextWeek.schedule ? nextWeek.updatedAt : null
      );
      const picked = weekKey === "this" ? thisWeek : weekKey === "next" ? nextWeek : null;
      const status = picked?.schedule ? "ok" : thisWeek.failed || nextWeek.failed ? "error" : weekKey ? "empty" : "stale";
      setTt({ key: ttKey, schedule: picked?.schedule || null, times, status });
    })();
    return () => { cancelled = true; };
    // day.date / day.isToday 는 ttKey 에 들어 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttKey]);
  const ttLoading = tt.key !== ttKey;

  const lessons = useMemo(
    () => (tt.schedule ? dayLessons(tt.schedule, day.dayIdx, teacherBase) : []),
    [tt.schedule, day.dayIdx, teacherBase]
  );
  const lessonCount = lessons.filter((l) => l.text).length;
  const { current, next } = day.isToday ? periodState(tt.times, now) : { current: null, next: null };

  // ── 급식 ──
  const [meal, setMeal] = useState({ date: null, status: "ok", list: [], kcal: "" });
  useEffect(() => {
    let cancelled = false;
    fetchLunch(day.date).then((r) => !cancelled && setMeal({ date: day.date, ...r }));
    return () => { cancelled = true; };
  }, [day.date]);
  const mealLoading = meal.date !== day.date;

  // ── 학사일정 (나이스). 진행 중인 방학도 잡히게 두 달 앞부터 넉 달 뒤까지 받는다 ──
  const [school, setSchool] = useState({ key: null, status: "ok", events: [] });
  useEffect(() => {
    let cancelled = false;
    fetchSchoolSchedule(addDays(day.today, -62), addDays(day.today, 120)).then(
      (r) => !cancelled && setSchool({ key: day.today, ...r })
    );
    return () => { cancelled = true; };
  }, [day.today]);
  const schoolLoading = school.key !== day.today;
  const schoolItems = upcomingSchool(school.events, day.today, SCHOOL_LIMIT);
  const dayEvents = schoolLoading ? [] : eventsOn(school.events, day.date);
  const dayEventLabel = dayEvents
    .map((e) => {
      const tag = scheduleTag(e);
      return tag && tag !== "방학" ? `${e.title} · ${tag}` : e.title;
    })
    .join(", ");

  // ── 정보 업무 일정 ──
  const work = useWorkEvents(canWork);
  const digest = useMemo(() => workDigest(work.events, day.today), [work.events, day.today]);
  const workItems = [
    ...digest.overdue.map((e) => ({ ...e, tone: "text-danger" })),
    ...digest.dueToday.map((e) => ({ ...e, tone: "text-accent" })),
    ...digest.thisWeek.map((e) => ({ ...e, tone: "text-ink-muted" })),
  ];
  const urgentCount = digest.overdue.length + digest.dueToday.length;

  // ── 과제 마감 ──
  const hwList = useHomeworkList(canWork);
  const homework = useMemo(() => upcomingHomework(hwList.list, day.today), [hwList.list, day.today]);
  const rosters = useAllRosters(homework.map((h) => h.id));
  const settings = useClassSettings(canWork && homework.length > 0);
  const homeworkRows = homework.map((h) => {
    const roster = rosters[h.id];
    if (!roster || !settings.loaded) return { ...h, missing: null };
    const grid = buildClassGrid(targetClasses(h, settings.classes, roster), roster, h.due);
    return { ...h, missing: grid.totals.missing, total: grid.totals.size };
  });
  const missingSum = homeworkRows.reduce((s, h) => s + (h.missing ?? 0), 0);

  // "업무 달력" 단추: 정보 업무 탭을 달력 작은 탭으로 연다
  const openWorkCalendar = () => {
    try {
      localStorage.setItem(WORK_VIEW_KEY, "calendar");
    } catch {
      // 저장이 막힌 브라우저면 마지막으로 보던 작은 탭이 열린다
    }
    onOpenTab?.("work");
  };

  const [, mm, dd] = day.date.split("-").map(Number);
  const dateLabel = `${mm}월 ${dd}일 (${WEEKDAYS[day.dayIdx + 1]})`;

  const ttMessage = {
    noTeacher: "조회 교사를 먼저 설정하세요 (아래 '조회 교사' 칸).",
    empty: "이 날 시간표가 아직 없습니다.",
    stale: "시간표 동기화가 오래 멈춰 있습니다. GitHub Actions 를 확인하세요.",
    error: "시간표를 불러오지 못했습니다.",
  }[tt.status];

  return (
    <section aria-label="오늘 한눈에" className="mt-3 md:mt-0 md:mb-6 border border-line bg-page">
      {/* 휴대폰: 한 줄 요약 (누르면 펼침) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="md:hidden w-full flex items-center justify-between gap-3 px-4 py-3 font-mono text-[12px] text-left"
      >
        <span className="min-w-0 truncate">
          <span className="text-accent font-bold">{day.isToday ? "오늘" : `${mm}/${dd}(${WEEKDAYS[day.dayIdx + 1]})`}</span>
          <span className="text-ink"> 수업 {ttLoading ? "–" : lessonCount}</span>
          {canWork && <span className={urgentCount ? "text-accent" : "text-ink-muted"}> · 업무 {work.loaded ? urgentCount + digest.thisWeek.length : "–"}</span>}
          {canWork && homework.length > 0 && <span className="text-ink-muted"> · 미제출 {missingSum}</span>}
          {dayEventLabel && <span className="text-accent"> · {dayEventLabel}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <div className={`${open ? "block" : "hidden"} md:block border-t border-line md:border-t-0`}>
        <div className="hidden md:flex items-center gap-3 px-6 pt-5 font-mono text-[11px] uppercase tracking-widest">
          <span className="text-accent">// 오늘 한눈에</span>
          <span className="text-ink">{dateLabel}</span>
          {dayEventLabel && <span className="px-1.5 border border-accent/50 text-accent normal-case tracking-normal font-bold">{dayEventLabel}</span>}
          {!day.isToday && <span className="text-ink-faint normal-case tracking-normal">주말이라 다음 수업일을 보여 줍니다</span>}
        </div>

        <div className={`grid grid-cols-1 ${canWork ? "md:grid-cols-3" : "md:grid-cols-2"} divide-y md:divide-y-0 md:divide-x divide-line`}>
          {/* 내 수업 */}
          <div className="p-4 md:p-6">
            <ColumnTitle aside={!ttLoading && tt.status === "ok" && <span className="text-ink">{lessonCount}개</span>}>
              {day.isToday ? "오늘 내 수업" : "내 수업"}
            </ColumnTitle>
            {ttLoading ? (
              <Loading rows={7} label="시간표를 불러오는 중" />
            ) : ttMessage ? (
              <p className="py-6 text-center font-mono text-[12px] text-ink-faint leading-relaxed">{ttMessage}</p>
            ) : lessonCount === 0 ? (
              <p className="py-6 text-center font-mono text-[12px] text-ink-faint">수업이 없는 날입니다.</p>
            ) : (
              <ol className="space-y-1 font-mono text-[13px]">
                {lessons.map((l) => {
                  const isNow = l.period === current;
                  const isNext = !current && l.period === next && !!l.text;
                  return (
                    <li
                      key={l.period}
                      aria-current={isNow ? "time" : undefined}
                      className={`flex items-center gap-3 px-2 py-1 border-l-2 ${isNow ? "border-accent bg-accent/10" : "border-transparent"}`}
                    >
                      <span className="w-10 shrink-0 text-[11px] text-ink-faint">{l.period}교시</span>
                      {l.text ? (
                        <span className={`min-w-0 truncate ${l.changed ? "text-accent font-bold" : l.event ? "text-ok" : "text-ink"}`}>
                          {l.classLabel && <span className="mr-2">{l.classLabel}</span>}
                          {l.subject}
                        </span>
                      ) : (
                        <span className="text-ink-ghost">—</span>
                      )}
                      <span className="ml-auto flex shrink-0 gap-1 text-[10px] font-bold">
                        {l.changed && <span className="px-1.5 border border-accent/50 text-accent">변동</span>}
                        {isNow && <span className="px-1.5 bg-accent text-white">지금</span>}
                        {isNext && <span className="px-1.5 border border-line text-ink-muted">다음</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* 급식 */}
          <div className="p-4 md:p-6">
            <ColumnTitle aside={!mealLoading && meal.kcal && <span>{meal.kcal}</span>}>
              {day.isToday ? "오늘 급식" : "급식"}
            </ColumnTitle>
            {mealLoading ? (
              <Loading rows={5} label="급식을 불러오는 중" />
            ) : meal.list.length === 0 ? (
              <p className="py-6 text-center font-mono text-[12px] text-ink-faint">
                {meal.status === "error" ? "급식 정보를 불러오지 못했습니다." : "급식이 없는 날입니다."}
              </p>
            ) : (
              <ul className="space-y-1.5 text-[14px] text-ink font-light">
                {meal.list.map((dish, i) => (
                  <li key={i}>{dish}</li>
                ))}
              </ul>
            )}
          </div>

          {/* 정보 업무 */}
          {canWork && (
            <div className="p-4 md:p-6 flex flex-col">
              <ColumnTitle
                aside={
                  <button type="button" onClick={openWorkCalendar} className="flex items-center gap-1 hover:text-accent transition-colors">
                    업무 달력 <ArrowRight className="w-3 h-3" />
                  </button>
                }
              >
                정보 업무 마감
              </ColumnTitle>
              {!work.loaded ? (
                <Loading rows={3} label="업무 일정을 불러오는 중" />
              ) : workItems.length === 0 ? (
                <p className="py-6 text-center font-mono text-[12px] text-ink-faint">이번 주 마감인 업무가 없습니다.</p>
              ) : (
                <ul className="space-y-2 text-[13px]">
                  {workItems.slice(0, WORK_LIMIT).map((e) => (
                    <li key={e.id} className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${findPart(e.part).dot}`} aria-hidden="true" />
                      <span className="min-w-0 truncate text-ink">{e.title}</span>
                      <span className={`ml-auto shrink-0 font-mono text-[11px] font-bold ${e.tone}`}>{e.dday}</span>
                    </li>
                  ))}
                  {workItems.length > WORK_LIMIT && (
                    <li className="font-mono text-[11px] text-ink-faint">외 {workItems.length - WORK_LIMIT}건</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 학사일정: 다가오는 일정 몇 개 (토요휴업일은 neisSchedule 에서 뺀다) */}
        <div className="border-t border-line px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6 font-mono text-[12px]">
          <span className="text-ink-faint uppercase tracking-widest text-[11px]">학사</span>
          {schoolLoading ? (
            <Loading rows={1} label="학사일정을 불러오는 중" />
          ) : schoolItems.length === 0 ? (
            <span className="text-ink-faint">
              {school.status === "error" ? "학사일정을 불러오지 못했습니다." : "다가오는 학사일정이 없습니다."}
            </span>
          ) : (
            <ul className="flex flex-col md:flex-row gap-1.5 md:gap-6 min-w-0">
              {schoolItems.map((e) => {
                const tag = scheduleTag(e);
                const when = scheduleWhen(e, day.today);
                const soon = when.days <= SCHOOL_SOON_DAYS;
                return (
                  <li key={e.id} className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-ink-faint">{formatPeriod(e.start, e.end)}</span>
                    <span className="min-w-0 truncate font-sans text-[13px] text-ink">{e.title}</span>
                    {tag && (
                      <span className={`shrink-0 px-1.5 border text-[10px] font-bold ${e.off && soon ? "border-accent/50 text-accent" : "border-line-strong text-ink-muted"}`}>
                        {tag}
                      </span>
                    )}
                    <span className={`shrink-0 font-bold ${soon ? "text-accent" : "text-ink-muted"}`}>{when.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {canWork && (
            <button
              type="button"
              onClick={openWorkCalendar}
              className="md:ml-auto self-start md:self-auto shrink-0 flex items-center gap-1 text-ink-faint hover:text-accent transition-colors"
            >
              업무 달력 <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 과제 마감 */}
        {canWork && homeworkRows.length > 0 && (
          <div className="border-t border-line px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6 font-mono text-[12px]">
            <span className="text-ink-faint uppercase tracking-widest text-[11px]">과제</span>
            <ul className="flex flex-col md:flex-row gap-1.5 md:gap-6 min-w-0">
              {homeworkRows.map((h) => (
                <li key={h.id} className="flex items-center gap-2 min-w-0">
                  <span className="min-w-0 truncate text-ink">{h.title}</span>
                  <span className={`shrink-0 font-bold ${h.dday === "D-DAY" ? "text-accent" : "text-ink-muted"}`}>{h.dday}</span>
                  <span className="shrink-0 text-ink-faint">
                    {h.missing == null ? "· 미제출 –" : h.total ? `· 미제출 ${h.missing}명` : "· 반 인원 미설정"}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                window.location.hash = hashOfSubtab("homework"); // 정보 수업의 과제 작은 탭으로
                onOpenTab?.("class");
              }}
              className="md:ml-auto self-start md:self-auto flex items-center gap-1 text-ink-faint hover:text-accent transition-colors"
            >
              과제 관리 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
