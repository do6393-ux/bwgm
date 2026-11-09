import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { ExternalLink } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import HomeworkSection from "@/components/homework/HomeworkSection";
import LessonLibrary from "@/components/tabs/class/LessonLibrary";
import { LESSONS_HASH } from "@/lib/classSubtabs";

// 정보 수업 탭은 작은 탭 두 개로 나뉜다.
//   홈: 공지사항 · 외부 학습 도구 · 과제     단원별 수업 자료실: 단원별 자료 카드
// 자료실을 열면 주소 끝에 #lessons 가 붙어서, 새로고침해도 그대로이고 학생에게 링크로 바로 줄 수 있다.
const SUBTABS = [
  { id: "home", label: "홈" },
  { id: "lessons", label: "단원별 수업 자료실", shortLabel: "수업 자료실" },
];
const subtabFromHash = () => (window.location.hash === LESSONS_HASH ? "lessons" : "home");

const QUICK_TOOLS = [
  { id: "01", name: "엔트리", desc: "블록 코딩", url: "https://playentry.org" },
  { id: "02", name: "멘티미터", desc: "실시간 투표", url: "https://menti.com" },
  { id: "03", name: "인천에듀", desc: "교육 포털", url: "https://icedu.kr" },
  { id: "04", name: "자리배치", desc: "추첨 유틸리티", url: "https://letsgoteacher.kr/seat-arrangement.html" },
  { id: "05", name: "룰렛추첨", desc: "랜덤 뽑기", url: "https://lazygyu.github.io/roulette/" },
];

function TabClass({ currentUser, currentTheme }) {
  const [subtab, setSubtab] = useState(subtabFromHash);

  // 주소의 #lessons 를 직접 고치거나 뒤로 가기를 해도 따라간다
  useEffect(() => {
    const onHashChange = () => setSubtab(subtabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const selectSubtab = (id) => {
    setSubtab(id);
    const { pathname, search } = window.location;
    window.history.replaceState(null, "", id === "lessons" ? `${pathname}${search}${LESSONS_HASH}` : `${pathname}${search}`);
  };

  return (
    <div className="space-y-12 md:space-y-16 ui-enter">
      <nav aria-label="정보 수업 메뉴" className="grid grid-cols-2 md:inline-grid md:grid-flow-col md:auto-cols-max border border-black">
        {SUBTABS.map((tab, i) => {
          const active = subtab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectSubtab(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`px-4 md:px-8 py-3 text-[14px] md:text-[15px] font-medium tracking-tight whitespace-nowrap transition-colors ${
                i > 0 ? "border-l border-black" : ""
              } ${active ? "bg-black text-white" : "hover:bg-black/5"}`}
            >
              {tab.shortLabel ? (
                <>
                  <span className="md:hidden">{tab.shortLabel}</span>
                  <span className="hidden md:inline">{tab.label}</span>
                </>
              ) : (
                tab.label
              )}
            </button>
          );
        })}
      </nav>

      {/* 둘 다 띄워 두고 숨기기만 한다: 오가도 쓰던 글·고른 단원이 그대로 남는다 */}
      <div hidden={subtab !== "home"}>
        <ClassHome currentUser={currentUser} currentTheme={currentTheme} />
      </div>
      <div hidden={subtab !== "lessons"}>
        <LessonLibrary currentUser={currentUser} currentTheme={currentTheme} />
      </div>
    </div>
  );
}

// 홈: 공지사항 · 외부 학습 도구 · 과제
function ClassHome({ currentUser, currentTheme }) {
  const { confirm, toast } = useDialog();
  const [notices, setNotices] = useState([]);
  const [noticesLoaded, setNoticesLoaded] = useState(false); // 첫 응답이 오기 전에는 "공지 없음" 대신 스켈레톤을 보여 준다
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [newNotice, setNewNotice] = useState({ title: "", body: "", type: "normal" });
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [editNoticeData, setEditNoticeData] = useState({ title: "", body: "" });

  useEffect(() => {
    // 읽기에 실패해도(연결·권한) 스켈레톤이 영원히 남지 않도록 loaded 는 오류 때에도 올린다
    const unsubNotices = onSnapshot(
      query(collection(db, "notices"), orderBy("createdAt", "desc")),
      (snap) => {
        setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setNoticesLoaded(true);
      },
      (err) => { console.error("notices listener:", err); setNoticesLoaded(true); }
    );
    return () => {
      unsubNotices();
    };
  }, []);

  const handleCreateNotice = async (e) => {
    e.preventDefault();
    if (!newNotice.title.trim() || !newNotice.body.trim()) return;
    await addDoc(collection(db, "notices"), { ...newNotice, createdAt: serverTimestamp() });
    setNewNotice({ title: "", body: "", type: "normal" });
    setShowNoticeForm(false);
  };

  const handleUpdateNotice = async (e, id) => {
    e.preventDefault();
    if (!editNoticeData.title.trim() || !editNoticeData.body.trim()) return;
    await updateDoc(doc(db, "notices", id), { title: editNoticeData.title, body: editNoticeData.body });
    setEditingNoticeId(null);
  };

  // 삭제 전에 확인을 받고, 결과를 알려 준다
  const removeWithConfirm = async (collectionName, id, message) => {
    if (!(await confirm(message, { danger: true, confirmText: "삭제" }))) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      toast("삭제했습니다.", "success");
    } catch (err) {
      console.error("delete:", err);
      toast("삭제하지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
    }
  };

  return (
    <div className="space-y-24">
      {/* 1. 공지사항 */}
      <section className="space-y-8">
        <div className="flex justify-between items-end border-b border-line pb-6">
          <h3 className={`text-[28px] font-normal tracking-tight ${currentTheme.activeText}`}>공지사항</h3>
          {currentUser && (
            <button onClick={() => setShowNoticeForm(!showNoticeForm)} className="text-[14px] font-mono opacity-50 hover:opacity-100 uppercase">
              {showNoticeForm ? "[ close ]" : "[ + add ]"}
            </button>
          )}
        </div>

        {showNoticeForm && currentUser && (
          <form onSubmit={handleCreateNotice} className={`border-b ${currentTheme.border} pb-8 space-y-4`}>
            <input 
              type="text" placeholder="공지 제목" value={newNotice.title} onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
              className={`w-full bg-transparent border ${currentTheme.border} p-4 text-[16px] outline-none focus:border-black transition-colors`}
            />
            <textarea 
              placeholder="공지 내용..." value={newNotice.body} onChange={(e) => setNewNotice({ ...newNotice, body: e.target.value })}
              className={`w-full bg-transparent border ${currentTheme.border} p-4 text-[16px] outline-none h-32 resize-none focus:border-black transition-colors`}
            />
            <button type="submit" className="bg-black text-white px-8 py-3 text-[14px] font-mono uppercase hover:bg-accent transition-colors">
              submit
            </button>
          </form>
        )}

        <div className={`border-t border-b ${currentTheme.border}`}>
          {!noticesLoaded ? (
            <SkeletonGroup label="공지사항을 불러오는 중">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`flex flex-col py-6 border-b last:border-0 ${currentTheme.border} gap-3`}>
                  <Skeleton className="h-5 w-2/5" />
                  <Skeleton className="h-4 w-3/5" />
                </div>
              ))}
            </SkeletonGroup>
          ) : notices.length === 0 ? (
            <div className="py-8 text-[14px] font-mono opacity-40 uppercase tracking-widest text-center">no announcements.</div>
          ) : (
            notices.map((n, i) => (
              editingNoticeId === n.id ? (
                <form key={n.id} onSubmit={(e) => handleUpdateNotice(e, n.id)} className={`flex flex-col py-6 border-b last:border-0 ${currentTheme.border} gap-4`}>
                  <input value={editNoticeData.title} onChange={e => setEditNoticeData({...editNoticeData, title: e.target.value})} className={`w-full bg-transparent border ${currentTheme.border} p-3 text-[16px] outline-none focus:border-black transition-colors`} />
                  <textarea value={editNoticeData.body} onChange={e => setEditNoticeData({...editNoticeData, body: e.target.value})} className={`w-full bg-transparent border ${currentTheme.border} p-3 text-[15px] h-24 outline-none resize-none focus:border-black transition-colors`} />
                  <div className="flex justify-end gap-4 font-mono text-[12px] uppercase">
                    <button type="button" onClick={() => setEditingNoticeId(null)}>[ cancel ]</button>
                    <button type="submit" className="text-accent font-bold">[ save ]</button>
                  </div>
                </form>
              ) : (
                <div key={n.id} style={{ "--i": Math.min(i, 8) }} className={`flex flex-col py-6 border-b last:border-0 ${currentTheme.border} group ui-enter`}>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-[18px] font-medium">{n.title}</h4>
                    {currentUser && (
                      <div className="flex gap-3 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity text-[12px] font-mono uppercase">
                        <button onClick={() => { setEditingNoticeId(n.id); setEditNoticeData({ title: n.title, body: n.body }); }}>[ edit ]</button>
                        <button onClick={() => removeWithConfirm("notices", n.id, `"${n.title}" 공지를 삭제하시겠습니까?`)} className="text-red-500">[ del ]</button>
                      </div>
                    )}
                  </div>
                  <p className="text-[15px] opacity-60 leading-relaxed whitespace-pre-line max-w-2xl">
                    {n.body}
                  </p>
                </div>
              )
            ))
          )}
        </div>
      </section>

      {/* 2. 외부 학습 도구 */}
      <section className="space-y-8">
        <div className="border-b border-line pb-6">
          <h3 className={`text-[28px] font-normal tracking-tight ${currentTheme.activeText}`}>외부 학습 도구</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {QUICK_TOOLS.map((tool) => (
            <a 
              key={tool.name} href={tool.url} target="_blank" rel="noreferrer"
              className={`flex flex-col justify-between p-6 border ${currentTheme.border} h-36 hover:border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all group`}
            >
              <div className="flex justify-between items-start">
                <span className="text-[13px] opacity-40 font-mono">{tool.id}</span>
                <ExternalLink className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div>
                <h4 className="text-[20px] font-medium mb-1">{tool.name}</h4>
                <p className="text-[14px] opacity-50 font-mono">{tool.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* 3. 과제: 누르면 새 탭에서 과제 화면이 열리고, 학생은 거기서 제출한다 */}
      <HomeworkSection currentUser={currentUser} currentTheme={currentTheme} />
    </div>
  );
}

// 파일 맨 하단에 명시적 기본 내보내기를 추가하여 번들러 해석 누락 방지
export default TabClass;