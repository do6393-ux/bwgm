import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, deleteDoc, deleteField, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { useDialog } from "@/components/ui/dialogContext";
import { deleteTaskFiles } from "@/lib/taskAttachments";
import { DEFAULT_PART, PARTS, findPart } from "@/lib/workParts";
import { DUTIES, ROLE_META, findDuty, takenDutyKeys, visibleParts } from "@/lib/workDuties";
import { watchDuties } from "@/lib/workDutiesApi";
import WorkCalendar from "./work/WorkCalendar";
import EventModal from "./work/EventModal";
import RolePanel from "./work/duty/RolePanel";
import LinksPanel from "./work/links/LinksPanel";

const NEXT_STATUS = { todo: "doing", doing: "done", done: "todo" };
const VIEW_KEY = "work_view"; // 마지막으로 본 작은 탭 (이 브라우저에만)

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}
function writeView(v) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // 저장이 막힌 브라우저면 다음에 첫 탭으로 연다
  }
}

const EMPTY_FORM = { part: DEFAULT_PART, duty: "", status: "todo", title: "", summary: "", content: "" };

/**
 * 정보 업무 탭.
 * 작은 탭 = 보직 탭(부장 · 정보기획 · 기기·소모품 · 나이스·공시) + 달력 + 바로가기·연락처.
 * 관리자 · 부장 · 보직 미정은 보직 탭 4개가 다 보이고, 다른 선생님은 자기 보직 탭 하나만 보인다
 * (teachers/{이메일}.workRole, 관리자가 teachers 화면에서 고른다).
 * ⚠️ 보이는 탭만 나누는 것이고, 데이터 접근은 firestore.rules 의 hasWorkAccess() 그대로다.
 * 업무분장 목록은 work_config/duties (없으면 workDuties.js 의 DUTIES). 관리자 · 부장만 고칠 수 있다.
 */
function TabWork({ currentUser, admin, workRole }) {
  const { confirm, toast } = useDialog();
  // 이 탭은 정보 업무 권한자(관리자 + 허용된 교사)에게만 렌더링되므로 등록·수정·삭제도 모두 가능.
  const canEdit = !!currentUser;
  const parts = visibleParts({ admin, workRole });
  const views = [...parts, "calendar", "links"];
  const EXTRA_VIEWS = { calendar: "달력", links: "바로가기·연락처" };
  const canEditDuties = admin || workRole === "head"; // firestore.rules 의 isWorkHead() 와 같다

  const [tasks, setTasks] = useState([]);
  const [tasksLoaded, setTasksLoaded] = useState(false); // 첫 응답 전에는 "할 일 없음" 대신 불러오는 중을 보여 준다
  const [savedView, setSavedView] = useState(readView);
  const view = views.includes(savedView) ? savedView : views[0];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [eventDraft, setEventDraft] = useState(null); // [ + 일정 ] · 할 일의 달력 버튼으로 열리는 일정 창의 초기값
  const [taskForm, setTaskForm] = useState(EMPTY_FORM);
  const [savedDuties, setSavedDuties] = useState(null);
  const [dutiesLoaded, setDutiesLoaded] = useState(false);
  const duties = savedDuties || DUTIES;

  useEffect(
    () =>
      watchDuties((list) => {
        setSavedDuties(list);
        setDutiesLoaded(true);
      }),
    []
  );

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "work_tasks"), orderBy("createdAt", "desc")),
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTasksLoaded(true);
      },
      (err) => { console.error("work_tasks listener:", err); setTasksLoaded(true); } // 실패해도 불러오는 중이 남지 않게
    );
    return () => unsub();
  }, []);

  const pickView = (v) => {
    setSavedView(v);
    writeView(v);
  };

  const handleToggleStatus = async (task) => {
    await updateDoc(doc(db, "work_tasks", task.id), { status: NEXT_STATUS[task.status] || "todo" });
  };

  const handleOpenAddModal = (part) => {
    setEditingTaskId(null);
    setTaskForm({ ...EMPTY_FORM, part });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (task) => {
    setEditingTaskId(task.id);
    setTaskForm({
      part: findPart(task.part).id,
      duty: findDuty(task.duty, duties) ? task.duty : "", // 목록에서 뺀 항목이면 비운다
      status: task.status || "todo",
      title: task.title || "",
      summary: task.summary || "",
      content: task.content || "",
    });
    setIsModalOpen(true);
  };

  const handleDeleteTask = async (t) => {
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
  };

  const handleSubmitTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return toast("업무 제목을 입력해 주세요.", "info");
    const base = {
      part: taskForm.part,
      status: taskForm.status,
      title: taskForm.title.trim(),
      summary: taskForm.summary.trim(),
      content: taskForm.content,
    };

    try {
      if (editingTaskId) {
        await updateDoc(doc(db, "work_tasks", editingTaskId), { ...base, duty: taskForm.duty || deleteField() });
      } else {
        await addDoc(collection(db, "work_tasks"), { ...base, ...(taskForm.duty ? { duty: taskForm.duty } : {}), createdAt: serverTimestamp() });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("work task save:", err);
      toast("저장하지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
    }
  };

  const dutyChoices = duties[taskForm.part] || [];
  const taken = takenDutyKeys(tasks, editingTaskId, duties);

  return (
    <div className="space-y-12 ui-enter pb-20">
      <div role="tablist" aria-label="보직" className="flex flex-wrap w-fit max-w-full gap-1 rounded-full bg-black/[0.06] p-1">
        {views.map((v) => {
          const active = view === v;
          const part = EXTRA_VIEWS[v] ? null : findPart(v);
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => pickView(v)}
              className={`flex items-center gap-2 px-4 md:px-5 py-2 rounded-full text-[13px] font-medium transition-all ${
                active ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {part && <span className={`w-2 h-2 rounded-full ${part.dot}`} aria-hidden="true" />}
              {part ? ROLE_META[v].tab : EXTRA_VIEWS[v]}
            </button>
          );
        })}
      </div>

      {view === "calendar" ? (
        <WorkCalendar tasks={tasks} canEdit={canEdit} />
      ) : view === "links" ? (
        <LinksPanel canEdit={canEdit} defaultPart={parts.length === 1 ? parts[0] : "common"} />
      ) : (
        <RolePanel
          key={view}
          part={view}
          duties={duties}
          tasks={tasks}
          tasksLoaded={tasksLoaded && dutiesLoaded}
          canEdit={canEdit}
          canEditDuties={canEditDuties}
          email={currentUser?.email?.toLowerCase() || ""}
          onAddTask={handleOpenAddModal}
          onEditTask={handleOpenEditModal}
          onDeleteTask={handleDeleteTask}
          onToggleStatus={handleToggleStatus}
          onSchedule={setEventDraft}
        />
      )}

      {eventDraft && <EventModal initial={eventDraft} tasks={tasks} onClose={() => setEventDraft(null)} />}

      {isModalOpen && (
        <div className="ui-fade ui-scrim fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 md:p-8 max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-black/[0.08] ui-pop">
            <div className="flex justify-between items-start border-b border-black/[0.06] pb-4 mb-6">
              <div>
                <span className="text-[11px] font-mono text-accent uppercase tracking-wider block mb-1">
                  // TASK DISPATCH
                </span>
                <h3 className="text-[24px] font-normal tracking-tight text-neutral-900">
                  {editingTaskId ? "업무 수정" : "카드 따로 만들기"}
                </h3>
              </div>
            </div>

            <form onSubmit={handleSubmitTask} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="task-part" className="block text-[11px] font-mono text-neutral-500 mb-1">PART (담당 보직)</label>
                  <select
                    id="task-part"
                    value={taskForm.part}
                    onChange={(e) => {
                      const part = e.target.value;
                      // 다른 보직으로 옮기면 그 보직에 없는 업무분장 항목은 비운다
                      const keep = (duties[part] || []).some((x) => x.key === taskForm.duty);
                      setTaskForm({ ...taskForm, part, duty: keep ? taskForm.duty : "" });
                    }}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors"
                  >
                    {PARTS.map((p) => (
                      <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="task-status" className="block text-[11px] font-mono text-neutral-500 mb-1">STATUS</label>
                  <select
                    id="task-status"
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

              {dutyChoices.length > 0 && (
                <div>
                  <label htmlFor="task-duty" className="block text-[11px] font-mono text-neutral-500 mb-1">업무분장 항목</label>
                  <select
                    id="task-duty"
                    value={taskForm.duty}
                    onChange={(e) => setTaskForm({ ...taskForm, duty: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors"
                  >
                    <option value="">없음 (그 밖의 업무 카드)</option>
                    {dutyChoices.map((x) => (
                      <option key={x.key} value={x.key} disabled={taken.has(x.key) && x.key !== taskForm.duty}>
                        {x.title}
                        {taken.has(x.key) ? " (이미 카드 있음)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[12px] text-neutral-500">고르면 이 카드가 그 업무분장 카드 자리로 들어가요. 매뉴얼 · 서식도 같이 가요.</p>
                </div>
              )}

              <div>
                <label htmlFor="task-title" className="block text-[11px] font-mono text-neutral-500 mb-1">TITLE</label>
                <input
                  id="task-title"
                  type="text"
                  placeholder="업무 제목을 입력하세요"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[15px] outline-none focus:border-accent font-medium transition-colors"
                />
              </div>

              <div>
                <label htmlFor="task-summary" className="block text-[11px] font-mono text-neutral-500 mb-1">SUMMARY</label>
                <input
                  id="task-summary"
                  type="text"
                  placeholder="업무 핵심 요약 (한 줄 설명)"
                  value={taskForm.summary}
                  onChange={(e) => setTaskForm({ ...taskForm, summary: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label htmlFor="task-content" className="block text-[11px] font-mono text-neutral-500 mb-1">DETAILS (HTML/TEXT)</label>
                <textarea
                  id="task-content"
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
