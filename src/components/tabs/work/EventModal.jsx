import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { deleteWorkEvent, saveWorkEvent } from "@/lib/workEvents";
import { NOTE_MAX, TITLE_MAX, addDays, dateKey, defaultStart, formatPeriod, validateEvent } from "@/lib/workCalendar";
import { PARTS, findPart } from "@/lib/workParts";

const QUICK_END = [
  { label: "오늘", days: 0 },
  { label: "+3일", days: 3 },
  { label: "+1주", days: 7 },
  { label: "+2주", days: 14 },
];

const fieldLabel = "block text-[11px] font-mono text-neutral-500 mb-1";
const fieldBox = "w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors";

/**
 * 일정 입력·수정 창. 달력의 날짜 칸, 카드의 [ + 일정 ], 기존 일정 클릭에서 모두 이 창을 쓴다.
 * initial: { id?, taskId?, title?, part?, start?, end?, note?, done? }   (id 가 있으면 수정)
 * 마감일만 고르면 시작일은 오늘로 자동 설정되고, 시작일을 직접 고르면 그 값을 쓴다.
 */
export default function EventModal({ initial, tasks, onClose }) {
  const { toast, confirm } = useDialog();
  const today = dateKey(new Date());
  const isEdit = !!initial.id;

  const [form, setForm] = useState({
    taskId: initial.taskId || "",
    title: initial.title || "",
    part: findPart(initial.part).id,
    start: initial.start || "",
    end: initial.end || "",
    note: initial.note || "",
    done: !!initial.done,
  });
  const [startTouched, setStartTouched] = useState(!!initial.start); // 시작일을 직접 고른 적이 있나
  const [saving, setSaving] = useState(false);

  const start = startTouched ? form.start : defaultStart(form.end, today);
  const linkedTask = tasks.find((t) => t.id === form.taskId);

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  // 카드를 고르면 이름과 파트를 가져온다. 이름을 직접 고쳐 둔 상태라면 이름은 그대로 둔다.
  const pickTask = (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return update({ taskId: "" });
    const keepTitle = form.title.trim() && form.title !== (linkedTask?.title ?? "");
    update({ taskId, title: keepTitle ? form.title : task.title, part: findPart(task.part).id });
  };

  const submit = async (e) => {
    e.preventDefault();
    const data = { ...form, title: form.title.trim(), note: form.note.trim(), start };
    const problem = validateEvent(data);
    if (problem) return toast(problem, "info");
    setSaving(true);
    try {
      await saveWorkEvent(initial.id, data);
      toast(isEdit ? "일정을 수정했습니다." : `${formatPeriod(data.start, data.end)} 일정을 달력에 넣었습니다.`, "success");
      onClose();
    } catch (err) {
      console.error("work event save:", err);
      toast(
        err?.code === "permission-denied"
          ? "저장할 권한이 없습니다. firestore.rules 를 Firebase 에 올렸는지 확인해 주세요."
          : "저장하지 못했습니다. 연결을 확인해 주세요.",
        "error"
      );
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm(`"${form.title}" 일정을 삭제하시겠습니까?`, { danger: true, confirmText: "삭제" }))) return;
    try {
      await deleteWorkEvent(initial.id);
      toast("일정을 삭제했습니다.", "success");
      onClose();
    } catch (err) {
      console.error("work event delete:", err);
      toast("삭제하지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
    }
  };

  return (
    <div className="ui-fade ui-scrim fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-card p-6 md:p-8 max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-black/[0.08] ui-pop" role="dialog" aria-label={isEdit ? "일정 수정" : "달력에 넣기"}>
        <div className="flex justify-between items-start border-b border-black/[0.06] pb-4 mb-6">
          <div>
            <span className="text-[11px] font-mono text-accent uppercase tracking-wider block mb-1">// SCHEDULE</span>
            <h3 className="text-[22px] md:text-[24px] font-normal tracking-tight text-neutral-900">{isEdit ? "일정 수정" : "달력에 넣기"}</h3>
          </div>
          {linkedTask && (
            <button
              type="button"
              onClick={() => window.open(`?task=${linkedTask.id}`, "_blank")}
              className="flex items-center gap-1 font-mono text-[11px] text-neutral-500 hover:text-accent transition-colors"
              title="이 일정의 업무 카드(매뉴얼·서식)를 새 창으로 연다"
            >
              카드 열기 <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={fieldLabel} htmlFor="ev-task">업무 카드</label>
            <select id="ev-task" value={form.taskId} onChange={(e) => pickTask(e.target.value)} className={fieldBox}>
              <option value="">직접 입력 (카드 없음)</option>
              {form.taskId && !linkedTask && <option value={form.taskId}>(삭제된 카드)</option>}
              {PARTS.map((p) => {
                const list = tasks.filter((t) => findPart(t.part).id === p.id);
                return list.length === 0 ? null : (
                  <optgroup key={p.id} label={`${p.icon} ${p.label}`}>
                    {list.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="ev-title">TITLE</label>
            <input
              id="ev-title"
              type="text"
              value={form.title}
              maxLength={TITLE_MAX}
              placeholder="이번에 해야 할 일 (예: 개인정보 파일 파기 보고)"
              onChange={(e) => update({ title: e.target.value })}
              className={`${fieldBox} text-[15px] font-medium`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={fieldLabel} htmlFor="ev-end">마감일</label>
              <input id="ev-end" type="date" value={form.end} onChange={(e) => update({ end: e.target.value })} className={`${fieldBox} font-mono`} />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="ev-start">
                시작일 {!startTouched && <span className="text-neutral-400">(자동)</span>}
              </label>
              <input
                id="ev-start"
                type="date"
                value={start}
                onChange={(e) => {
                  setStartTouched(true);
                  update({ start: e.target.value });
                }}
                className={`${fieldBox} font-mono`}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <span className="font-mono text-[11px] text-neutral-400 mr-1">마감일 빠르게</span>
            {QUICK_END.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => update({ end: addDays(today, q.days) })}
                className="px-3 py-1 rounded-full text-[12px] bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border border-black/[0.04] transition-colors"
              >
                {q.label}
              </button>
            ))}
            <button
              type="button"
              disabled={!form.end}
              onClick={() => {
                setStartTouched(true);
                update({ start: form.end });
              }}
              className="px-3 py-1 rounded-full text-[12px] bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border border-black/[0.04] transition-colors disabled:opacity-40"
              title="시작일을 마감일과 같게 (하루짜리 일정)"
            >
              하루만
            </button>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="ev-part">PART (담당 파트)</label>
            <select id="ev-part" value={form.part} onChange={(e) => update({ part: e.target.value })} className={fieldBox}>
              {PARTS.map((p) => (
                <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="ev-note">메모 (공문 번호, 요청 내용 등)</label>
            <textarea
              id="ev-note"
              value={form.note}
              maxLength={NOTE_MAX}
              onChange={(e) => update({ note: e.target.value })}
              className={`${fieldBox} h-24 resize-none`}
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-[13px] text-neutral-700 cursor-pointer select-none">
              <input type="checkbox" checked={form.done} onChange={(e) => update({ done: e.target.checked })} className="w-4 h-4 accent-[rgb(var(--c-accent))]" />
              완료했음
            </label>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-black/[0.06]">
            {isEdit ? (
              <button type="button" onClick={remove} className="font-mono text-[12px] text-neutral-400 hover:text-red-500 transition-colors">
                [ DEL ]
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors">
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-accent text-white px-6 py-2.5 rounded-full font-medium text-[13px] hover:bg-accent-strong transition-all shadow-sm active:scale-95 disabled:opacity-60"
              >
                {saving ? "저장 중…" : "저장하기"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
