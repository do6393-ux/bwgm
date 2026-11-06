// 정보 수업 탭의 "과제" 칸: 과제 목록. 누르면 새 탭에서 과제 화면(?assignment=ID)이 열린다.
// 교사는 여기서 과제를 올리고, 관리 화면(?manage=assignments)으로 갈 수 있다.
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { saveHomework, useClassSettings, useHomeworkList, deleteHomework } from "@/lib/homeworkApi";
import HomeworkForm from "./HomeworkForm";
import { DueBadge } from "./HomeworkView";

export default function HomeworkSection({ currentUser, currentTheme }) {
  const { confirm, toast } = useDialog();
  const { list, loaded, error } = useHomeworkList();
  const isTeacher = !!currentUser;
  const { classes: settings } = useClassSettings(isTeacher);
  const [adding, setAdding] = useState(false);

  // 학생에게는 받는 중인 과제를 위에, 마감된 과제를 아래에
  const ordered = [...list].sort((a, b) => (a.open === false) - (b.open === false));

  const remove = async (h) => {
    const ok = await confirm(`"${h.title}" 과제와 제출물을 모두 삭제할까요? 되돌릴 수 없어요.`, { danger: true, confirmText: "삭제" });
    if (!ok) return;
    try {
      await deleteHomework(h.id);
      toast("삭제했어요.", "success");
    } catch (err) {
      console.error("delete homework:", err);
      toast("삭제하지 못했어요. 권한이나 연결을 확인해 주세요.", "error");
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex justify-between items-end border-b border-line pb-6 gap-4">
        <h3 className={`text-[28px] font-normal tracking-tight ${currentTheme.activeText}`}>과제</h3>
        {isTeacher && (
          <div className="flex gap-5 text-[14px] font-mono uppercase">
            <a href="?manage=assignments" target="_blank" rel="noreferrer" className="opacity-50 hover:opacity-100">[ manage ]</a>
            <button onClick={() => setAdding(!adding)} className="opacity-50 hover:opacity-100">{adding ? "[ close ]" : "[ + add ]"}</button>
          </div>
        )}
      </div>

      {adding && isTeacher && (
        <div className="border-b border-line pb-8">
          <HomeworkForm
            classOptions={settings}
            submitLabel="post"
            onSubmit={async (data) => {
              const id = await saveHomework(null, data);
              setAdding(false);
              toast("과제를 올렸어요. 과제를 누르면 학생에게 보낼 주소가 열려요.", "success");
              return id;
            }}
          />
        </div>
      )}

      <div className="border-t border-b border-line">
        {!loaded ? (
          <SkeletonGroup label="과제를 불러오는 중">
            {[0, 1].map((i) => (
              <div key={i} className="py-6 border-b last:border-0 border-line flex items-center gap-4">
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-5 w-2/5" />
              </div>
            ))}
          </SkeletonGroup>
        ) : error ? (
          <p className="py-8 text-[14px] font-mono opacity-50 text-center">과제를 불러오지 못했어요.</p>
        ) : ordered.length === 0 ? (
          <p className="py-8 text-[14px] font-mono opacity-40 uppercase tracking-widest text-center">no assignments.</p>
        ) : (
          ordered.map((h, i) => (
            <div
              key={h.id}
              style={{ "--i": Math.min(i, 8) }}
              className={`group flex flex-col md:flex-row md:items-center gap-2 md:gap-6 py-5 border-b last:border-0 border-line ui-enter ${h.open === false ? "opacity-50" : ""}`}
            >
              <a
                href={`?assignment=${h.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 flex items-center gap-4 hover:text-accent transition-colors"
              >
                <span className="font-mono text-[13px] opacity-40 w-8 shrink-0">{String(list.length - list.indexOf(h)).padStart(2, "0")}</span>
                <span className="text-[18px] font-medium truncate">{h.title}</span>
                <ArrowUpRight className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
              <div className="flex flex-wrap items-center gap-3 pl-12 md:pl-0">
                {(h.classes || []).length > 0 && <span className="text-[12px] font-mono opacity-50">{h.classes.join(" · ")}</span>}
                <DueBadge due={h.due} open={h.open} />
                {isTeacher && (
                  <button
                    onClick={() => remove(h)}
                    className="text-[12px] font-mono uppercase text-danger opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
                  >
                    [ del ]
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {!isTeacher && <p className="text-[12px] font-mono opacity-50">과제를 누르면 새 창에서 내용을 보고 제출할 수 있어요.</p>}
    </section>
  );
}
