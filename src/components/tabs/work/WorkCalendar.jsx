import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { db } from "@/lib/firebase";
import { useDialog } from "@/components/ui/dialogContext";
import { setWorkEventDone } from "@/lib/workEvents";
import { PARTS, findPart } from "@/lib/workParts";
import { fetchSchoolSchedule, isOffDay, scheduleRangeFor, scheduleTag, scheduleWhen } from "@/lib/neisSchedule";
import {
  WEEKDAYS,
  dDay,
  dateKey,
  eventsInMonth,
  formatPeriod,
  isValidEvent,
  layoutWeek,
  monthWeeks,
  pendingEvents,
  shiftMonth,
} from "@/lib/workCalendar";
import EventModal from "./EventModal";

const UPCOMING_LIMIT = 6;
const SCHOOL_PREF_KEY = "work_calendar_school"; // 학사일정 켜고 끄기 (이 기기에서만 기억)
const NO_EVENTS = [];

function readSchoolPref() {
  try {
    return localStorage.getItem(SCHOOL_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeSchoolPref(on) {
  try {
    localStorage.setItem(SCHOOL_PREF_KEY, on ? "1" : "0");
  } catch {
    // 저장이 막힌 브라우저면 이번에만 적용된다
  }
}

/** 달력에 보이는 범위의 나이스 학사일정 */
function useSchoolSchedule(weeks, enabled) {
  const { from, to } = scheduleRangeFor(weeks);
  const rangeKey = `${from}|${to}`;
  const [state, setState] = useState({ key: null, status: "ok", events: [] });
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetchSchoolSchedule(from, to).then((r) => !cancelled && setState({ key: rangeKey, ...r }));
    return () => {
      cancelled = true;
    };
    // from·to 는 rangeKey 에 들어 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, enabled]);
  return { loaded: state.key === rangeKey, status: state.status, events: state.key === rangeKey ? state.events : NO_EVENTS };
}

/** 그 달 학사일정 목록 한 줄 */
function SchoolRow({ event, today }) {
  const tag = scheduleTag(event);
  const when = scheduleWhen(event, today);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b border-black/[0.05] last:border-b-0">
      <span
        aria-hidden="true"
        className={`w-2.5 h-2.5 shrink-0 rounded-[3px] border border-dashed ${event.off ? "border-red-400" : "border-neutral-400"}`}
      />
      <span className="md:w-[11.5rem] shrink-0 font-mono text-[12px] text-neutral-500">{formatPeriod(event.start, event.end)}</span>
      <span className="min-w-0 text-[14px] text-neutral-900">{event.title}</span>
      {tag && (
        <span className={`shrink-0 px-2 py-px rounded-md text-[11px] ${event.off ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>{tag}</span>
      )}
      {event.note && <span className="min-w-0 truncate text-[12px] text-neutral-500">{event.note}</span>}
      {when.label && <span className="ml-auto shrink-0 font-mono text-[11px] text-neutral-500">{when.label}</span>}
    </li>
  );
}

function dDayTone(days) {
  if (days < 0) return "text-red-600 bg-red-50 border-red-200";
  if (days <= 3) return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-neutral-500 bg-neutral-50 border-black/[0.08]";
}

/** 목록 한 줄: 완료 체크 · 이름 · 기간 · D-day · 카드 열기 */
function EventRow({ event, today, cardExists, onOpen, onToggleDone }) {
  const part = findPart(event.part);
  const dd = dDay(event.end, today);
  return (
    <li className="flex items-start gap-3 px-4 py-3 border-b border-black/[0.05] last:border-b-0">
      <input
        type="checkbox"
        checked={!!event.done}
        onChange={() => onToggleDone(event)}
        aria-label={`${event.title} 완료`}
        className="mt-1 w-4 h-4 shrink-0 cursor-pointer accent-[rgb(var(--c-accent))]"
      />
      <button type="button" onClick={() => onOpen(event)} className="min-w-0 flex-1 text-left group">
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${part.dot}`} title={part.label} />
          <span className={`truncate text-[14px] group-hover:text-accent transition-colors ${event.done ? "line-through text-neutral-400" : "text-neutral-900"}`}>
            {event.title}
          </span>
        </span>
        <span className="block mt-0.5 pl-4 font-mono text-[11px] text-neutral-400">
          {formatPeriod(event.start, event.end)}
          {event.note && <span className="ml-2 font-sans text-neutral-500">· {event.note.split("\n")[0].slice(0, 40)}</span>}
        </span>
      </button>
      {!event.done && (
        <span className={`shrink-0 px-2 py-0.5 rounded-md border font-mono text-[11px] ${dDayTone(dd.days)}`}>{dd.label}</span>
      )}
      {cardExists && (
        <button
          type="button"
          onClick={() => window.open(`?task=${event.taskId}`, "_blank")}
          title="업무 카드 열기 (매뉴얼·서식)"
          aria-label={`${event.title} 업무 카드 열기`}
          className="shrink-0 p-1 text-neutral-400 hover:text-accent transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * 정보부 업무 달력. 업무 카드(매뉴얼·서식)와 별개로, "이번에 들어온 일"을 기간과 함께 올려 두는 곳.
 * 일정은 Firestore work_events 에 있고, 접근 권한은 업무 카드와 같다 (firestore.rules).
 */
export default function WorkCalendar({ tasks, canEdit }) {
  const { toast } = useDialog();
  const today = dateKey(new Date());

  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [partFilter, setPartFilter] = useState("all");
  const [showSchool, setShowSchool] = useState(readSchoolPref);
  const [editor, setEditor] = useState(null); // 열려 있는 일정 창의 초기값

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "work_events"), orderBy("start")),
        (snap) => {
          setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoaded(true);
        },
        (err) => {
          console.error("work_events listener:", err);
          setLoaded(true);
        }
      ),
    []
  );

  const cardIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const visible = useMemo(
    () => events.filter((e) => isValidEvent(e) && (partFilter === "all" || findPart(e.part).id === partFilter)),
    [events, partFilter]
  );
  const weeks = useMemo(() => monthWeeks(cursor.year, cursor.month), [cursor]);
  const school = useSchoolSchedule(weeks, showSchool);
  const schoolEvents = showSchool ? school.events : NO_EVENTS;
  const schoolMonth = useMemo(() => eventsInMonth(schoolEvents, cursor.year, cursor.month), [schoolEvents, cursor]);
  const toggleSchool = () => {
    writeSchoolPref(!showSchool);
    setShowSchool(!showSchool);
  };
  const monthList = useMemo(() => eventsInMonth(visible, cursor.year, cursor.month), [visible, cursor]);
  const pending = useMemo(() => pendingEvents(visible), [visible]);
  const isThisMonth = cursor.year === Number(today.slice(0, 4)) && cursor.month === Number(today.slice(5, 7));

  const openNew = (day) =>
    setEditor({ taskId: "", title: "", part: partFilter === "all" ? undefined : partFilter, end: day, start: "", note: "", done: false });
  const openEdit = (event) => setEditor(event);

  const toggleDone = async (event) => {
    try {
      await setWorkEventDone(event.id, !event.done);
    } catch (err) {
      console.error("work event done:", err);
      toast("상태를 바꾸지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
    }
  };

  const rowProps = (e) => ({ event: e, today, cardExists: !!e.taskId && cardIds.has(e.taskId), onOpen: openEdit, onToggleDone: toggleDone });

  return (
    <div className="space-y-8 md:space-y-10">
      <section className="border border-black/[0.08] bg-well rounded-card p-5 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black/[0.06] pb-5 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-2 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
              <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_#0066FF] animate-pulse"></span>
              <span className="font-semibold text-neutral-700">TASK CALENDAR</span>
            </div>
            <h2 className="text-[26px] md:text-[32px] font-normal tracking-tight text-neutral-900 leading-tight">업무 달력</h2>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => openNew(today)}
              className="flex items-center justify-center gap-2 bg-accent hover:bg-accent-strong text-white px-5 py-2.5 rounded-full font-sans text-[13px] font-medium transition-all shadow-sm active:scale-95 shrink-0"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>일정 추가</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="파트별 보기">
          {[{ id: "all", label: "전체" }, ...PARTS].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPartFilter(p.id)}
              aria-pressed={partFilter === p.id}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                partFilter === p.id ? "bg-neutral-900 text-white shadow-sm" : "bg-neutral-100/80 hover:bg-neutral-200/80 text-neutral-600 border border-black/[0.04]"
              }`}
            >
              {p.dot && <span className={`w-2 h-2 rounded-full ${p.dot}`} />}
              {p.label}
            </button>
          ))}
          <span aria-hidden="true" className="w-px h-5 mx-1 bg-black/[0.15]" />
          <button
            type="button"
            onClick={toggleSchool}
            aria-pressed={showSchool}
            title="나이스에 학교가 넣은 학사일정 (공휴일·방학·휴업일·행사)"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] border border-dashed transition-all ${
              showSchool ? "bg-white border-neutral-500 text-neutral-800 font-bold shadow-sm" : "border-neutral-300 text-neutral-400 hover:text-neutral-600"
            }`}
          >
            {showSchool && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
            학사일정
          </button>
        </div>
      </section>

      {/* 마감 임박: 끝나지 않은 일정을 마감일 순으로. 이미 지난 것이 맨 위에 빨갛게 나온다 */}
      <section aria-label="마감 임박">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-mono text-[12px] uppercase tracking-widest text-neutral-600">마감 임박 · 미완료 {loaded ? pending.length : "–"}</h3>
          {pending.length > UPCOMING_LIMIT && <span className="font-mono text-[11px] text-neutral-400">마감이 가까운 {UPCOMING_LIMIT}건만 표시</span>}
        </div>
        {!loaded ? (
          <div className="h-16 rounded-panel bg-black/[0.04] animate-pulse" />
        ) : pending.length === 0 ? (
          <p className="border border-dashed border-black/[0.12] rounded-panel py-6 text-center text-[13px] text-neutral-400">
            남은 일정이 없습니다. 업무 카드의 [ + 일정 ]이나 아래 달력의 날짜를 눌러 넣어 보세요.
          </p>
        ) : (
          <ul className="border border-black/[0.08] bg-white rounded-panel overflow-hidden">
            {pending.slice(0, UPCOMING_LIMIT).map((e) => (
              <EventRow key={e.id} {...rowProps(e)} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="월 달력">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCursor((c) => shiftMonth(c, -1))}
              aria-label="이전 달"
              className="p-2 rounded-full text-neutral-500 hover:bg-black/[0.06] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="min-w-[8.5rem] text-center text-[19px] md:text-[22px] font-normal tracking-tight text-neutral-900">
              {cursor.year}년 {cursor.month}월
            </h3>
            <button
              type="button"
              onClick={() => setCursor((c) => shiftMonth(c, 1))}
              aria-label="다음 달"
              className="p-2 rounded-full text-neutral-500 hover:bg-black/[0.06] transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          {!isThisMonth && (
            <button
              type="button"
              onClick={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}
              className="px-4 py-1.5 rounded-full text-[12px] bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border border-black/[0.04] transition-colors"
            >
              오늘
            </button>
          )}
        </div>

        <div className="border border-black/[0.08] bg-white rounded-panel overflow-hidden">
          <div className="grid grid-cols-7 border-b border-black/[0.08] bg-neutral-50 text-center font-mono text-[11px]">
            {WEEKDAYS.map((w, i) => (
              <span key={w} className={`py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-neutral-500"}`}>
                {w}
              </span>
            ))}
          </div>

          {weeks.map((week) => {
            // 학사일정(점선)이 맨 위 줄을 쓰고, 우리 업무 막대는 그 아래로 내려간다
            const schoolLayout = layoutWeek(week, schoolEvents);
            const { bars } = layoutWeek(week, visible);
            const laneOffset = schoolLayout.laneCount;
            return (
              <div key={week[0]} className="relative border-b border-black/[0.06] last:border-b-0">
                {/* 날짜 칸 (뒤). 비어 있는 곳을 누르면 그 날을 마감일로 일정 창이 열린다 */}
                <div className="absolute inset-0 grid grid-cols-7">
                  {week.map((day, i) => {
                    const inMonth = Number(day.slice(5, 7)) === cursor.month;
                    const isToday = day === today;
                    const isOff = isOffDay(schoolEvents, day); // 공휴일·휴업일
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => openNew(day)}
                        aria-label={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일에 일정 넣기`}
                        className={`flex items-start justify-start p-1 md:p-1.5 border-r border-black/[0.05] last:border-r-0 text-left transition-colors enabled:hover:bg-accent/[0.05] ${
                          inMonth ? "" : "bg-neutral-50/80"
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-full font-mono text-[11px] md:text-[12px] ${
                            isToday
                              ? "bg-accent text-white font-bold"
                              : !inMonth
                                ? "text-neutral-300"
                                : isOff
                                  ? "text-red-500 font-bold"
                                  : i === 0
                                  ? "text-red-500"
                                  : i === 6
                                    ? "text-blue-500"
                                    : "text-neutral-600"
                          }`}
                        >
                          {Number(day.slice(8))}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 일정 막대 (앞). 빈 곳 클릭은 뒤의 날짜 칸으로 통과시킨다 */}
                <div className="relative grid grid-cols-7 auto-rows-[20px] gap-y-[3px] pt-8 pb-2 min-h-[84px] md:min-h-[112px] pointer-events-none">
                  {schoolLayout.bars.map(({ event, startCol, endCol, lane, clippedStart, clippedEnd }) => (
                    <span
                      key={`school-${event.id}`}
                      title={`${event.title} · ${formatPeriod(event.start, event.end)}${event.note ? ` · ${event.note}` : ""} (나이스 학사일정)`}
                      style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 1 }}
                      className={`pointer-events-auto mx-px min-w-0 truncate border border-dashed px-1 md:px-1.5 text-[10px] md:text-[11px] font-bold leading-[18px] ${
                        event.off ? "border-red-300 bg-red-50/70 text-red-700" : "border-neutral-400 bg-white text-neutral-600"
                      } ${clippedStart ? "" : "rounded-l-md"} ${clippedEnd ? "" : "rounded-r-md"}`}
                    >
                      {event.title}
                    </span>
                  ))}
                  {bars.map(({ event, startCol, endCol, lane, clippedStart, clippedEnd }) => {
                    const part = findPart(event.part);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => openEdit(event)}
                        title={`${event.title} · ${formatPeriod(event.start, event.end)}${event.done ? " · 완료" : ""}`}
                        style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 1 + laneOffset }}
                        className={`pointer-events-auto mx-px min-w-0 truncate border px-1 md:px-1.5 text-left text-[10px] md:text-[11px] leading-[18px] transition-opacity hover:opacity-80 ${part.bar} ${
                          clippedStart ? "" : "rounded-l-md"
                        } ${clippedEnd ? "" : "rounded-r-md"} ${event.done ? "opacity-50 line-through" : ""}`}
                      >
                        {event.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {showSchool && (
        <section aria-label={`${cursor.month}월 학사일정`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
            <h3 className="font-mono text-[12px] uppercase tracking-widest text-neutral-600">
              {cursor.month}월 학사일정 · 나이스 {school.loaded ? schoolMonth.length : "–"}
            </h3>
            <span className="text-[11px] text-neutral-400">토요휴업일은 빼고, 방학처럼 이어지는 날은 하나로 묶었습니다</span>
          </div>
          {!school.loaded ? (
            <div className="h-12 rounded-panel bg-black/[0.04] animate-pulse" />
          ) : school.status === "error" ? (
            <p className="border border-dashed border-black/[0.12] rounded-panel py-5 text-center text-[13px] text-neutral-400">
              나이스 학사일정을 불러오지 못했습니다. 잠시 뒤 다시 열어 보세요.
            </p>
          ) : schoolMonth.length === 0 ? (
            <p className="border border-dashed border-black/[0.12] rounded-panel py-5 text-center text-[13px] text-neutral-400">
              {cursor.month}월에 나이스에 올라온 학사일정이 없습니다.
            </p>
          ) : (
            <ul className="border border-black/[0.08] bg-white rounded-panel overflow-hidden">
              {schoolMonth.map((e) => (
                <SchoolRow key={e.id} event={e} today={today} />
              ))}
            </ul>
          )}
          {school.loaded && school.status === "partial" && (
            <p className="mt-2 text-[11px] text-orange-600">나이스 인증키가 없어 일부만 받아 왔습니다. 관리자에게 알려 주세요.</p>
          )}
        </section>
      )}

      <section aria-label={`${cursor.month}월 일정`}>
        <h3 className="mb-3 font-mono text-[12px] uppercase tracking-widest text-neutral-600">
          {cursor.month}월 일정 {loaded ? monthList.length : "–"}
        </h3>
        {loaded && monthList.length === 0 ? (
          <p className="border border-dashed border-black/[0.12] rounded-panel py-6 text-center text-[13px] text-neutral-400">
            {cursor.month}월에 넣은 일정이 없습니다.
          </p>
        ) : (
          loaded && (
            <ul className="border border-black/[0.08] bg-white rounded-panel overflow-hidden">
              {monthList.map((e) => (
                <EventRow key={e.id} {...rowProps(e)} />
              ))}
            </ul>
          )
        )}
      </section>

      {editor && <EventModal key={editor.id || "new"} initial={editor} tasks={tasks} onClose={() => setEditor(null)} />}
    </div>
  );
}
