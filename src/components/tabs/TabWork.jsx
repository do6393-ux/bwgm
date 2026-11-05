import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { sanitizeHtml } from "@/lib/sanitize";
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { ExternalLink, Plus, RefreshCw, Search, X } from "lucide-react";

const CATEGORIES = [
  { id: "all", label: "전체 업무", code: "ALL" },
  { id: "devices", label: "계정 및 기기", code: "DEV", icon: "💻" },
  { id: "network", label: "네트워크/서버", code: "NET", icon: "🌐" },
  { id: "privacy", label: "보안점검", code: "SEC", icon: "🛡️" },
  { id: "software", label: "SW관리자", code: "SFT", icon: "🔑" },
  { id: "disposal", label: "행정/공시", code: "ADM", icon: "📊" },
];

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
    badge: "bg-[#0066FF]/[0.08] hover:bg-[#0066FF]/[0.14] text-[#0066FF] border-[#0066FF]/20",
    dot: "bg-[#0066FF]",
    glow: "shadow-[0_0_8px_rgba(0,102,255,0.6)] animate-pulse",
    next: "done",
  },
  done: {
    label: "완료",
    badge: "bg-[#00A86B]/[0.08] hover:bg-[#00A86B]/[0.14] text-[#00965E] border-[#00A86B]/20",
    dot: "bg-[#00A86B]",
    glow: "shadow-[0_0_6px_rgba(0,168,107,0.5)]",
    next: "todo",
  },
};

function TabWork({ currentUser }) {
  // 이 탭은 정보 업무 권한자(관리자 + 허용된 교사)에게만 렌더링되므로 등록·수정·삭제도 모두 가능.
  // 실제 통제는 firestore.rules 의 hasWorkAccess() 가 한다.
  const canEdit = !!currentUser;
  const [tasks, setTasks] = useState([]);
  const [selectedCat, setSelectedCat] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);

  const [taskForm, setTaskForm] = useState({
    category: "devices",
    status: "todo",
    title: "",
    summary: "",
    content: "",
  });

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "work_tasks"), orderBy("createdAt", "desc")), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const stats = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    doing: tasks.filter((t) => t.status === "doing").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  const filteredTasks = tasks.filter((t) => {
    if (selectedCat !== "all" && t.category !== selectedCat) return false;
    if (selectedStatus !== "all" && t.status !== selectedStatus) return false;
    
    if (searchKeyword.trim()) {
      const q = searchKeyword.trim().toLowerCase();
      const titleMatch = (t.title || "").toLowerCase().includes(q);
      const summaryMatch = (t.summary || "").toLowerCase().includes(q);
      const plainContent = (t.content || "").replace(/<[^>]*>/g, "").toLowerCase();
      const contentMatch = plainContent.includes(q) || (t.content || "").toLowerCase().includes(q);
      
      if (!titleMatch && !summaryMatch && !contentMatch) return false;
    }

    return true;
  });

  const handleToggleStatus = async (taskId, currentStatus) => {
    const nextStatus = STATUS_MAP[currentStatus]?.next || "todo";
    await updateDoc(doc(db, "work_tasks", taskId), { status: nextStatus });
  };

  const handleOpenAddModal = () => {
    setEditingTaskId(null);
    setTaskForm({ category: "devices", status: "todo", title: "", summary: "", content: "" });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (task) => {
    setEditingTaskId(task.id);
    setTaskForm({
      category: task.category || "devices",
      status: task.status || "todo",
      title: task.title || "",
      summary: task.summary || "",
      content: task.content || "",
    });
    setIsModalOpen(true);
  };

  const handleSubmitTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return alert("업무 제목을 입력해주세요.");

    if (editingTaskId) {
      await updateDoc(doc(db, "work_tasks", editingTaskId), {
        category: taskForm.category,
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
    <div className="space-y-16 animate-in fade-in duration-500 pb-20">
      <section className="border border-black/[0.08] bg-[#F4F4F6] rounded-3xl p-5 md:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-black/[0.06] pb-6 md:mb-6 mb-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-[#0066FF] shadow-[0_0_8px_#0066FF] animate-pulse"></span>
                <span className="font-semibold text-neutral-700">TASK CONTROL MATRIX</span>
              </div>
              <h2 className="text-[26px] md:text-[32px] font-normal tracking-tight text-neutral-900 leading-tight">
                정보기획 업무 관제탑
              </h2>
            </div>

            <div className="relative flex items-center mt-1 sm:mt-5">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="업무 제목, 내용 검색..."
                className="pl-9 pr-8 py-2 rounded-full text-[13px] bg-white/90 border border-black/[0.08] text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-[#0066FF] focus:bg-white focus:ring-2 focus:ring-[#0066FF]/15 transition-all w-60 sm:w-72 shadow-sm font-sans"
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
              className="flex items-center gap-2 bg-[#0066FF] hover:bg-[#0055DD] text-white px-5 py-2.5 rounded-full font-sans text-[13px] font-medium transition-all shadow-sm active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>새 업무 등록</span>
            </button>
          )}
        </div>

        <div className="hidden md:grid grid-cols-4 gap-4 text-[13px]">
          <div 
            onClick={() => setSelectedStatus("all")}
            className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${
              selectedStatus === "all" ? "border-neutral-800 shadow-[0_4px_12px_rgba(0,0,0,0.1)]" : "border-black/[0.06] hover:border-black/[0.15]"
            }`}
          >
            <span className="block text-neutral-500 text-[11px] font-mono mb-1">TOTAL WORK</span>
            <span className="text-[22px] font-semibold text-neutral-900">{stats.total}</span>
          </div>

          <div 
            onClick={() => setSelectedStatus("todo")}
            className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${
              selectedStatus === "todo" ? "border-neutral-400 shadow-[0_4px_12px_rgba(0,0,0,0.08)]" : "border-black/[0.06] hover:border-black/[0.15]"
            }`}
          >
            <span className="block text-neutral-500 text-[11px] font-mono mb-1">WAITING (대기)</span>
            <span className="text-[22px] font-semibold text-neutral-600">{stats.todo}</span>
          </div>

          <div 
            onClick={() => setSelectedStatus("doing")}
            className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${
              selectedStatus === "doing" ? "border-[#0066FF] shadow-[0_4px_16px_rgba(0,102,255,0.2)]" : "border-black/[0.06] hover:border-[#0066FF]/40"
            }`}
          >
            <span className="block text-[#0066FF]/60 text-[11px] font-mono mb-1">IN PROGRESS (진행)</span>
            <span className="text-[22px] font-semibold text-[#0066FF]">{stats.doing}</span>
          </div>

          <div 
            onClick={() => setSelectedStatus("done")}
            className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${
              selectedStatus === "done" ? "border-[#00A86B] shadow-[0_4px_16px_rgba(0,168,107,0.2)]" : "border-black/[0.06] hover:border-[#00A86B]/40"
            }`}
          >
            <span className="block text-[#00A86B]/60 text-[11px] font-mono mb-1">COMPLETED (완료)</span>
            <span className="text-[22px] font-semibold text-[#00965E]">{stats.done}</span>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex justify-between items-center border-b border-black/[0.06] pb-4">
          <div className="flex overflow-x-auto whitespace-nowrap gap-2 py-1 no-scrollbar">
            {CATEGORIES.map((c) => {
              const isActive = selectedCat === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCat(c.id)}
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
          {filteredTasks.length === 0 ? (
            <div className="col-span-full py-20 text-center font-mono text-neutral-400 text-sm">
              {searchKeyword ? `"${searchKeyword}"에 일치하는 업무가 없습니다.` : "NO TASKS RECORDED IN THIS VIEW."}
            </div>
          ) : (
            filteredTasks.map((t) => {
              const statusInfo = STATUS_MAP[t.status] || STATUS_MAP.todo;
              const catObj = CATEGORIES.find((c) => c.id === t.category);

              return (
                <div
                  key={t.id}
                  onClick={() => window.open(`?task=${t.id}`, "_blank")}
                  className="flex flex-col justify-between border border-black/[0.08] bg-white rounded-2xl p-6 h-full hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer group"
                >
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[11px] font-mono text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-md">
                        {catObj?.icon} {catObj?.code || t.category}
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

                    <h4 className="text-[19px] font-medium text-neutral-900 group-hover:text-[#0066FF] transition-colors leading-snug mb-2">
                      {t.title}
                    </h4>
                    {t.summary && (
                      <p className="text-[13px] text-neutral-500 font-light leading-relaxed mb-4 line-clamp-2">
                        {t.summary}
                      </p>
                    )}

                    {t.content && (
                      <div
                        className="text-[13px] text-neutral-600 border-t border-black/[0.05] pt-3 my-2 line-clamp-3 leading-relaxed font-light opacity-80"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.content) }}
                      />
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-black/[0.05] flex justify-between items-center text-[12px]">
                    <span className="text-neutral-400 group-hover:text-neutral-900 flex items-center gap-1 font-mono text-[11px] transition-colors">
                      OPEN TERMINAL <ExternalLink className="w-3 h-3 ml-0.5" />
                    </span>

                    {canEdit && (
                      <div className="flex items-center gap-3 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenEditModal(t)}
                          className="text-neutral-400 hover:text-[#0066FF] transition-colors"
                        >
                          [ EDIT ]
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm("해당 업무를 삭제하시겠습니까?")) {
                              await deleteDoc(doc(db, "work_tasks", t.id));
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-xl w-full shadow-2xl border border-black/[0.08] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-black/[0.06] pb-4 mb-6">
              <div>
                <span className="text-[11px] font-mono text-[#0066FF] uppercase tracking-wider block mb-1">
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
                  <label className="block text-[11px] font-mono text-neutral-500 mb-1">CATEGORY</label>
                  <select
                    value={taskForm.category}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-[14px] outline-none focus:border-[#0066FF] transition-colors"
                  >
                    {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-neutral-500 mb-1">STATUS</label>
                  <select
                    value={taskForm.status}
                    onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-[14px] outline-none focus:border-[#0066FF] transition-colors font-mono"
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
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-[15px] outline-none focus:border-[#0066FF] font-medium transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">SUMMARY</label>
                <input
                  type="text"
                  placeholder="업무 핵심 요약 (한 줄 설명)"
                  value={taskForm.summary}
                  onChange={(e) => setTaskForm({ ...taskForm, summary: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-[14px] outline-none focus:border-[#0066FF] transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-neutral-500 mb-1">DETAILS (HTML/TEXT)</label>
                <textarea
                  placeholder="업무 진행 매뉴얼 및 세부 내용을 입력하세요..."
                  value={taskForm.content}
                  onChange={(e) => setTaskForm({ ...taskForm, content: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-[14px] h-32 resize-none outline-none focus:border-[#0066FF] transition-colors"
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
                  className="bg-[#0066FF] text-white px-6 py-2.5 rounded-full font-medium text-[13px] hover:bg-[#0055DD] transition-all shadow-sm active:scale-95"
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