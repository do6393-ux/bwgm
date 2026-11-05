import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { sanitizeHtml } from "@/lib/sanitize";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { ArrowLeft } from "lucide-react";
import DetailPlaceholder from "./DetailPlaceholder";
import Quill from "quill";
import "quill/dist/quill.snow.css";

const UNITS = [
  { id: "all", label: "전체 자료" },
  { id: "unit1", label: "1단원 시스템" },
  { id: "unit2", label: "2단원 데이터" },
  { id: "unit3", label: "3단원 알고리즘" },
  { id: "unit4", label: "4단원 인공지능" },
  { id: "unit5", label: "5단원 디지털 문화" },
];

export default function LessonDetailView({ lessonId, currentUser }) {
  const [lesson, setLesson] = useState(null);
  const [loadError, setLoadError] = useState(null); // null | "missing"(없거나 삭제된 자료) | "error"(읽기 실패)
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    lessonNum: "",
    unit: "unit1",
    summary: ""
  });

  const containerRef = useRef(null);
  const quillInstanceRef = useRef(null);

  // 편집 모드에 들어갈 때의 본문만 에디터에 넣는다.
  // (편집 중에 실시간 갱신이 와도 에디터가 초기화되지 않도록 ref 로 들고 있는다)
  const contentRef = useRef("");
  useEffect(() => {
    contentRef.current = lesson?.content || "";
  }, [lesson?.content]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "lessons", lessonId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        setLesson(data);
        setEditForm({
          title: data.title || "",
          lessonNum: data.lessonNum || "",
          unit: data.unit || "unit1",
          summary: data.summary || ""
        });
      } else {
        setLoadError("missing");
      }
    }, (err) => {
      console.error("lesson listener:", err);
      setLoadError("error");
    });
    return () => unsub();
  }, [lessonId]);

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
          [{ color: ["#000000", "#FF5000", "#0055FF"] }, { background: [] }],
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

  const handleSave = async () => {
    const htmlContent = quillInstanceRef.current ? quillInstanceRef.current.root.innerHTML : (lesson?.content || "");
    await updateDoc(doc(db, "lessons", lessonId), {
      title: editForm.title,
      lessonNum: editForm.lessonNum,
      unit: editForm.unit,
      summary: editForm.summary,
      content: htmlContent
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (lesson) {
      setEditForm({
        title: lesson.title || "",
        lessonNum: lesson.lessonNum || "",
        unit: lesson.unit || "unit1",
        summary: lesson.summary || ""
      });
      if (quillInstanceRef.current) {
        quillInstanceRef.current.root.innerHTML = lesson.content || "";
      }
    }
    setIsEditing(false);
  };

  if (!lesson) return <DetailPlaceholder error={loadError} />;

  // 비공개로 전환된 자료는 로그인하지 않은 방문자(학생)에게 보여주지 않는다.
  // ⚠️ 화면에서만 가리는 것이다. Firestore 규칙상 lessons 는 공개 읽기라서
  //    자료 ID 를 아는 사람이 DB 를 직접 읽는 것까지 막지는 못한다.
  if (lesson.isVisible === false && !currentUser) {
    return <div className="p-20 text-center font-mono opacity-50 uppercase tracking-widest">비공개 자료입니다.</div>;
  }

  return (
    <div className="min-h-screen bg-white text-black font-sans font-light selection:bg-accent selection:text-white pb-32">
      <style dangerouslySetInnerHTML={{__html: `
        .ql-toolbar.ql-snow {
          border: 1px solid rgba(0,0,0,0.1) !important;
          border-bottom: none !important;
          background: rgba(255,255,255,0.95);
          border-radius: 0 !important;
          font-family: 'Space Mono', monospace !important;
          padding: 12px 24px !important;
        }
        .ql-container.ql-snow {
          border: 1px solid rgba(0,0,0,0.1) !important;
          border-radius: 0 !important;
          font-family: 'Pretendard', sans-serif !important;
          font-size: 18px !important;
          background: #FAFAFA;
        }
        .ql-editor {
          min-height: 500px;
          line-height: 1.8;
          padding: 32px !important;
          font-weight: 300;
        }
        .ql-editor p { margin-bottom: 0.8em; }
        .ql-editor img { max-width: 100%; border-radius: 4px; }
      `}} />

      <header className="w-full border-b border-line px-8 py-6 flex justify-between items-center">
        <button onClick={() => window.close()} className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-widest hover:text-accent transition-colors">
          <ArrowLeft className="w-4 h-4" /> close window
        </button>
        {currentUser && (
          <div className="flex gap-4 font-mono text-[13px] uppercase tracking-widest">
            {isEditing ? (
              <>
                <button onClick={handleCancel} className="opacity-50 hover:opacity-100">[ cancel ]</button>
                <button onClick={handleSave} className="text-accent font-bold">[ save all ]</button>
              </>
            ) : (
              <button onClick={() => setIsEditing(true)} className="hover:text-accent">[ edit mode ]</button>
            )}
          </div>
        )}
      </header>

      <main className="max-w-[1000px] mx-auto px-6 pt-16 w-full ui-enter">
        {isEditing ? (
          <div className="space-y-6 ui-enter">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  type="text" 
                  placeholder="자료 제목" 
                  value={editForm.title} 
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} 
                  className="w-full bg-white border border-line p-4 text-[16px] outline-none focus:border-black transition-colors"
                />
                <input 
                  type="text" 
                  placeholder="차시 (예: 1차시)" 
                  value={editForm.lessonNum} 
                  onChange={(e) => setEditForm({ ...editForm, lessonNum: e.target.value })} 
                  className="w-full bg-white border border-line p-4 text-[16px] outline-none focus:border-black transition-colors"
                />
              </div>
              <select 
                value={editForm.unit} 
                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} 
                className="w-full bg-white border border-line p-4 text-[16px] outline-none focus:border-black transition-colors"
              >
                {UNITS.filter(u => u.id !== "all").map(u => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
              <textarea 
                placeholder="요약 설명..." 
                value={editForm.summary} 
                onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })} 
                className="w-full bg-white border border-line p-4 text-[16px] outline-none h-28 resize-none focus:border-black transition-colors"
              />
            </div>

            <div className="pt-2">
              <label className="block text-[13px] font-mono opacity-60 mb-2 uppercase tracking-widest">content body</label>
              <div ref={containerRef} className="shadow-lg" />
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-12">
              <span className="inline-block px-3 py-1 text-[13px] font-mono border border-black uppercase tracking-widest bg-black text-white mb-4">
                {UNITS.find(u => u.id === lesson.unit)?.label || "UNIT"} / {lesson.lessonNum}
              </span>
              <h1 className="text-[42px] font-normal tracking-tight leading-tight mb-4">{lesson.title}</h1>
              <p className="text-[16px] opacity-50 leading-relaxed font-light">{lesson.summary}</p>
            </div>

            <div 
              className="ql-editor p-0 bg-transparent min-h-0" 
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.content || "<p class='opacity-30 font-mono tracking-widest uppercase text-sm'>No content written yet.</p>") }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
