import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n) => String(n).padStart(2, "0");
// month 는 0~11 (Date 와 같은 방식)
const toDateString = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

function parseDateString(str) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function todayParts() {
  const d = new Date(); // 기기의 현지 시간 기준
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

/**
 * 작은 달력으로 날짜를 고르는 입력.
 * 브라우저 기본 date 입력은 달력이 오른쪽 작은 아이콘에서만 열리고 브라우저마다 동작도 달라서,
 * 직접 만든 달력을 쓴다. value / onChange 는 "YYYY-MM-DD" 문자열.
 */
export default function DatePicker({ value, onChange, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState(() => {
    const p = parseDateString(value) || todayParts();
    return { year: p.year, month: p.month };
  });
  const wrapperRef = useRef(null);

  // 달력 밖을 누르거나 Esc 를 누르면 닫는다
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const selected = parseDateString(value);
  const today = todayParts();

  const toggleOpen = () => {
    if (!isOpen) {
      // 열 때마다 선택된 날짜가 있는 달로 맞춘다
      const p = selected || today;
      setView({ year: p.year, month: p.month });
    }
    setIsOpen(!isOpen);
  };

  const moveMonth = (delta) => {
    setView((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const pick = (year, month, day) => {
    onChange(toDateString(year, month, day));
    setIsOpen(false);
  };

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const label = selected
    ? `${selected.year}.${pad(selected.month + 1)}.${pad(selected.day)} (${WEEKDAYS[new Date(selected.year, selected.month, selected.day).getDay()]})`
    : "날짜 선택";

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 bg-[#111111] border border-[#222222] p-3 text-[14px] font-mono text-white outline-none hover:border-[#444444] focus:border-[#FF5000] transition-colors"
      >
        <span>{label}</span>
        <Calendar className="w-4 h-4 text-[#888888]" />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="날짜 선택"
          className="absolute left-0 top-full mt-1 z-30 w-[260px] bg-[#0A0A0A] border border-[#333333] p-3 shadow-2xl font-mono"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="이전 달"
              className="p-1.5 text-[#A0A0A0] hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[13px] font-bold text-white">
              {view.year}년 {view.month + 1}월
            </span>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="다음 달"
              className="p-1.5 text-[#A0A0A0] hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] mb-1">
            {WEEKDAYS.map((w, i) => (
              <span key={w} className={i === 0 ? "text-[#FF6B6B]" : i === 6 ? "text-[#6BA8FF]" : "text-[#666666]"}>
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {cells.map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const isSelected = !!selected && selected.year === view.year && selected.month === view.month && selected.day === day;
              const isToday = today.year === view.year && today.month === view.month && today.day === day;
              const weekday = (firstWeekday + day - 1) % 7;
              const tone = isSelected
                ? "bg-[#FF5000] text-black font-bold"
                : weekday === 0
                  ? "text-[#FF6B6B] hover:bg-[#1A1A1A]"
                  : weekday === 6
                    ? "text-[#6BA8FF] hover:bg-[#1A1A1A]"
                    : "text-[#E0E0E0] hover:bg-[#1A1A1A]";
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(view.year, view.month, day)}
                  aria-label={`${view.year}년 ${view.month + 1}월 ${day}일`}
                  aria-pressed={isSelected}
                  className={`mx-auto w-8 h-8 text-[12px] rounded-sm transition-colors ${tone} ${isToday && !isSelected ? "ring-1 ring-[#00E599]" : ""}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between items-center mt-3 pt-2 border-t border-[#1A1A1A] text-[11px]">
            <button
              type="button"
              onClick={() => pick(today.year, today.month, today.day)}
              className="text-[#00E599] hover:text-white"
            >
              오늘
            </button>
            <button type="button" onClick={() => setIsOpen(false)} className="text-[#888888] hover:text-white">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
