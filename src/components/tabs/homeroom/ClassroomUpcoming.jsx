// 교실 화면 오른쪽 "다가오는 일정" 칸: 나이스 학사일정 + 선생님이 넣은 우리 반 일정.
// 평소에는 가까운 몇 개만. 누르면 위의 "오늘 급식" 자리까지 늘어나 남은 일정을 모두 보여 주고 스크롤된다.
// 늘어난 동안 1분 아무도 안 만지면 접힌다. Esc 는 교실 프로그램의 "화면 내리기"보다 먼저 받아서 이 칸만 접는다.
import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { scheduleTag, scheduleWhen } from "@/lib/neisSchedule";
import { monthDay } from "@/lib/classroomScreen";

const SOON_DAYS = 7;
const IDLE_MS = 60 * 1000;

function Row({ e, today }) {
  const when = scheduleWhen(e, today);
  const tag = e.mine ? "" : scheduleTag(e);
  const soon = when.days <= SOON_DAYS;
  return (
    <span className="flex items-baseline gap-3">
      {e.mine && (
        <span className="shrink-0 self-center px-2 py-px rounded-full border-2 border-[#fbbf24] text-[#fbbf24] text-[13px] font-bold whitespace-nowrap">
          우리 반
        </span>
      )}
      <span className="flex-1 min-w-0 text-[21px] font-bold leading-[1.4] truncate">
        {e.title}
        {tag && tag !== "공휴일" && <span className="ml-2 text-[15px] font-medium text-[#bdbdbd]">({tag})</span>}
      </span>
      <span className="shrink-0 text-[15px] text-[#bdbdbd]">
        {monthDay(e.start)}
        {e.end !== e.start ? "부터" : ""}
      </span>
      <span className={`shrink-0 min-w-[76px] text-right font-mono text-[24px] font-bold ${soon ? "text-[#34d399]" : "text-[#f5f5f5]"}`}>
        {when.label}
      </span>
    </span>
  );
}

/** 늘어난 동안: 1분 동안 아무도 안 만지면 접고, Esc 로도 접는다 */
function useCollapseWhenIdle(expanded, onCollapse) {
  const onCollapseRef = useRef(onCollapse);
  useEffect(() => {
    onCollapseRef.current = onCollapse;
  });
  useEffect(() => {
    if (!expanded) return undefined;
    let timer = null;
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onCollapseRef.current(), IDLE_MS);
    };
    const onKey = (event) => {
      restart();
      if (event.key !== "Escape" || event.repeat) return;
      event.preventDefault(); // 교실 프로그램이 화면을 내리지 않게 (isEscToLower)
      onCollapseRef.current();
    };
    const opts = { capture: true, passive: true };
    restart();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", restart, opts);
    window.addEventListener("pointermove", restart, opts);
    window.addEventListener("wheel", restart, opts);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", restart, opts);
      window.removeEventListener("pointermove", restart, opts);
      window.removeEventListener("wheel", restart, opts);
    };
  }, [expanded]);
}

/**
 * items: 평소에 보이는 일정 (mergeUpcoming 결과), allItems: 남은 일정 모두
 * ready: 학사일정을 받았는지 (아직이면 "없어요"를 띄우지 않는다)
 */
export default function ClassroomUpcoming({ items, allItems, today, ready, expanded, onExpand, onCollapse }) {
  useCollapseWhenIdle(expanded, onCollapse);
  const more = allItems.length - items.length;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={`다가오는 일정${more > 0 ? `, ${more}개 더` : ""}. 누르면 모두 보여요`}
        className="flex-1 min-h-0 overflow-hidden bg-[#383838] hover:bg-[#404040] rounded-[28px] px-6 py-5 flex flex-col text-left"
      >
        <span className="w-full flex items-baseline justify-between gap-3 mb-2 px-1">
          <span className="text-[16px] font-medium text-[#bdbdbd] tracking-[0.08em]">다가오는 일정</span>
          <span className="flex items-center gap-0.5 text-[15px] font-medium text-[#bdbdbd]">
            {more > 0 ? `${more}개 더 · 모두 보기` : "모두 보기"}
            <ChevronUp className="w-4 h-4 self-center" strokeWidth={2.4} />
          </span>
        </span>
        {items.length === 0 ? (
          <span className="py-1 px-1 text-[20px] text-[#bdbdbd]">{ready ? "다가오는 일정이 없어요." : ""}</span>
        ) : (
          <span className="w-full flex flex-col gap-1.5 px-1">
            {items.map((e) => (
              <Row key={e.id} e={e} today={today} />
            ))}
          </span>
        )}
      </button>
    );
  }

  const monthOf = (e) => Number(e.start.slice(5, 7));
  return (
    <section aria-label="다가오는 일정 모두" className="flex-1 min-h-0 bg-[#383838] rounded-[28px] pt-4 pb-3 flex flex-col">
      <div className="flex items-center justify-between gap-3 pl-7 pr-4 mb-1">
        <h2 className="text-[16px] font-medium text-[#bdbdbd] tracking-[0.08em]">
          다가오는 일정 <span className="font-mono">{allItems.length}</span>
        </h2>
        <button
          type="button"
          onClick={onCollapse}
          className="h-11 pl-4 pr-3 rounded-2xl bg-[#4a4a4a] hover:bg-[#5a5a5a] text-[#f5f5f5] text-[17px] font-bold flex items-center gap-1"
        >
          접기
          <ChevronDown className="w-5 h-5" strokeWidth={2.4} />
        </button>
      </div>
      {allItems.length === 0 ? (
        <p className="py-1 px-7 text-[20px] text-[#bdbdbd]">{ready ? "다가오는 일정이 없어요." : ""}</p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain pl-7 pr-4 mr-2 flex flex-col gap-1.5 [scrollbar-width:thin] [scrollbar-color:#6b6b6b_transparent]">
          {allItems.map((e, i) => {
            const month = monthOf(e);
            const showMonth = i === 0 || monthOf(allItems[i - 1]) !== month;
            return (
              <li key={e.id} className="flex flex-col">
                {showMonth && <span className="mt-1.5 mb-0.5 text-[14px] font-bold text-[#34d399] tracking-[0.08em]">{month}월</span>}
                <Row e={e} today={today} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
