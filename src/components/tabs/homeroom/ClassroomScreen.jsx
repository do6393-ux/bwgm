// 내 학급 "교실 화면": 교실 TV·전자칠판에 띄워 두는 1280×720 화면.
// 담는 칸(평소엔 16:9 미리보기, 전체 화면이면 화면 전체) 크기에 맞춰 통째로 줄이고 늘린다.
// 우리 반 시간표(컴시간) · 급식 · 학사일정(나이스) · 시계. 입력할 것이 없고 학생 개인정보도 나오지 않는다.
import { useEffect, useRef, useState } from "react";
import { fetchClassSchedule, fetchPeriodTimes } from "@/lib/timetable";
import { fetchLunch } from "@/lib/neisMeal";
import { scheduleTag, scheduleWhen, upcomingSchool } from "@/lib/neisSchedule";
import { useSchoolDay } from "@/lib/useSchoolDay";
import { isBeyondNextWeek, pickDaySchedule } from "@/lib/todayBrief";
import { classroomRows, classroomStatus, longDate } from "@/lib/classroomScreen";

const W = 1280;
const H = 720;
const SCHOOL_LIMIT = 3;
const SOON_DAYS = 7;
const RELOAD_MINUTES = 30; // 아침 동기화가 늦게 끝나도 따라가게 시간표를 이만큼마다 다시 읽는다

function useClock(ms = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** 담는 칸에 1280×720 을 꽉 맞추는 배율 */
function useFitScale() {
  const ref = useRef(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / W, height / H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, scale];
}

const pad2 = (n) => String(n).padStart(2, "0");

function Card({ title, aside, className = "", children }) {
  return (
    <section aria-label={title} className={`bg-[#383838] rounded-[28px] px-6 py-5 flex flex-col min-h-0 ${className}`}>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <h2 className="text-[16px] font-medium text-[#bdbdbd] tracking-[0.08em]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Notice({ children }) {
  return <p className="m-auto text-center text-[22px] leading-relaxed text-[#bdbdbd] whitespace-pre-line">{children}</p>;
}

export default function ClassroomScreen({ grade, classNum }) {
  const now = useClock();
  const { today, day, ready, events, skipReason } = useSchoolDay(now);
  const classKey = `${grade}-${classNum}`;

  // ── 우리 반 시간표 (보여 줄 날이 정해진 뒤, 30분마다 다시 읽는다. 다시 읽는 동안에는 앞의 것을 그대로 둔다) ──
  const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / RELOAD_MINUTES);
  const ttKey = ready ? `${classKey}|${day.date}|${slot}` : null;
  const [tt, setTt] = useState({ key: null, view: null, schedule: null, times: [], status: "loading" });
  useEffect(() => {
    if (!ttKey) return undefined;
    let cancelled = false;
    (async () => {
      const view = `${classKey}|${day.date}`;
      if (isBeyondNextWeek(day.date, day.today)) {
        setTt({ key: ttKey, view, schedule: null, times: [], status: "far" });
        return;
      }
      const [thisWeek, nextWeek, times] = await Promise.all([
        fetchClassSchedule("this", classKey),
        fetchClassSchedule("next", classKey),
        fetchPeriodTimes(),
      ]);
      if (cancelled) return;
      setTt({ key: ttKey, view, times, ...pickDaySchedule(day, thisWeek, nextWeek) });
    })();
    return () => { cancelled = true; };
    // classKey·day.date 는 ttKey 에, day.today 는 day.date 를 고를 때 들어 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttKey]);
  const ttShown = tt.view === `${classKey}|${day.date}`;
  const rows = ttShown && tt.schedule ? classroomRows(tt.schedule, day.dayIdx, tt.times, now, day.isToday) : [];
  const status = classroomStatus(rows, day.isToday);
  const ttMessage = !ttShown
    ? null
    : {
        far: "이 날 시간표는 아직 없어요.\n컴시간은 이번 주와 다음 주만 알려 줘요.",
        empty: "이 날 시간표가 없어요.",
        stale: "시간표 동기화가 멈춰 있어요.",
        error: "시간표를 불러오지 못했어요.",
      }[tt.status] || (tt.status === "ok" && rows.length === 0 ? "이 날은 수업이 없어요." : null);

  // ── 급식 ──
  const mealDate = ready ? day.date : null;
  const [meal, setMeal] = useState({ date: null, list: [], kcal: "", status: "ok" });
  useEffect(() => {
    if (!mealDate) return undefined;
    let cancelled = false;
    fetchLunch(mealDate).then((r) => !cancelled && setMeal({ date: mealDate, ...r }));
    return () => { cancelled = true; };
  }, [mealDate]);
  const mealShown = meal.date === mealDate;

  // ── 학사일정 ──
  const schoolItems = upcomingSchool(events, today, SCHOOL_LIMIT);

  const [boxRef, scale] = useFitScale();

  return (
    <div ref={boxRef} className="w-full h-full flex items-center justify-center overflow-hidden">
      <div style={{ width: W * scale, height: H * scale }} className="shrink-0">
        <div
          style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          className="box-border px-11 py-9 bg-[#2b2b2b] text-[#f5f5f5] font-sans flex flex-col gap-6 select-none"
        >
          <header className="flex items-end justify-between gap-6">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[40px] font-bold tracking-tight leading-[1.1]">
                {grade}학년 {classNum}반
              </span>
              <span className="text-[22px] text-[#bdbdbd] truncate">
                {longDate(day.date)}
                {!day.isToday && <span className="text-[#34d399]"> · 다음 수업일</span>}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="font-mono text-[84px] font-bold leading-[0.95] tracking-tighter tabular-nums">
                {pad2(now.getHours())}:{pad2(now.getMinutes())}
              </span>
              <span className="text-[18px] font-medium text-[#34d399] h-7">
                {day.isToday ? status : `오늘은 ${skipReason}`}
              </span>
            </div>
          </header>

          <div className="flex-1 min-h-0 grid grid-cols-[7fr_5fr] gap-6">
            <Card title={day.isToday ? "오늘 시간표" : "다음 수업일 시간표"}>
              {!ttShown ? (
                <div className="flex flex-col gap-2 pt-1" aria-label="시간표를 불러오는 중">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="h-[46px] rounded-2xl bg-white/[0.05] animate-pulse" />
                  ))}
                </div>
              ) : ttMessage ? (
                <Notice>{ttMessage}</Notice>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {rows.map((r) => (
                    <li
                      key={r.period}
                      aria-current={r.state === "now" ? "time" : undefined}
                      className={`grid grid-cols-[76px_74px_minmax(0,1fr)_auto] items-center gap-3 h-[52px] px-3.5 rounded-2xl ${
                        r.state === "now" ? "bg-[#34d399] text-[#052e22]" : r.state === "next" ? "bg-[#444444]" : ""
                      } ${r.state === "past" ? "opacity-40" : ""}`}
                    >
                      <span className="font-mono text-[18px] font-bold">{r.period}교시</span>
                      <span className="font-mono text-[16px] opacity-80">{r.start}</span>
                      <span className="min-w-0 truncate">
                        {r.empty ? (
                          <span className="text-[26px] text-[#777777]">—</span>
                        ) : (
                          <>
                            <span className="text-[30px] font-bold tracking-tight">{r.subject}</span>
                            {r.teacher && (
                              <span className={`ml-3 text-[18px] ${r.state === "now" ? "text-[#065f46]" : "text-[#bdbdbd]"}`}>{r.teacher}</span>
                            )}
                          </>
                        )}
                      </span>
                      <span className="flex gap-1.5 justify-self-end">
                        {r.changed && (
                          <span
                            className={`px-3 py-0.5 rounded-full text-[16px] font-bold border-2 ${
                              r.state === "now" ? "border-[#052e22] text-[#052e22]" : "border-[#fbbf24] text-[#fbbf24]"
                            }`}
                          >
                            변동
                          </span>
                        )}
                        {r.state === "now" && <span className="px-3 py-0.5 rounded-full text-[16px] font-bold border-2 border-[#052e22] bg-[#052e22] text-[#34d399]">지금</span>}
                        {r.state === "next" && <span className="px-3 py-0.5 rounded-full text-[16px] font-bold border-2 border-[#34d399] text-[#34d399]">다음</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <div className="flex flex-col gap-6 min-h-0">
              <Card
                title={day.isToday ? "오늘 급식" : "급식"}
                aside={mealShown && meal.kcal && <span className="font-mono text-[14px] text-[#bdbdbd]">{meal.kcal}</span>}
              >
                {!mealShown ? (
                  <div className="h-[150px] rounded-2xl bg-white/[0.05] animate-pulse" aria-label="급식을 불러오는 중" />
                ) : meal.list.length === 0 ? (
                  <p className="py-4 px-1 text-[20px] text-[#bdbdbd]">{meal.status === "error" ? "급식을 불러오지 못했어요." : "급식이 없는 날이에요."}</p>
                ) : (
                  <ul className="px-1 overflow-hidden">
                    {meal.list.map((dish, i) => (
                      <li key={i} className="text-[21px] leading-[1.35] truncate">
                        {dish}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="다가오는 학사일정" className="flex-1">
                {schoolItems.length === 0 ? (
                  <p className="py-2 px-1 text-[20px] text-[#bdbdbd]">{ready ? "다가오는 학사일정이 없어요." : ""}</p>
                ) : (
                  <ul className="flex flex-col gap-2.5 px-1">
                    {schoolItems.map((e) => {
                      const when = scheduleWhen(e, today);
                      const tag = scheduleTag(e);
                      const soon = when.days <= SOON_DAYS;
                      return (
                        <li key={e.id} className="flex items-center gap-3.5">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[22px] font-bold truncate">
                              {e.title}
                              {tag && tag !== "공휴일" && <span className="ml-2 text-[16px] font-medium text-[#bdbdbd]">({tag})</span>}
                            </span>
                            <span className="text-[15px] text-[#bdbdbd]">
                              {longDate(e.start)}
                              {e.end !== e.start ? "부터" : ""}
                            </span>
                          </div>
                          <span className={`font-mono text-[28px] font-bold shrink-0 ${soon ? "text-[#34d399]" : "text-[#f5f5f5]"}`}>{when.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
