// 교사용 과제 입력 (새 과제 / 과제 고치기)
import { useState } from "react";
import { BODY_MAX, TITLE_MAX, classLabel, sortClassIds, validateHomework } from "@/lib/homework";

const field = "w-full bg-transparent border border-line p-4 text-[16px] outline-none focus:border-ink transition-colors";

export default function HomeworkForm({ initial = {}, classOptions = [], onSubmit, onCancel, submitLabel = "save", showOpen = false }) {
  const [title, setTitle] = useState(initial.title || "");
  const [body, setBody] = useState(initial.body || "");
  const [due, setDue] = useState(initial.due || "");
  const [classes, setClasses] = useState(initial.classes || []);
  const [open, setOpen] = useState(initial.open !== false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // 반 설정에 없지만 과제에 이미 들어 있는 반도 고를 수 있게 남겨 둔다
  const options = sortClassIds([...classOptions.map((c) => c.id), ...classes]);
  const grades = [...new Set(options.map((id) => id.split("-")[0]))];

  const toggle = (id) => setClasses((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : sortClassIds([...cur, id])));
  const toggleGrade = (g) => {
    const ids = options.filter((id) => id.startsWith(`${g}-`));
    const all = ids.every((id) => classes.includes(id));
    setClasses((cur) => sortClassIds(all ? cur.filter((c) => !ids.includes(c)) : [...cur, ...ids]));
  };

  const submit = async (e) => {
    e.preventDefault();
    const data = { title, body, due, classes, open };
    const problem = validateHomework(data);
    if (problem) return setError(problem);
    setError(null);
    setSaving(true);
    try {
      await onSubmit(data);
    } catch (err) {
      console.error("save homework:", err);
      setError("저장하지 못했어요. 연결이나 보안 규칙 게시 여부를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <input type="text" placeholder="과제 제목" maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,240px)_1fr] gap-5">
        <div>
          <label htmlFor="hw-due" className="block text-[13px] font-mono opacity-60 mb-2 uppercase tracking-widest">마감일 (선택)</label>
          <div className="flex gap-2">
            <input id="hw-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} p-3 font-mono text-[15px]`} />
            {due && (
              <button type="button" onClick={() => setDue("")} className="px-3 border border-line font-mono text-[12px] hover:border-ink shrink-0">
                없음
              </button>
            )}
          </div>
        </div>
        <div>
          <span className="block text-[13px] font-mono opacity-60 mb-2 uppercase tracking-widest">대상 반</span>
          {options.length === 0 ? (
            <p className="text-[13px] opacity-60 leading-relaxed pt-2">
              관리 화면의 <b>반 설정</b>에서 반과 인원을 넣으면 여기서 고를 수 있어요. 고르지 않으면 제출이 들어온 반으로 현황을 보여 줘요.
            </p>
          ) : (
            <div className="space-y-2">
              {grades.map((g) => (
                <div key={g} className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => toggleGrade(g)} className="font-mono text-[12px] opacity-60 hover:opacity-100 mr-1">
                    {g}학년 전체
                  </button>
                  {options
                    .filter((id) => id.startsWith(`${g}-`))
                    .map((id) => {
                      const on = classes.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggle(id)}
                          aria-pressed={on}
                          title={classLabel(id)}
                          className={`min-w-[44px] px-2 py-1.5 border font-mono text-[13px] transition-colors ${on ? "bg-ink text-page border-ink" : "border-line hover:border-ink"}`}
                        >
                          {id}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <textarea
          placeholder={"과제 내용\n학생에게 보이는 안내문이에요. 링크(https://...)는 눌러서 열 수 있게 보여요."}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${field} h-48 resize-y leading-relaxed`}
        />
        <div className="text-right text-[12px] font-mono opacity-40">{body.length} / {BODY_MAX}</div>
      </div>

      {showOpen && (
        <label className="flex items-center gap-2 text-[14px] cursor-pointer w-fit">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="w-4 h-4 accent-black" />
          제출 받는 중 <span className="opacity-50">(끄면 학생이 더 낼 수 없어요)</span>
        </label>
      )}

      {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="bg-black text-white px-8 py-3 text-[14px] font-mono uppercase hover:bg-accent transition-colors disabled:opacity-50">
          {saving ? "saving..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-6 py-3 text-[14px] font-mono uppercase opacity-60 hover:opacity-100">
            cancel
          </button>
        )}
      </div>
    </form>
  );
}
