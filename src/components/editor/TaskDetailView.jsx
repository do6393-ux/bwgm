import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { sanitizeHtml } from "@/lib/sanitize";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { ArrowLeft } from "lucide-react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

const CATEGORIES = [
  { id: "devices", label: "💻 계정 및 기기" },
  { id: "network", label: "🌐 네트워크/서버" },
  { id: "privacy", label: "🛡️ 보안점검" },
  { id: "software", label: "🔑 SW관리자" },
  { id: "disposal", label: "📊 행정/공시" },
];

const STATUS_MAP = {
  todo: { label: "대기중", next: "doing", color: "bg-[#555555] text-white" },
  doing: { label: "진행중", next: "done", color: "bg-[#0055FF] text-white" },
  done: { label: "완료됨", next: "todo", color: "bg-[#00E599] text-black" },
};

function TaskDetailView({ taskId, currentUser }) {
  const [task, setTask] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    category: "devices",
    status: "todo",
    summary: "",
  });

  const containerRef = useRef(null);
  const quillInstanceRef = useRef(null);

  // 편집 모드에 들어갈 때의 본문만 에디터에 넣는다.
  // (편집 중에 실시간 갱신이 와도 에디터가 초기화되지 않도록 ref 로 들고 있는다)
  const contentRef = useRef("");
  useEffect(() => {
    contentRef.current = task?.content || "";
  }, [task?.content]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "work_tasks", taskId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        setTask(data);
        setEditForm({
          title: data.title || "",
          category: data.category || "devices",
          status: data.status || "todo",
          summary: data.summary || "",
        });
      }
    });
    return () => unsub();
  }, [taskId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!isEditing || !container) return;

    container.innerHTML = "";
    const editorDiv = document.createElement("div");
    container.appendChild(editorDiv);

    const quill = new Quill(editorDiv, {
      theme: "snow",
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: ["#000000", "#0055FF", "#FF5000"] }, { background: [] }],
          [{ align: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image"],
          ["clean"],
        ],
      },
    });

    quill.root.innerHTML = contentRef.current;
    quillInstanceRef.current = quill;

    return () => {
      quillInstanceRef.current = null;
      container.innerHTML = "";
    };
  }, [isEditing]);

  const handleToggleStatus = async () => {
    if (!task) return;
    const nextStatus = STATUS_MAP[task.status]?.next || "todo";
    await updateDoc(doc(db, "work_tasks", taskId), { status: nextStatus });
  };

  const handleSave = async () => {
    const htmlContent = quillInstanceRef.current ? quillInstanceRef.current.root.innerHTML : (task?.content || "");
    await updateDoc(doc(db, "work_tasks", taskId), {
      title: editForm.title,
      category: editForm.category,
      status: editForm.status,
      summary: editForm.summary,
      content: htmlContent,
    });
    setIsEditing(false);
  };

  if (!task) return <div className="p-20 text-center font-mono opacity-50 uppercase tracking-widest">Loading task telemetry...</div>;

  const currentStatusInfo = STATUS_MAP[task.status] || STATUS_MAP.todo;

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-black font-sans font-light selection:bg-[#0055FF] selection:text-white pb-32">
      <style dangerouslySetInnerHTML={{__html: `
        .ql-toolbar.ql-snow {
          border: 1px solid rgba(0,0,0,0.15) !important;
          border-bottom: none !important;
          background: #FFFFFF;
          border-radius: 0 !important;
          font-family: 'Space Mono', monospace !important;
          padding: 12px 24px !important;
        }
        .ql-container.ql-snow {
          border: 1px solid rgba(0,0,0,0.15) !important;
          border-radius: 0 !important;
          font-family: 'Pretendard', sans-serif !important;
          font-size: 16px !important;
          background: #FAFAFA;
        }
        .ql-editor {
          min-height: 450px;
          line-height: 1.8;
          padding: 28px !important;
          font-weight: 300;
        }
        .ql-editor p { margin-bottom: 0.8em; }
        .ql-editor img { max-width: 100%; border-radius: 4px; }
      `}} />

      <header className="w-full border-b border-[#D0D0D0] bg-white px-8 py-6 flex justify-between items-center">
        <button onClick={() => window.close()} className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-widest hover:text-[#0055FF] transition-colors">
          <ArrowLeft className="w-4 h-4" /> close terminal
        </button>
        {currentUser && (
          <div className="flex gap-4 font-mono text-[13px] uppercase tracking-widest">
            {isEditing ? (
              <>
                <button onClick={() => setIsEditing(false)} className="opacity-50 hover:opacity-100">[ cancel ]</button>
                <button onClick={handleSave} className="text-[#0055FF] font-bold">[ save task ]</button>
              </>
            ) : (
              <button onClick={() => setIsEditing(true)} className="hover:text-[#0055FF]">[ edit mode ]</button>
            )}
          </div>
        )}
      </header>

      <main className="max-w-[1000px] mx-auto px-6 pt-16 w-full">
        {isEditing ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="space-y-4 bg-white border border-[#D0D0D0] p-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full bg-[#FAFAFA] border border-[#D0D0D0] p-3 text-[14px] outline-none focus:border-[#0055FF]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full bg-[#FAFAFA] border border-[#D0D0D0] p-3 text-[14px] outline-none focus:border-[#0055FF] font-mono"
                >
                  <option value="todo">대기중 (TODO)</option>
                  <option value="doing">진행중 (DOING)</option>
                  <option value="done">완료됨 (DONE)</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="업무 제목"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full bg-[#FAFAFA] border border-[#D0D0D0] p-3 text-[16px] font-bold outline-none focus:border-[#0055FF]"
              />
              <textarea
                placeholder="업무 요약 설명..."
                value={editForm.summary}
                onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                className="w-full bg-[#FAFAFA] border border-[#D0D0D0] p-3 text-[14px] h-24 resize-none outline-none focus:border-[#0055FF]"
              />
            </div>

            <div className="pt-2">
              <label className="block text-[12px] font-mono opacity-60 mb-2 uppercase tracking-widest">TASK PROTOCOL CONTENT</label>
              <div ref={containerRef} className="shadow-sm" />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="border-b border-[#D0D0D0] pb-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 text-[11px] font-mono border border-black uppercase tracking-widest bg-black text-white">
                  {CATEGORIES.find((c) => c.id === task.category)?.label || task.category}
                </span>
                <button
                  onClick={handleToggleStatus}
                  title="클릭하여 상태 변경"
                  className={`px-3 py-1 text-[11px] font-mono uppercase tracking-widest font-bold transition-transform active:scale-95 ${currentStatusInfo.color}`}
                >
                  {currentStatusInfo.label} ↻
                </button>
              </div>
              <h1 className="text-[38px] font-normal tracking-tight leading-tight mb-4">{task.title}</h1>
              {task.summary && (
                <p className="text-[16px] text-gray-600 leading-relaxed font-light border-l-2 border-[#0055FF] pl-4 my-4">
                  {task.summary}
                </p>
              )}
            </div>

            <div
              className="ql-editor p-0 bg-transparent min-h-0"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(task.content || "<p class='opacity-30 font-mono tracking-widest uppercase text-sm'>No content written yet.</p>"),
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default TaskDetailView;