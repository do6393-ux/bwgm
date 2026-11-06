import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { sanitizeHtml } from "@/lib/sanitize";
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { ExternalLink, Paperclip, Plus, RefreshCw, Search, X } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { deleteTaskFiles } from "@/lib/taskAttachments";
import { DEFAULT_PART, PARTS, findPart } from "@/lib/workParts";
import WorkCalendar from "./work/WorkCalendar";
import EventModal from "./work/EventModal";

const VIEWS = [
  { id: "cards", label: "업무 카드" },
  { id: "calendar", label: "달력" },
];

const PART_FILTERS = [{ id: "all", label: "전체 업무" }, ...PARTS];

const STATUS_MAP = {
  todo: {
    label: "대기",
    badge: "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-600 border-black/[0.06]",
    dot: "bg-neutral-400",
    glow: "",
    next: "doing",
  },
  doing: {
    label: "진행",
    badge: "bg-accent/[0.08] hover:bg-accent/[0.14] text-accent border-accent/20",
    dot: "bg-accent",
    glow: "shadow-[0_0_8px_rgba(0,102,255,0.6)] animate-pulse",
    next: "done",
  },
  done: {
    label: "완료",
    badge: "bg-ok/[0.08] hover:bg-ok/[0.14] text-ok-strong border-ok/20",
    dot: "bg-ok",
    glow: "shadow-[0_0_6px_rgba(0,168,107,0.5)]",
    next: "todo",
  },
};

function TabWork({ currentUser }) {
  const { confirm, toast } = useDialog();
  // 이 탭은 정보 업무 권한자(관리자 + 허용된 교사)에게만 렌더링되므로 등록·수정·삭제도 모두 가능.
  // 실제 통제는 firestore.rules 의 hasWorkAccess() 가 한다.
  const canEdit = !!currentUser;
  const [tasks, setTasks] = useState([]);
  const [tasksLoaded, setTasksLoaded] = useState(false); // 첫 응답 전에는 숫자 0 / "업무 없음" 대신 자리 표시를 보여 준다
  const [selectedPart, setSelectedPart] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [view, setView] = useState("cards"); // "cards" | "calendar"
  const [eventDraft, setEventDraft] = useState(null); // 카드에서 [ + 일정 ] 을 눌렀을 때 열리는 일정 창의 초기값

  const [taskForm, setTaskForm] = useState({
    part: DEFAULT_PART,
    status: "todo",
    title: "",
    summary: "",
    content: "",
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "work_tasks"), orderBy("createdAt", "desc")),
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTasksLoaded(true);
      },
      (err) => { console.error("work_tasks listener:", err); setTasksLoaded(true); } // 실패해도 스켈레톤이 남지 않게
    );
    return () => unsub();
  }, []);

  const stats = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    doing: tasks.filter((t) => t.status === "doing").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  const filteredTasks = tasks.filter((t) => {
    if (selectedPart !== "all" && findPart(t.part).id !== selectedPart) return false;
    if (selectedStatus !== "all" && t.status !== selectedStatus) return false;
    
    if (searchKeyword.trim()) {
      const q = searchKeyword.trim().toLowerCase();
      const titleMatch = (t.title || "").toLowerCase().includes(q);
      const summaryMatch = (t.summary || "").toLowerCase().includes(q);
      const plainContent = (t.content || "").replace(/<[^>]*>/g, "").toLowerCase();
      const contentMatch = plainContent.includes(q) || (t.content || "").toLowerCase().includes(q);
      const fileMatch = (t.attachments || []).some((a) => (a.name || "").toLowerCase().includes(q));

      if (!titleMatch && !summaryMatch && !contentMatch && !fileMatch) return false;
    }

    return true;
  });

  const handleToggleStatus = async (taskId, currentStatus) => {
    const nextStatus = STATUS_MAP[currentStatus]?.next || "todo";
    await updateDoc(doc(db, "work_tasks", taskId), { status: nextStatus });
  };

  const handleOpenAddModal = () => {
    setEditingTaskId(null);
    // 특정 파트를 보고 있다가 새 업무를 등록하면 그 파트로 시작한다
    setTaskForm({ part: selectedPart === "all" ? DEFAULT_PART : selectedPart, status: "todo", title: "", summary: "", content: "" });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (task) => {
    setEditingTaskId(task.id);
    setTaskForm({
      part: findPart(task.part).id,
      status: task.status || "todo",
      title: task.title || "",
      summary: task.summary || "",
      content: task.content || "",
    });
    setIsModalOpen(true);
  };

  const handleSubmitTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return toast("업무 제목을 입력해 주세요.", "info");

    if (editingTaskId) {
      await updateDoc(doc(db, "work_tasks", editingTaskId), {
        part: taskForm.part,
        status: taskForm.status,
        title: taskForm.title.trim(),
        summary: taskForm.summary.trim(),
        content: taskForm.content,
      });
    } else {
      await addDoc(collection(db, "work_tasks"), {
        ...taskForm,
        createdAt: serverTimestamp(),
      });
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-16 ui-enter pb-20">
      <div role="tablist" aria-label="보기 전환" className="flex w-fit gap-1 rounded-full bg-black/[0.06] p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={`px-5 py-2 rounded-full text-[13px] font-medium transition-all ${
              view === v.id ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <WorkCalendar tasks={tasks} canEdit={canEdit} />
      ) : (
        <>
          <section className="border border-black/[0.08] bg-well rounded-card p-5 md:p-8 shadow-sm">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-black/[0.06] pb-6 md:mb-6 mb-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-2 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
                    <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_#0066FF] animate-pulse"></span>
                    <span className="font-semibold text-neutral-700">TASK CONTROL MATRIX</span>
                  </div>
                  <h2 className="text-[26px] md:text-[32px] font-normal tracking-tight text-neutral-900 leading-tight">
                    정보부 업무
                  </h2>
                </div>

                <div className="relative flex items-center mt-1 sm:mt-5">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="업무 제목, 내용 검색..."
                    className="pl-9 pr-8 py-2 rounded-full text-[13px] bg-white/90 border border-black/[0.08] text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/15 transition-all w-60 sm:w-72 shadow-sm font-sans"
                  />
                  {searchKeyword && (
                    <button
                      type="button"
                      onClick={() => setSearchKeyword("")}
                      className="absolute right-3 text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {canEdit && (
                <button
                  onClick={handleOpenAddModal}
                  className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white px-5 py-2.5 rounded-full font-sans text-[13px] font-medium transition-all shadow-sm active:scale-95 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>새 업무 등록</span>
                </button>
              )}
            </div>

            <div className="hidden md:grid grid-cols-4 gap-4 text-[13px]">
              <div 
                onClick={() => setSelectedStatus("all")}
                className={`p-4 rounded-panel cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${
                  selectedStatus === "all" ? "border-neutral-800 shadow-[0_4px_12px_rgba(0,0,0,0.1)]" : "border-black/[0.06] hover:border-black/[0.15]"
                }`}
              >
                <span className="block text-neutral-500 text-[11px] font-mono mb-1">TOTAL WORK</span>
                <span className="text-[22px] font-semibold text-neutral-900">{tasksLoaded ? stats.total : "–"}</span>
              </div>

              <div 
                onClick={() => setSelectedStatus("todo")}
                className={`p-4 rounded-panel cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${
                  selectedStatus === "todo" ? "border-neutral-400 shadow-[0_4px_12px_rgba(0,0,0,0.08)]" : "border-black/[0.06] hover:border-black/[0.15]"
                }`}
              >
                <span className="block text-neutral-500 text-[11px] font-mono mb-1">WAITING (대기)</span>
                <span className="text-[22px] font-semibold text-neutral-600">{tasksLoaded ? stats.todo : "–"}</span>
              </div>

              <div 
                onClick={() => setSelectedStatus("doing")}
                className={`p-4 rounded-panel cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${
                  selectedStatus === "doing" ? "border-accent shadow-[0_4px_16px_rgba(0,102,255,0.2)]" : "border-black/[0.06] hover:border-accent/40"
                }`}
              >
                <span className="block text-accent/60 text-[11px] font-mono mb-1">IN PROGRESS (진행)</span>
                <span className="text-[22px] font-semibold text-accent">{tasksLoaded ? stats.doing : "–"}</span>
              </div>

              <div 
                onClick={() => setSelectedStatus("done")}
                className={`p-4 rounded-panel cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${
                  selectedStatus === "done" ? "border-ok shadow-[0_4px_16px_rgba(0,168,107,0.2)]" : "border-black/[0.06] hover:border-ok/40"
                }`}
              >
                <span className="block text-ok/60 text-[11px] font-mono mb-1">COMPLETED (완료)</span>
                <span className="text-[22px] font-semibold text-ok-strong">{tasksLoaded ? stats.done : "–"}</span>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex justify-between items-center border-b border-black/[0.06] pb-4">
              <div className="flex overflow-x-auto whitespace-nowrap gap-2 py-1 no-scrollbar">
                {PART_FILTERS.map((c) => {
                  const isActive = selectedPart === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedPart(c.id)}
                      className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${
                        isActive
                          ? "bg-neutral-900 text-white shadow-sm"
                          : "bg-neutral-100/80 hover:bg-neutral-200/80 text-neutral-600 border border-black/[0.04]"
                      }`}
                    >
                      {c.icon && <span className="mr-1.5">{c.icon}</span>}
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <span className="font-mono text-[12px] text-neutral-400 hidden sm:inline-block">
                {filteredTasks.length} ITEMS {searchKeyword && `(FILTERED)`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {!tasksLoaded ? (
                <SkeletonGroup label="업무를 불러오는 중" className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`${i >= 1 ? "hidden md:flex" : "flex"} flex-col justify-between border border-black/[0.08] bg-white rounded-panel p-6`}>
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <Skeleton className="h-6 w-20" />
                          <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-6 w-4/5 mb-3" />
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-3/5" />
                      </div>
                      <div className="mt-6 pt-4 border-t border-black/[0.05]">
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                  ))}
                </SkeletonGroup>
              ) : filteredTasks.length === 0 ? (
                <div className="col-span-full py-20 text-center font-mono text-neutral-400 text-sm">
                  {searchKeyword ? `"${searchKeyword}"에 일치하는 업무가 없습니다.` : "NO TASKS RECORDED IN THIS VIEW."}
                </div>
              ) : (
                filteredTasks.map((t, i) => {
                  const statusInfo = STATUS_MAP[t.status] || STATUS_MAP.todo;
                  const part = findPart(t.part);

                  return (
                    <div
                      key={t.id}
                      style={{ "--i": Math.min(i, 8) }}
                      onClick={() => window.open(`?task=${t.id}`, "_blank")}
                      className="flex flex-col justify-between border border-black/[0.08] bg-white rounded-panel p-6 h-full hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer group ui-enter"
                    >
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-[11px] font-mono text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-md">
                            {part.icon} {part.label}
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canEdit) handleToggleStatus(t.id, t.status);
                            }}
                            title={canEdit ? "클릭하여 상태 전환 (대기 ➔ 진행 ➔ 완료)" : undefined}
                            className={`group/btn flex items-center gap-2 pl-2.5 pr-2 py-1 rounded-full border transition-all ${canEdit ? "active:scale-90" : "cursor-default"} ${statusInfo.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot} ${statusInfo.glow}`}></span>
                            <span className="text-[12px] font-medium tracking-tight">
                              {statusInfo.label}
                            </span>
                            {canEdit && <RefreshCw className="w-2.5 h-2.5 opacity-30 group-hover/btn:opacity-90 group-hover/btn:rotate-180 transition-all duration-300 ml-0.5" />}
                          </button>
                        </div>

                        <h4 className="text-[19px] font-medium text-neutral-900 group-hover:text-accent transition-colors leading-snug mb-2">
                          {t.title}
                        </h4>
                        {t.summary && (
                          <p className="text-[13px] text-neutral-500 font-light leading-relaxed mb-4 line-clamp-2">
                            {t.summary}
                          </p>
                        )}

                        {t.content && (
                          <div
                            className="text-[13px] text-neutral-600 border-t border-black/[0.05] pt-3 my-2 line-clamp-3 leading-relaxed font-light opacity-80 [&_img]:hidden"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.content) }}
                          />
                        )}
                      </div>

                      <div className="mt-6 pt-4 border-t border-black/[0.05] flex flex-wrap justify-between items-center gap-x-3 gap-y-2 text-[12px]">
                        <span className="text-neutral-400 group-hover:text-neutral-900 flex items-center gap-3 font-mono text-[11px] transition-colors">
                          <span className="flex items-center gap-1">
                            OPEN TERMINAL <ExternalLink className="w-3 h-3 ml-0.5" />
                          </span>
                          {t.attachments?.length > 0 && (
                            <span className="flex items-center gap-1" title={`첨부파일 ${t.attachments.length}개`}>
                              <Paperclip className="w-3 h-3" /> {t.attachments.length}
                            </span>
                          )}
                        </span>

                        {canEdit && (
                          <div className="flex items-center gap-3 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setEventDraft({ taskId: t.id, title: t.title, part: part.id })}
                              title="이 업무를 달력에 넣기 (마감일을 정하면 시작일은 오늘로 자동)"
                              className="text-neutral-400 hover:text-accent transition-colors"
                            >
                              [ + 일정 ]
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(t)}
                              className="text-neutral-400 hover:text-accent transition-colors"
                            >
                              [ EDIT ]
                            </button>
                            <button
                              onClick={async () => {
                                if (!(await confirm(`"${t.title}" 업무를 삭제하시겠습니까?`, { danger: true, confirmText: "삭제" }))) return;
                                try {
                                  await deleteDoc(doc(db, "work_tasks", t.id));
                                  toast("삭제했습니다.", "success");
                                  // 카드가 사라진 뒤 딸린 첨부 조각을 치운다 (실패해도 카드 삭제는 이미 끝났으므로 조용히 로그만)
                                  deleteTaskFiles(t.id, t.attachments).catch((e) => console.error("task files cleanup:", e));
                                } catch (err) {
                                  console.error("work task delete:", err);
                                  toast("삭제하지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
                                }
                              }}
                              className="text-neutral-400 hover:text-red-500 transition-colors"
                            >
                              [ DEL ]
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}

      {eventDraft && <EventModal initial={eventDraft} tasks={tasks} onClose={() => setEventDraft(null)} />}

      {isModalOpen && (
        <div className="ui-fade ui-scrim fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-8 max-w-xl w-full shadow-2xl border border-black/[0.08] ui-pop">
            <div className="flex justify-between items-start border-b border-black/[0.06] pb-4 mb-6">
              <div>
                <span className="text-[11px] font-mono text-accent uppercase tracking-wider block mb-1">
                  // TASK DISPATCH
                </span>
                <h3 className="text-[24px] font-normal tracking-tight text-neutral-900">
                  {editingTaskId ? "업무 수정" : "새 업무 등록"}
                </h3>
              </div>
            </div>

            <form onSubmit={handleSubmitTask} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono text-neutral-500 mb-1">PART (담당 파트)</label>
                  <select
                    value={taskForm.part}
                    onChange={(e) => setTaskForm({ ...taskForm, part: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors"
                  >
                    {PARTS.map((p) => (
                      <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-neutral-500 mb-1">STATUS</label>
                  <select
                    value={taskForm.status}
                    onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors font-mono"
                  >
                    <option value="todo">대기중 (TODO)</option>
                    <option value="doing">진행중 (DOING)</option>
                    <option value="done">완료됨 (DONE)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">TITLE</label>
                <input
                  type="text"
                  placeholder="업무 제목을 입력하세요"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[15px] outline-none focus:border-accent font-medium transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">SUMMARY</label>
                <input
                  type="text"
                  placeholder="업무 핵심 요약 (한 줄 설명)"
                  value={taskForm.summary}
                  onChange={(e) => setTaskForm({ ...taskForm, summary: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">DETAILS (HTML/TEXT)</label>
                <textarea
                  placeholder="업무 진행 매뉴얼 및 세부 내용을 입력하세요..."
                  value={taskForm.content}
                  onChange={(e) => setTaskForm({ ...taskForm, content: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] h-32 resize-none outline-none focus:border-accent transition-colors"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="bg-accent text-white px-6 py-2.5 rounded-full font-medium text-[13px] hover:bg-accent-strong transition-all shadow-sm active:scale-95"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TabWork;