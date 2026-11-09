// 반별 제출 현황: 번호마다 네모 칸 하나. 제출 = 초록, 기한 후 제출 = 노랑, 내용 부족 = 주황, 미제출 = 빈 칸.
// 칸을 누르면 그 학생의 제출물만 아래 목록에 보인다 (onSelect).
import { STATE_LABEL } from "@/lib/homework";

const CELL_TONE = {
  ok: "bg-ok border-ok text-white",
  late: "bg-warn border-warn text-black",
  lacking: "bg-accent border-accent text-white",
  none: "bg-transparent border-line-strong text-ink-muted hover:border-ink",
};


export function GridLegend({ className = "" }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-mono opacity-70 ${className}`}>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-ok inline-block" /> 제출</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-warn inline-block" /> 기한 후 제출</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-accent inline-block" /> 내용 부족</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 border border-line-strong inline-block" /> 미제출</span>
      <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-ink inline-block" /> 여러 번 제출</span>
    </div>
  );
}

export default function ClassGrid({ grid, selected = null, onSelect }) {
  if (grid.classes.length === 0) {
    return <p className="py-6 text-[14px] font-mono opacity-50">대상 반이 없고 아직 제출도 없어요.</p>;
  }
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {grid.classes.map((c) => {
        const pct = c.size ? Math.round((c.done / c.size) * 100) : 0;
        return (
          <section key={c.id} className="border border-line bg-surface p-5 space-y-4" aria-label={`${c.label} 제출 현황`}>
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-[18px] font-medium">{c.label}</h4>
              <span className="font-mono text-[14px]">
                <b className="font-bold">{c.done}</b>
                <span className="opacity-50"> / {c.size}명 · {pct}%</span>
              </span>
            </div>
            <div className="h-1 bg-line" aria-hidden="true">
              <div className="h-1 bg-ok transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            {c.size === 0 ? (
              <p className="text-[13px] font-mono opacity-50">인원이 설정되지 않았어요. 관리 화면의 "반 설정"에서 인원을 넣어 주세요.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {c.cells.map((cell) => {
                  const isSel = selected === cell.studentNum;
                  const count = cell.subs.length;
                  return (
                    <button
                      key={cell.num}
                      type="button"
                      onClick={() => onSelect?.(isSel ? null : cell.studentNum)}
                      title={`${cell.studentNum} · ${STATE_LABEL[cell.state]}${count > 1 ? ` (${count}번)` : ""}`}
                      aria-label={`${cell.num}번 ${STATE_LABEL[cell.state]}`}
                      aria-pressed={isSel}
                      className={`relative w-9 h-9 border text-[13px] font-mono flex items-center justify-center transition-colors ${CELL_TONE[cell.state]} ${isSel ? "ring-2 ring-offset-1 ring-ink" : ""}`}
                    >
                      {cell.num}
                      {count > 1 && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
            {c.size > 0 && (
              <p className="text-[13px] leading-relaxed">
                {c.missing.length === 0 ? (
                  <span className="text-ok-strong font-medium">모두 제출했어요.</span>
                ) : (
                  <>
                    <span className="font-mono opacity-60">미제출 {c.missing.length}명 </span>
                    {c.missing.join(", ")}번
                  </>
                )}
                {c.late > 0 && <span className="font-mono opacity-60"> · 기한 후 {c.late}명</span>}
                {c.lackingNums.length > 0 && (
                  <span className="text-accent"> · <span className="font-mono">내용 부족 {c.lackingNums.length}명</span> {c.lackingNums.join(", ")}번</span>
                )}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
