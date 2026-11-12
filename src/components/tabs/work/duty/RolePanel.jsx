import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import EquipmentLedger from "../equipment/EquipmentLedger";
import TaskCard from "../TaskCard";
import DutyCard from "./DutyCard";
import DutyModal from "./DutyModal";
import { findPart } from "@/lib/workParts";
import { ROLE_META, ROLE_TOOLS, TOOLS, groupCards, matchesQuery, monthTodos, patchTodo, todoProgress } from "@/lib/workDuties";
import { ensureDutyTask, saveTodos } from "@/lib/workDutiesApi";

const pill = (active) =>
  `px-4 md:px-5 py-2 rounded-full text-[13px] font-medium transition-all ${
    active ? "bg-white text-neutral-900 shadow-sm font-semibold" : "text-neutral-600 hover:text-neutral-900"
  }`;

const gridCls = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5";

/**
 * 보직 탭 하나 (부장 · 정보기획 · 기기·소모품 · 나이스·공시).
 * 머리 카드(이번 달에 할 일) + 작은 탭(업무분장 | 그 보직 도구) + 업무분장 카드 · 그 밖의 카드 · 부서 공통 카드.
 */
export default function RolePanel({ part, tasks, tasksLoaded, canEdit, onAddTask, onEditTask, onDeleteTask, onToggleStatus, onSchedule }) {
  const { toast } = useDialog();
  const [month] = useState(() => new Date().getMonth() + 1);
  const [tool, setTool] = useState("duties");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const [opening, setOpening] = useState(false);

  const meta = ROLE_META[part];
  const p = findPart(part);
  const tools = ROLE_TOOLS[part];
  const groups = useMemo(() => groupCards(tasks, part), [tasks, part]);

  const allTodos = groups.duties.flatMap((x) => x.task?.todos || []);
  const progress = todoProgress(allTodos);
  const monthRows = monthTodos(
    [...groups.duties.map((x) => ({ task: x.task, title: x.title, duty: x })), ...groups.others.map((t) => ({ task: t, title: t.title }))],
    month
  );

  const duties = groups.duties.filter((x) => matchesQuery(x.task, x.title, query));
  const others = groups.others.filter((t) => matchesQuery(t, t.title, query));
  const common = groups.common.filter((t) => matchesQuery(t, t.title, query));
  const openDuty = groups.duties.find((x) => x.key === openKey) || null;

  const open = async (duty) => {
    if (opening) return;
    if (!duty.task) {
      // 처음 여는 카드: work_tasks/duty_<key> 문서를 만든 뒤 연다
      setOpening(true);
      try {
        await ensureDutyTask(duty, null);
      } catch (err) {
        console.error("duty card create:", err);
        toast("카드를 만들지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
        return;
      } finally {
        setOpening(false);
      }
    }
    setOpenKey(duty.key);
  };

  // 예전 카드의 [ + 일정 ]: 카드 이름 · 파트를 그대로 가져간다
  const scheduleCard = (t) => onSchedule({ taskId: t.id, title: t.title, part: findPart(t.part).id });

  const openRowCard = (row) => {
    if (row.duty) setOpenKey(row.duty.key);
    else window.open(`?task=${row.task.id}`, "_blank");
  };

  const checkRow = async (row) => {
    try {
      await saveTodos(row.task.id, patchTodo(row.task.todos, row.todo.id, { done: true }));
    } catch (err) {
      console.error("month todo check:", err);
      toast("저장하지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
    }
  };

  return (
    <div className="space-y-12">
      <section className="border border-black/[0.08] bg-well rounded-card p-5 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-wrap justify-between items-end gap-5">
          <div>
            <div className="flex items-center gap-2 mb-2 font-mono text-[11px] uppercase tracking-wider text-neutral-600">
              <span className={`w-2 h-2 rounded-full ${p.dot}`} aria-hidden="true"></span>
              <span className="font-semibold">{meta.eyebrow}</span>
            </div>
            <h2 className="text-[26px] md:text-[32px] font-normal tracking-tight text-neutral-900 leading-tight">{p.label}</h2>
            <p className="mt-2 text-[13px] text-neutral-600">
              업무분장 {groups.duties.length}개
              {tasksLoaded && progress.total > 0 && ` · 해야 할 일 ${progress.done} / ${progress.total}`}
            </p>
          </div>
          {tools.length > 0 && (
            <div role="tablist" aria-label={`${meta.tab} 작은 탭`} className="flex flex-wrap gap-1 rounded-full bg-black/[0.06] p-1">
              <button type="button" role="tab" aria-selected={tool === "duties"} onClick={() => setTool("duties")} className={pill(tool === "duties")}>
                업무분장
              </button>
              {tools.map((id) => (
                <button key={id} type="button" role="tab" aria-selected={tool === id} onClick={() => setTool(id)} className={pill(tool === id)}>
                  {TOOLS[id].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tool === "duties" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-6">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="이 보직 카드 검색"
                  placeholder="업무 · 할 일 · 매뉴얼 검색..."
                  className="pl-9 pr-8 py-2 rounded-full text-[13px] bg-white/90 border border-black/[0.08] text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/15 transition-all w-60 sm:w-72 shadow-sm"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기" className="absolute right-2 w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-neutral-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onAddTask(part)}
                  title="업무분장에 없는 일을 카드로 따로 만든다"
                  className="flex items-center gap-2 bg-white hover:border-black/30 border border-black/[0.12] text-neutral-800 px-4 min-h-[44px] rounded-full text-[13px] font-medium transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>카드 따로 만들기</span>
                </button>
              )}
            </div>

            {/* 이번 달에 할 일: 카드들의 해야 할 일 중 지난 일 + 이번 달 일 */}
            <div className="space-y-2.5">
              <div className="flex items-baseline gap-2.5">
                <h3 className="text-[15px] font-semibold text-neutral-900">{month}월에 할 일</h3>
                <span className="font-mono text-[12px] text-neutral-500">{tasksLoaded ? `${monthRows.length}개` : "–"}</span>
              </div>
              {tasksLoaded && monthRows.length === 0 && (
                <p className="text-[13px] text-neutral-500">
                  이번 달에 적어 둔 할 일이 없어요. 카드를 눌러 시기와 할 일을 적으면 여기에 모여요.
                </p>
              )}
              <ul className="space-y-2">
                {monthRows.map((row) => (
                  <li key={`${row.task.id}-${row.todo.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-3.5 pr-2 py-1.5 rounded-field bg-white border border-black/[0.08]">
                    <label className="flex flex-[999_1_260px] min-w-0 items-center gap-3 min-h-[44px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={!canEdit}
                        onChange={() => checkRow(row)}
                        className="w-[18px] h-[18px] shrink-0 accent-[rgb(var(--c-accent))]"
                      />
                      {row.late && <span className="shrink-0 px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-[12px] font-semibold text-red-700">{row.todo.when} 지남</span>}
                      <span className="min-w-0 text-[14px] text-neutral-900 break-keep">{row.todo.text}</span>
                    </label>
                    <button type="button" onClick={() => openRowCard(row)} className="min-h-[36px] px-2 text-[12px] text-neutral-500 hover:text-accent text-left break-keep">
                      {row.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      {tool === "equipment" ? (
        <EquipmentLedger />
      ) : (
        <>
          <section className="space-y-5">
            <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-black/[0.06] pb-3">
              <h3 className="text-[20px] font-semibold text-neutral-900">업무분장</h3>
              <span className="text-[12px] text-neutral-500">누르면 해야 할 일 · 매뉴얼 · 서식</span>
            </div>
            {duties.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-neutral-400">"{query}"에 맞는 업무분장 카드가 없습니다.</p>
            ) : (
              <div className={gridCls}>
                {duties.map((duty, i) => (
                  <DutyCard key={duty.key} duty={duty} month={month} loaded={tasksLoaded && !opening} index={i} onOpen={open} />
                ))}
              </div>
            )}
          </section>

          {others.length > 0 && (
            <section className="space-y-5">
              <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-black/[0.06] pb-3">
                <h3 className="text-[20px] font-semibold text-neutral-900">그 밖의 업무 카드</h3>
                <span className="text-[12px] text-neutral-500">업무분장 항목을 고르면 위 카드 자리로 옮겨 가요 ([ EDIT ])</span>
              </div>
              <div className={gridCls}>
                {others.map((t, i) => (
                  <TaskCard key={t.id} task={t} index={i} canEdit={canEdit} onToggleStatus={onToggleStatus} onEdit={onEditTask} onDelete={onDeleteTask} onSchedule={scheduleCard} />
                ))}
              </div>
            </section>
          )}

          {common.length > 0 && (
            <section className="space-y-5">
              <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-black/[0.06] pb-3">
                <h3 className="text-[20px] font-semibold text-neutral-900">부서 공통</h3>
                <span className="text-[12px] text-neutral-500">모든 보직 탭에 보여요</span>
              </div>
              <div className={gridCls}>
                {common.map((t, i) => (
                  <TaskCard key={t.id} task={t} index={i} canEdit={canEdit} onToggleStatus={onToggleStatus} onEdit={onEditTask} onDelete={onDeleteTask} onSchedule={scheduleCard} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {openDuty && (
        <DutyModal
          duty={openDuty}
          task={openDuty.task}
          month={month}
          canEdit={canEdit}
          onClose={() => setOpenKey(null)}
          onSchedule={onSchedule}
          onOpenTool={(id) => {
            setOpenKey(null);
            setTool(id);
          }}
        />
      )}
    </div>
  );
}
