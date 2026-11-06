// 교사용: 과제 하나의 제출 현황(반별 칸) + 제출물 원본 목록.
// 과제 화면(?assignment=ID)과 관리 화면(?manage=assignments)에서 같이 쓴다.
import { useMemo, useState } from "react";
import { useDialog } from "@/components/ui/dialogContext";
import { buildClassGrid, formatTime, isLate, missingText, parseStudentNum, sortSubmissions, targetClasses, toCsv } from "@/lib/homework";
import { copyText, deleteSubmission, downloadText, useHomeworkEntries } from "@/lib/homeworkApi";
import ClassGrid, { GridLegend } from "./ClassGrid";

const SORTS = [
  { id: "num", label: "학번순" },
  { id: "new", label: "최근 제출" },
  { id: "old", label: "먼저 낸 순" },
];

function Stat({ label, value, tone = "" }) {
  return (
    <div className="border border-line p-4 bg-page">
      <div className="text-[12px] font-mono opacity-50 uppercase tracking-widest">{label}</div>
      <div className={`text-[26px] font-normal tracking-tight mt-1 ${tone}`}>{value}</div>
    </div>
  );
}

export default function HomeworkReport({ homework, settings }) {
  const { confirm, toast } = useDialog();
  const { list: subs, loaded, error } = useHomeworkEntries(homework.id, "submissions");
  const [sort, setSort] = useState("num");
  const [selected, setSelected] = useState(null); // 칸에서 고른 학번
  const [onlyExtras, setOnlyExtras] = useState(false);

  const classes = useMemo(() => targetClasses(homework, settings, subs), [homework, settings, subs]);
  const grid = useMemo(() => buildClassGrid(classes, subs, homework.due), [classes, subs, homework.due]);
  const extraIds = useMemo(() => new Set(grid.extras.map((s) => s.id)), [grid.extras]);

  const shown = useMemo(() => {
    let list = subs;
    if (selected) list = list.filter((s) => s.studentNum === selected);
    else if (onlyExtras) list = list.filter((s) => extraIds.has(s.id));
    return sortSubmissions(list, sort);
  }, [subs, selected, onlyExtras, extraIds, sort]);

  const copyMissing = async () => {
    const ok = await copyText(missingText(grid, homework.title));
    toast(ok ? "미제출 명단을 복사했어요. 메신저에 붙여 넣으세요." : "복사하지 못했어요. 브라우저 권한을 확인해 주세요.", ok ? "success" : "error");
  };

  const exportCsv = () => {
    const rows = [["반", "번호", "학번", "이름", "제출 시각", "상태", "내용"]];
    for (const s of sortSubmissions(subs, "num")) {
      const p = parseStudentNum(s.studentNum);
      rows.push([
        p ? `${p.grade}-${p.cls}` : "",
        p ? p.num : "",
        s.studentNum,
        s.studentName,
        formatTime(s.at),
        isLate(s.at, homework.due) ? "기한 후" : "제출",
        s.text,
      ]);
    }
    for (const c of grid.classes) for (const n of c.missing) rows.push([c.id, n, c.cells[n - 1].studentNum, "", "", "미제출", ""]);
    downloadText(`${homework.title.replace(/[\\/:*?"<>|]/g, "_")}_제출현황.csv`, toCsv(rows));
  };

  const remove = async (s) => {
    if (!(await confirm(`${s.studentNum} ${s.studentName} 학생의 제출물을 삭제할까요?`, { danger: true, confirmText: "삭제" }))) return;
    try {
      await deleteSubmission(homework.id, s.id);
      toast("삭제했어요.", "success");
    } catch (err) {
      console.error("delete submission:", err);
      toast("삭제하지 못했어요. 권한이나 연결을 확인해 주세요.", "error");
    }
  };

  if (error) return <p role="alert" className="py-8 font-mono text-[14px] opacity-60">제출물을 불러오지 못했어요. 보안 규칙이 게시됐는지, 교사 계정인지 확인해 주세요.</p>;
  if (!loaded) return <p className="py-8 font-mono text-[14px] opacity-40 uppercase tracking-widest">loading...</p>;

  const t = grid.totals;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="제출" value={t.size ? `${t.done} / ${t.size}` : t.done} tone="text-ok-strong" />
        <Stat label="미제출" value={t.missing} tone={t.missing ? "text-danger" : ""} />
        <Stat label="기한 후" value={t.late} />
        <Stat label="확인 필요" value={grid.extras.length} tone={grid.extras.length ? "text-warn" : ""} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <GridLegend />
        <div className="flex gap-3 font-mono text-[13px] uppercase">
          <button type="button" onClick={copyMissing} className="border border-line px-3 py-2 hover:border-ink transition-colors">[ 미제출 복사 ]</button>
          <button type="button" onClick={exportCsv} className="border border-line px-3 py-2 hover:border-ink transition-colors">[ csv ]</button>
        </div>
      </div>

      <ClassGrid grid={grid} selected={selected} onSelect={(sn) => { setSelected(sn); setOnlyExtras(false); }} />

      {grid.extras.length > 0 && (
        <div className="border border-warn bg-warn/10 p-4 text-[14px] leading-relaxed flex flex-wrap items-center justify-between gap-3">
          <span>
            대상 반이 아니거나 번호가 인원보다 큰 제출이 <b>{grid.extras.length}건</b> 있어요. 학번을 잘못 적었을 수 있어요.
          </span>
          <button type="button" onClick={() => { setOnlyExtras(!onlyExtras); setSelected(null); }} className="font-mono text-[13px] uppercase underline">
            {onlyExtras ? "[ 전체 보기 ]" : "[ 이것만 보기 ]"}
          </button>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <h4 className="text-[20px] font-normal">
            제출물 <span className="font-mono text-[14px] opacity-50">[{shown.length}]</span>
            {selected && (
              <button type="button" onClick={() => setSelected(null)} className="ml-3 font-mono text-[12px] uppercase opacity-60 hover:opacity-100">
                {selected}만 보는 중 · [ 전체 ]
              </button>
            )}
          </h4>
          <div className="flex gap-4 text-[14px]">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSort(s.id)}
                aria-pressed={sort === s.id}
                className={`pb-0.5 transition-colors ${sort === s.id ? "border-b border-ink text-ink" : "text-ink-muted hover:text-ink"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="py-6 text-[14px] font-mono opacity-40">{selected ? "이 학생은 아직 제출하지 않았어요." : "아직 제출물이 없어요."}</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((s) => {
              const late = isLate(s.at, homework.due);
              return (
                <li key={s.id} className="group border border-line bg-paper p-5 space-y-2 hover:border-ink transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-mono">
                    <span className="flex items-center gap-2">
                      <b className="font-bold text-[15px]">{s.studentNum} {s.studentName}</b>
                      {late && <span className="px-1.5 py-0.5 bg-warn text-black text-[11px]">기한 후</span>}
                      {extraIds.has(s.id) && <span className="px-1.5 py-0.5 border border-warn text-[11px]">학번 확인</span>}
                    </span>
                    <span className="flex items-center gap-3 opacity-60">
                      {formatTime(s.at)}
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        className="text-danger opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
                      >
                        [ del ]
                      </button>
                    </span>
                  </div>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{s.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
