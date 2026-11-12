import { useState } from "react";
import { CalendarPlus, ExternalLink, Pencil, Plus } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import EquipModal from "../equipment/EquipModal";
import TaskAttachments from "@/components/editor/TaskAttachments";
import { sanitizeHtml } from "@/lib/sanitize";
import { TITLE_MAX } from "@/lib/workCalendar";
import { findPart } from "@/lib/workParts";
import { ROLE_META, TODO_TEXT_MAX, TOOLS, WHEN_OPTIONS, isLate, newTodoId, patchTodo, sortTodos, todoProgress, validateTodo } from "@/lib/workDuties";
import { saveTodos } from "@/lib/workDutiesApi";

const fieldBox = "bg-neutral-50 border border-neutral-200 rounded-field px-3 text-[14px] outline-none focus:border-accent transition-colors";
const ghostBtn = "inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border border-black/[0.12] bg-white text-neutral-800 text-[13px] font-medium hover:border-black/30 transition-colors";

/**
 * 업무분장 카드를 눌렀을 때 뜨는 창: 해야 할 일(시기 + 체크) · 매뉴얼 · 서식.
 * 매뉴얼 글은 예전처럼 ?task=ID 상세 창에서 고친다. 할 일 · 서식은 여기서 바로 저장된다.
 * task 는 TabWork 가 실시간으로 넘겨준다 (처음 여는 카드는 만들어지는 동안 잠깐 null).
 */
export default function DutyModal({ duty, task, month, canEdit, onClose, onSchedule, onOpenTool }) {
  const { toast, confirm } = useDialog();
  const [editing, setEditing] = useState(null); // { id, when, text }
  const [draft, setDraft] = useState({ when: `${month}월`, text: "" });
  const [busy, setBusy] = useState(false);

  const part = findPart(duty.part);
  const todos = task?.todos || [];
  const sorted = sortTodos(todos);
  const { done, total } = todoProgress(todos);
  const title = duty.title;
  const alias = task?.title && task.title !== duty.title ? task.title : null; // 예전 카드를 이 자리에 넣었을 때

  const save = async (next, okMessage) => {
    if (!task) return false;
    setBusy(true);
    try {
      await saveTodos(task.id, next);
      if (okMessage) toast(okMessage, "success");
      return true;
    } catch (err) {
      console.error("duty todos save:", err);
      toast("저장하지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const problem = validateTodo(draft, todos.length);
    if (problem) return toast(problem, "info");
    const ok = await save([...todos, { id: newTodoId(), when: draft.when, text: draft.text.trim(), done: false }]);
    if (ok) setDraft((d) => ({ ...d, text: "" }));
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const problem = validateTodo(editing);
    if (problem) return toast(problem, "info");
    const ok = await save(patchTodo(todos, editing.id, { when: editing.when, text: editing.text.trim() }));
    if (ok) setEditing(null);
  };

  const remove = async (todo) => {
    if (!(await confirm(`"${todo.text}" 할 일을 지울까요?`, { danger: true, confirmText: "지우기" }))) return;
    const ok = await save(todos.filter((t) => t.id !== todo.id));
    if (ok) setEditing(null);
  };

  const resetYear = async () => {
    if (!(await confirm("체크를 모두 지울까요? 할 일 목록은 그대로 남고 체크만 풀려요. (새 학년을 시작할 때)", { confirmText: "체크 지우기" }))) return;
    save(todos.map((t) => ({ ...t, done: false })), "체크를 모두 지웠어요.");
  };

  return (
    <EquipModal eyebrow={`${ROLE_META[duty.part]?.tab || part.label} › 업무분장`} title={title} onClose={onClose} size="max-w-2xl">
      {!task ? (
        <p className="py-10 text-center text-[13px] text-neutral-500">카드를 준비하는 중…</p>
      ) : (
        <div className="space-y-8">
          {/* 해야 할 일 */}
          <section className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <h4 className="text-[16px] font-semibold text-neutral-900">해야 할 일</h4>
              {total > 0 && (
                <span className="font-mono text-[12px] text-neutral-500">
                  {done} / {total}
                </span>
              )}
            </div>

            {sorted.length === 0 && (
              <p className="rounded-field bg-neutral-50 border border-dashed border-neutral-300 px-4 py-5 text-[13px] text-neutral-500 leading-relaxed">
                아직 적힌 할 일이 없어요. 아래에 시기와 할 일을 적어 두면 보직 탭 맨 위 "이번 달에 할 일"에도 모여서 보여요.
              </p>
            )}

            <ul className="space-y-2">
              {sorted.map((todo) =>
                editing?.id === todo.id ? (
                  <li key={todo.id}>
                    <form onSubmit={saveEdit} className="flex flex-wrap items-center gap-2 p-2.5 rounded-field bg-accent/[0.04] border border-accent/30">
                      <select
                        aria-label="시기"
                        value={editing.when}
                        onChange={(e) => setEditing({ ...editing, when: e.target.value })}
                        className={`${fieldBox} h-11`}
                      >
                        {WHEN_OPTIONS.map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                      <input
                        aria-label="할 일"
                        autoFocus
                        value={editing.text}
                        maxLength={TODO_TEXT_MAX}
                        onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                        className={`${fieldBox} h-11 flex-[999_1_220px] min-w-0`}
                      />
                      <div className="flex gap-1.5">
                        <button type="submit" disabled={busy} className="min-h-[44px] px-4 rounded-full bg-accent text-white text-[13px] font-medium hover:bg-accent-strong disabled:opacity-50">
                          저장
                        </button>
                        <button type="button" onClick={() => remove(todo)} disabled={busy} className="min-h-[44px] px-3 rounded-full text-[13px] text-red-600 hover:bg-red-50">
                          지우기
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="min-h-[44px] px-3 rounded-full text-[13px] text-neutral-500 hover:text-neutral-900">
                          취소
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={todo.id} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-field bg-neutral-50 border border-black/[0.06]">
                    <label className="flex flex-1 min-w-0 items-center gap-3 min-h-[44px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!todo.done}
                        disabled={!canEdit || busy}
                        onChange={() => save(patchTodo(todos, todo.id, { done: !todo.done }))}
                        className="w-[18px] h-[18px] shrink-0 accent-[rgb(var(--c-accent))]"
                      />
                      <span
                        className={`shrink-0 min-w-[44px] px-2 py-0.5 rounded-md border text-center text-[12px] font-semibold ${
                          isLate(todo, month) ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-black/10 text-accent"
                        }`}
                      >
                        {todo.when}
                      </span>
                      <span className={`min-w-0 text-[14px] break-keep ${todo.done ? "text-neutral-400 line-through" : "text-neutral-900"}`}>{todo.text}</span>
                    </label>
                    {canEdit && (
                      <span className="flex shrink-0">
                        <button
                          type="button"
                          onClick={() => onSchedule({ taskId: task.id, title: todo.text.slice(0, TITLE_MAX), part: duty.part })}
                          title="달력에 넣기"
                          aria-label={`${todo.text} 달력에 넣기`}
                          className="w-10 h-10 flex items-center justify-center rounded-lg text-neutral-500 hover:text-accent hover:bg-white"
                        >
                          <CalendarPlus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing({ id: todo.id, when: todo.when, text: todo.text })}
                          title="고치기"
                          aria-label={`${todo.text} 고치기`}
                          className="w-10 h-10 flex items-center justify-center rounded-lg text-neutral-500 hover:text-accent hover:bg-white"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </span>
                    )}
                  </li>
                )
              )}
            </ul>

            {canEdit && (
              <form onSubmit={add} className="flex flex-wrap items-center gap-2 pt-1">
                <select
                  aria-label="새 할 일 시기"
                  value={draft.when}
                  onChange={(e) => setDraft({ ...draft, when: e.target.value })}
                  className={`${fieldBox} h-11`}
                >
                  {WHEN_OPTIONS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
                <input
                  aria-label="새 할 일"
                  value={draft.text}
                  maxLength={TODO_TEXT_MAX}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  placeholder="예) 공문 확인하고 담임 선생님께 안내"
                  className={`${fieldBox} h-11 flex-[999_1_220px] min-w-0`}
                />
                <button type="submit" disabled={busy} className={`${ghostBtn} disabled:opacity-50`}>
                  <Plus className="w-4 h-4" />할 일 추가
                </button>
              </form>
            )}

            {canEdit && done > 0 && (
              <button type="button" onClick={resetYear} disabled={busy} className="min-h-[44px] px-1 text-[13px] text-neutral-500 hover:text-neutral-900">
                새 학년 시작 · 체크 모두 지우기
              </button>
            )}
          </section>

          {duty.tool && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-field bg-accent/[0.05] border border-accent/20 px-4 py-3">
              <p className="text-[13px] text-neutral-700">이 업무는 {TOOLS[duty.tool].label} 장부에서 해요.</p>
              <button type="button" onClick={() => onOpenTool(duty.tool)} className="min-h-[44px] px-4 rounded-full bg-accent text-white text-[13px] font-medium hover:bg-accent-strong">
                {TOOLS[duty.tool].label} 열기
              </button>
            </section>
          )}

          {/* 매뉴얼 */}
          <section className="space-y-2.5 border-t border-black/[0.06] pt-6">
            <h4 className="text-[16px] font-semibold text-neutral-900">매뉴얼</h4>
            {alias && <p className="text-[13px] text-neutral-500">카드 이름: {alias}</p>}
            {task.summary && <p className="text-[13px] text-neutral-600">{task.summary}</p>}
            {task.content?.replace(/<[^>]*>/g, "").trim() || /<img/i.test(task.content || "") ? (
              <div
                className="ql-editor !p-4 rounded-field bg-neutral-50 text-[14px] leading-relaxed text-neutral-800 max-h-[320px] overflow-y-auto [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.content) }}
              />
            ) : (
              <p className="text-[13px] text-neutral-500">아직 매뉴얼이 없어요. 아래 "매뉴얼 고치기"를 누르면 새 창에서 글 · 사진 · 표를 넣을 수 있어요.</p>
            )}
          </section>

          {/* 서식 · 첨부 (올리거나 지우면 바로 저장) */}
          <TaskAttachments taskId={task.id} attachments={task.attachments || []} canEdit={canEdit} />

          <div className="flex flex-wrap justify-end gap-2 border-t border-black/[0.06] pt-5">
            <button type="button" onClick={() => window.open(`?task=${task.id}`, "_blank")} className={ghostBtn}>
              매뉴얼 고치기 <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={onClose} className="min-h-[44px] px-5 rounded-full bg-neutral-900 text-white text-[13px] font-semibold">
              닫기
            </button>
          </div>
        </div>
      )}
    </EquipModal>
  );
}
