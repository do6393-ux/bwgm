import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { ExternalLink } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import HomeworkSection from "@/components/homework/HomeworkSection";

const QUICK_TOOLS = [
  { id: "01", name: "엔트리", desc: "블록 코딩", url: "https://playentry.org" },
  { id: "02", name: "멘티미터", desc: "실시간 투표", url: "https://menti.com" },
  { id: "03", name: "인천에듀", desc: "교육 포털", url: "https://icedu.kr" },
  { id: "04", name: "자리배치", desc: "추첨 유틸리티", url: "https://letsgoteacher.kr/seat-arrangement.html" },
  { id: "05", name: "룰렛추첨", desc: "랜덤 뽑기", url: "https://lazygyu.github.io/roulette/" },
];

const UNITS = [
  { id: "all", label: "전체 자료" },
  { id: "unit1", label: "1단원 시스템" },
  { id: "unit2", label: "2단원 데이터" },
  { id: "unit3", label: "3단원 알고리즘" },
  { id: "unit4", label: "4단원 인공지능" },
  { id: "unit5", label: "5단원 디지털 문화" },
];

function TabClass({ currentUser, currentTheme }) {
  const { confirm, toast } = useDialog();
  const [notices, setNotices] = useState([]);
  const [noticesLoaded, setNoticesLoaded] = useState(false); // 첫 응답이 오기 전에는 "공지 없음" 대신 스켈레톤을 보여 준다
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [newNotice, setNewNotice] = useState({ title: "", body: "", type: "normal" });
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [editNoticeData, setEditNoticeData] = useState({ title: "", body: "" });

  const [lessons, setLessons] = useState([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [newLesson, setNewLesson] = useState({ title: "", summary: "", lessonNum: "", unit: "unit1" });
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [editLessonData, setEditLessonData] = useState({ title: "", summary: "", lessonNum: "", unit: "unit1" });

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
    const unsubLessons = onSnapshot(
      query(collection(db, "lessons"), orderBy("createdAt", "desc")),
      (snap) => {
        setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLessonsLoaded(true);
      },
      (err) => { console.error("lessons listener:", err); setLessonsLoaded(true); }
    );
    return () => {
      unsubNotices();
      unsubLessons();
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

  const handleCreateLesson = async (e) => {
    e.preventDefault();
    if (!newLesson.title.trim()) return;
    await addDoc(collection(db, "lessons"), { ...newLesson, createdAt: serverTimestamp() });
    setNewLesson({ title: "", summary: "", lessonNum: "", unit: "unit1" });
    setShowLessonForm(false);
  };

  const handleUpdateLesson = async (e, id) => {
    e.preventDefault();
    if (!editLessonData.title.trim()) return;
    await updateDoc(doc(db, "lessons", id), {
      title: editLessonData.title,
      lessonNum: editLessonData.lessonNum,
      unit: editLessonData.unit,
      summary: editLessonData.summary
    });
    setEditingLessonId(null);
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

  const filteredLessons = lessons.filter(l => {
    if (!currentUser && l.isVisible === false) return false;
    if (selectedUnit !== "all" && l.unit !== selectedUnit) return false;
    return true;
  });

  return (
    <div className="space-y-24 ui-enter">
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

      {/* 3. 단원별 수업 자료실 */}
      <section className="space-y-8">
        <div className={`flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-6 ${currentTheme.border}`}>
          <div className="flex items-center gap-4 shrink-0">
            <h3 className={`text-[28px] font-normal tracking-tight ${currentTheme.activeText}`}>
              단원별 수업 자료실
            </h3>
            {currentUser && (
              <button onClick={() => setShowLessonForm(!showLessonForm)} className="text-[14px] font-mono opacity-50 hover:opacity-100 uppercase pb-1">
                {showLessonForm ? "[ close ]" : "[ + add ]"}
              </button>
            )}
          </div>
          <div className="flex overflow-x-auto whitespace-nowrap text-[18px] tracking-tight gap-8">
            {UNITS.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUnit(u.id)}
                className={`transition-colors pb-1 ${selectedUnit === u.id ? `border-b border-black ${currentTheme.activeText}` : currentTheme.navText}`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {showLessonForm && currentUser && (
          <form onSubmit={handleCreateLesson} className={`border-b ${currentTheme.border} pb-8 mb-8 space-y-4`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" placeholder="자료 제목" value={newLesson.title} onChange={e => setNewLesson({...newLesson, title: e.target.value})} className={`w-full bg-transparent border ${currentTheme.border} p-4 text-[16px] outline-none focus:border-black transition-colors`} />
              <input type="text" placeholder="차시 (예: 1차시)" value={newLesson.lessonNum} onChange={e => setNewLesson({...newLesson, lessonNum: e.target.value})} className={`w-full bg-transparent border ${currentTheme.border} p-4 text-[16px] outline-none focus:border-black transition-colors`} />
            </div>
            <select value={newLesson.unit} onChange={e => setNewLesson({...newLesson, unit: e.target.value})} className={`w-full bg-transparent border ${currentTheme.border} p-4 text-[16px] outline-none focus:border-black transition-colors`}>
              {UNITS.filter(u => u.id !== "all").map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
            <textarea placeholder="요약 설명..." value={newLesson.summary} onChange={e => setNewLesson({...newLesson, summary: e.target.value})} className={`w-full bg-transparent border ${currentTheme.border} p-4 text-[16px] outline-none h-24 resize-none focus:border-black transition-colors`} />
            <button type="submit" className="bg-black text-white px-8 py-3 text-[14px] font-mono uppercase hover:bg-accent transition-colors">
              create lesson
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {!lessonsLoaded ? (
            <SkeletonGroup label="수업 자료를 불러오는 중" className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`${i >= 2 ? "hidden md:flex" : "flex"} flex-col border ${currentTheme.border} ${currentTheme.cardBg}`}>
                  <div className="p-6 space-y-5">
                    <div className="flex justify-between items-start">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-4 w-10" />
                    </div>
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-4/5" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </div>
                  <div className={`px-6 py-4 border-t ${currentTheme.border}`}>
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </SkeletonGroup>
          ) : filteredLessons.length === 0 ? (
            <div className="col-span-full py-20 text-center text-[15px] opacity-40 font-mono uppercase tracking-widest">
              해당 단원에 등록된 자료가 없습니다.
            </div>
          ) : (
            filteredLessons.map((lesson, i) => (
              editingLessonId === lesson.id ? (
                <div 
                  key={lesson.id} 
                  className={`flex flex-col border ${currentTheme.border} bg-white p-5 gap-3 h-full shadow-md`}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      placeholder="자료 제목" 
                      value={editLessonData.title} 
                      onChange={e => setEditLessonData({...editLessonData, title: e.target.value})} 
                      className="w-full bg-white border border-line p-2.5 text-[14px] outline-none focus:border-black transition-colors"
                    />
                    <input 
                      type="text" 
                      placeholder="차시 (예: 1차시)" 
                      value={editLessonData.lessonNum} 
                      onChange={e => setEditLessonData({...editLessonData, lessonNum: e.target.value})} 
                      className="w-full bg-white border border-line p-2.5 text-[14px] outline-none focus:border-black transition-colors"
                    />
                  </div>
                  <select 
                    value={editLessonData.unit} 
                    onChange={e => setEditLessonData({...editLessonData, unit: e.target.value})} 
                    className="w-full bg-white border border-line p-2.5 text-[14px] outline-none focus:border-black transition-colors"
                  >
                    {UNITS.filter(u => u.id !== "all").map(u => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                  <textarea 
                    placeholder="요약 설명..." 
                    value={editLessonData.summary} 
                    onChange={e => setEditLessonData({...editLessonData, summary: e.target.value})} 
                    className="w-full bg-white border border-line p-2.5 text-[14px] outline-none h-24 resize-none focus:border-black transition-colors"
                  />
                  <div className="flex justify-end gap-3 mt-auto font-mono text-[12px] uppercase pt-2">
                    <button 
                      type="button" 
                      onClick={() => setEditingLessonId(null)} 
                      className="opacity-50 hover:opacity-100 transition-opacity"
                    >
                      [ cancel ]
                    </button>
                    <button 
                      type="button" 
                      onClick={(e) => handleUpdateLesson(e, lesson.id)} 
                      className="text-accent font-bold"
                    >
                      [ save ]
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  key={lesson.id} 
                  style={{ "--i": Math.min(i, 8) }}
                  className={`flex flex-col border ${currentTheme.border} ${currentTheme.cardBg} hover:border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer group ui-enter`} 
                  onClick={() => window.open(`?lesson=${lesson.id}`, '_blank')}
                >
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div className="space-y-5">
                      <div className="flex justify-between items-start">
                        <span className="inline-block px-2 py-1 text-[11px] font-mono border border-black uppercase tracking-widest bg-black text-white">
                          {UNITS.find(u => u.id === lesson.unit)?.id || "unit.X"}
                        </span>
                        <span className="text-[12px] opacity-40 font-mono uppercase shrink-0 pt-1">{lesson.lessonNum}</span>
                      </div>
                      <div>
                        <h4 className="text-[20px] font-medium text-black mb-3 group-hover:text-accent transition-colors leading-tight">{lesson.title}</h4>
                        <p className="text-[14px] opacity-60 line-clamp-3 leading-relaxed font-light">{lesson.summary}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className={`px-6 py-4 border-t flex flex-wrap justify-between items-center gap-x-4 gap-y-2 ${currentTheme.border} bg-white/30`}>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <div className={`w-[6px] h-[6px] shrink-0 rounded-full ${lesson.isVisible === false ? "bg-neutral-400" : "bg-green-500 animate-pulse"}`}></div>
                      <span className="text-[11px] font-mono uppercase tracking-widest opacity-60 pt-0.5 whitespace-nowrap">{lesson.isVisible === false ? "hidden (비공개)" : "active"}</span>
                    </div>
                    {currentUser && (
                      <div className="flex items-center gap-2 ml-auto md:basis-full md:justify-end whitespace-nowrap font-mono text-[11px] uppercase opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity pt-0.5">
                        {/* 학생에게 공개/비공개 전환 (비로그인 방문자 목록에서 숨겨진다) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateDoc(doc(db, "lessons", lesson.id), { isVisible: lesson.isVisible === false });
                          }}
                          title="학생에게 공개/비공개 전환"
                          className="opacity-50 hover:opacity-100 hover:text-black transition-all"
                        >
                          [ {lesson.isVisible === false ? "show" : "hide"} ]
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setEditingLessonId(lesson.id);
                            setEditLessonData({
                              title: lesson.title || "",
                              lessonNum: lesson.lessonNum || "",
                              unit: lesson.unit || "unit1",
                              summary: lesson.summary || ""
                            });
                          }}
                          className="opacity-50 hover:opacity-100 hover:text-black transition-all"
                        >
                          [ edit ]
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            removeWithConfirm("lessons", lesson.id, `"${lesson.title}" 수업 자료를 삭제하시겠습니까?`);
                          }} 
                          className="opacity-50 hover:opacity-100 text-red-500 transition-all"
                        >
                          [ del ]
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            ))
          )}
        </div>
      </section>

      {/* 4. 과제: 누르면 새 탭에서 과제 화면이 열리고, 학생은 거기서 제출한다 */}
      <HomeworkSection currentUser={currentUser} currentTheme={currentTheme} />
    </div>
  );
}

// 파일 맨 하단에 명시적 기본 내보내기를 추가하여 번들러 해석 누락 방지
export default TabClass;