import { nextTodo, todoProgress, TOOLS } from "@/lib/workDuties";

/**
 * 업무분장 항목 카드 한 장. 누르면 해야 할 일 · 매뉴얼 · 서식 창(DutyModal)이 열린다.
 * duty: { key, title, tool?, part, task|null }  (task 가 없으면 아직 한 번도 안 연 카드)
 */
export default function DutyCard({ duty, month, loaded, index, onOpen }) {
  const { task } = duty;
  const todos = task?.todos || [];
  const { done, total } = todoProgress(todos);
  const next = nextTodo(todos, month);
  const pct = total ? Math.round((done / total) * 100) : 0;
  // 예전 카드를 이 자리에 넣었으면 그 카드 이름도 작게 보여 준다
  const alias = task?.title && task.title !== duty.title ? task.title : null;

  const tags = [];
  if (task?.content?.replace(/<[^>]*>/g, "").trim()) tags.push("매뉴얼");
  if (task?.attachments?.length) tags.push(`서식 ${task.attachments.length}`);
  if (duty.tool) tags.push(`도구: ${TOOLS[duty.tool].label}`);

  return (
    <button
      type="button"
      onClick={() => onOpen(duty)}
      disabled={!loaded}
      style={{ "--i": Math.min(index, 8) }}
      className="ui-enter flex flex-col gap-3.5 text-left p-5 md:p-6 rounded-panel bg-white border border-black/[0.08] hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all disabled:cursor-wait group"
    >
      <span className="flex flex-col gap-1">
        <span className="text-[17px] font-semibold leading-snug text-neutral-900 group-hover:text-accent transition-colors break-keep">{duty.title}</span>
        {alias && <span className="text-[12px] text-neutral-500 break-keep">카드: {alias}</span>}
      </span>

      {!loaded ? (
        <span className="text-[13px] text-neutral-400">불러오는 중…</span>
      ) : total > 0 ? (
        <span className="flex flex-col gap-2 w-full">
          <span className="flex justify-between text-[12px] text-neutral-600">
            <span>해야 할 일</span>
            <span className="font-mono">
              {done} / {total}
            </span>
          </span>
          <span className="block h-1.5 rounded-full bg-neutral-200 overflow-hidden" aria-hidden="true">
            <span className="block h-1.5 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </span>
          {next ? (
            <span className="text-[13px] text-neutral-700 line-clamp-2">
              <span className={`font-semibold ${next.late ? "text-red-700" : "text-accent"}`}>
                {next.late ? "지남" : "다음"} · {next.todo.when}
              </span>{" "}
              {next.todo.text}
            </span>
          ) : (
            <span className="text-[13px] font-medium text-ok-strong">올해 할 일 다 했어요</span>
          )}
        </span>
      ) : (
        <span className="text-[13px] text-neutral-500">해야 할 일이 아직 없어요 · 눌러서 적기</span>
      )}

      {tags.length > 0 && (
        <span className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-black/[0.06] w-full">
          {tags.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded-md bg-neutral-100 text-[12px] text-neutral-600">
              {t}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
