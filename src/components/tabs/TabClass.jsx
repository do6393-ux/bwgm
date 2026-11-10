import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { ExternalLink } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import HomeworkSection from "@/components/homework/HomeworkSection";
import LessonLibrary from "@/components/tabs/class/LessonLibrary";
import ClassTodayBrief from "@/components/tabs/class/ClassTodayBrief";
import ClassTimer from "@/components/timer/ClassTimer";
import ClassPicker from "@/components/picker/ClassPicker";
import { hashOfSubtab, isClassSubtabHash, subtabFromHash, visibleSubtabs } from "@/lib/classSubtabs";
import { useLessons } from "@/lib/lessonsApi";
import { WEEKDAYS } from "@/lib/workCalendar";

// 정보 수업 탭은 작은 탭으로 나뉜다 (src/lib/classSubtabs.js). 학생에게는 앞의 세 개만 보인다.
//   홈: 오늘 한눈에(공지사항 · 지금 낼 과제 · 최근 올라온 자료) · 수업 도구
//   단원별 수업 자료실 · 과제 · 수업 타이머(로그인한 교사만) · 발표자 뽑기(로그인한 교사만)
// 홈이 아닌 탭을 열면 주소 끝에 #lessons / #homework / #timer / #picker 가 붙는다.
// App 은 다른 탭을 볼 때도 이 탭을 숨겨 둔 채 띄워 둔다 (isVisible) — 교무실을 보는 동안에도 타이머가 끝나면 울린다.

const QUICK_TOOLS = [
  { id: "01", name: "엔트리", desc: "블록 코딩", url: "https://playentry.org" },
  { id: "02", name: "멘티미터", desc: "실시간 투표", url: "https://menti.com" },
  { id: "03", name: "인천에듀", desc: "교육 포털", url: "https://icedu.kr" },
  { id: "04", name: "룰렛추첨", desc: "랜덤 뽑기", url: "https://lazygyu.github.io/roulette/" },
];

const NOTICE_LIMIT = 3; // 홈에는 최근 공지 몇 개만, 나머지는 "더 보기"
// 휴대폰에서 작은 탭 줄의 칸 수 (tailwind 가 찾을 수 있게 클래스 이름을 통째로 적는다)
const GRID_COLS = { 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };

function TabClass({ currentUser, currentTheme, isVisible = true }) {
  const [subtab, setSubtab] = useState(() => subtabFromHash(window.location.hash));
  const [timerBadge, setTimerBadge] = useState(null); // 타이머가 돌면 탭 이름 옆에 남은 시간
  const { lessons, loaded: lessonsLoaded } = useLessons();
  const navRef = useRef(null);
  const isTeacher = !!currentUser;
  const tabs = visibleSubtabs(isTeacher);
  // 학생이 #timer 주소로 들어오거나 로그아웃하면 홈을 보여 준다
  const current = tabs.some((t) => t.id === subtab) ? subtab : "home";

  // 작은 탭을 바꿀 때 아래로 내려가 있었으면 탭 줄이 보이게 올린다
  const openSubtab = (id) => {
    setSubtab(id);
    const nav = navRef.current;
    if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: "start" });
  };

  // 주소의 #… 를 직접 고치거나 뒤로 가기를 해도 따라간다.
  // hashSeen 은 주소가 바뀔 때마다 올려서, 탭이 그대로여도(예: 학생이 #timer 를 다시 침) 아래에서 주소를 다시 맞추게 한다
  const [hashSeen, setHashSeen] = useState(0);
  useEffect(() => {
    const onHashChange = () => {
      setSubtab(subtabFromHash(window.location.hash));
      setHashSeen((n) => n + 1);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // 주소 맞추기: 이 탭이 보이는 동안에는 지금 작은 탭의 주소, 다른 탭으로 가면 지운다
  // (남아 있으면 새로고침 때 교무실 대신 정보 수업이 열린다)
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const want = isVisible ? hashOfSubtab(current) : "";
    if (hash === want || (!isVisible && !isClassSubtabHash(hash))) return;
    window.history.replaceState(null, "", `${pathname}${search}${want}`);
  }, [isVisible, current, hashSeen]);

  return (
    <div className="space-y-12 md:space-y-16 ui-enter">
      <nav ref={navRef} aria-label="정보 수업 메뉴" className={`grid ${GRID_COLS[tabs.length] ?? "grid-cols-3"} md:inline-grid md:grid-flow-col md:auto-cols-max border border-black`}>
        {tabs.map((tab, i) => {
          const active = current === tab.id;
          const badge = tab.id === "timer" && timerBadge && !active ? timerBadge : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => openSubtab(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`px-2 md:px-8 py-3 text-[14px] md:text-[15px] font-medium tracking-tight whitespace-nowrap transition-colors ${
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
              {/* 휴대폰은 칸이 좁아서 남은 시간 대신 주황 점만 */}
              {badge && (
                <>
                  <span className="hidden md:inline ml-1.5 font-mono text-[12px] text-accent tabular-nums">{badge}</span>
                  <span className="md:hidden inline-block ml-1 w-1.5 h-1.5 rounded-full bg-accent align-middle" aria-label={`남은 시간 ${badge}`} />
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* 모두 띄워 두고 숨기기만 한다: 오가도 쓰던 글·고른 단원·돌던 타이머가 그대로 남는다 */}
      <div hidden={current !== "home"}>
        <ClassHome currentUser={currentUser} currentTheme={currentTheme} lessons={lessons} lessonsLoaded={lessonsLoaded} onOpenSubtab={openSubtab} />
      </div>
      <div hidden={current !== "lessons"}>
        <LessonLibrary currentUser={currentUser} currentTheme={currentTheme} lessons={lessons} lessonsLoaded={lessonsLoaded} />
      </div>
      <div hidden={current !== "homework"}>
        <HomeworkSection currentUser={currentUser} currentTheme={currentTheme} />
      </div>
      {isTeacher && (
        <div hidden={current !== "timer"}>
          <ClassTimer active={isVisible && current === "timer"} onBadge={setTimerBadge} />
        </div>
      )}
      {isTeacher && (
        <div hidden={current !== "picker"}>
          <ClassPicker active={isVisible && current === "picker"} />
        </div>
      )}
    </div>
  );
}

// 홈: 오늘 한눈에(공지사항 · 지금 낼 과제 · 최근 올라온 자료) · 수업 도구
function ClassHome({ currentUser, currentTheme, lessons, lessonsLoaded, onOpenSubtab }) {
  const { confirm, toast } = useDialog();
  const [notices, setNotices] = useState([]);
  const [noticesLoaded, setNoticesLoaded] = useState(false); // 첫 응답이 오기 전에는 "공지 없음" 대신 스켈레톤을 보여 준다
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [newNotice, setNewNotice] = useState({ title: "", body: "", type: "normal" });
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [editNoticeData, setEditNoticeData] = useState({ title: "", body: "" });
  const [showAllNotices, setShowAllNotices] = useState(false);

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

  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 (${WEEKDAYS[now.getDay()]})`;
  // 고치는 중인 공지는 접혀 있어도 보이게 둔다
  const shownNotices = showAllNotices
    ? notices
    : notices.filter((n, i) => i < NOTICE_LIMIT || n.id === editingNoticeId);
  const hiddenCount = notices.length - shownNotices.length;

  return (
    <div className="space-y-16 md:space-y-24">
      {/* 오늘 한눈에: 공지사항 → 지금 낼 과제 | 최근 올라온 자료 */}
      <div className="space-y-12 md:space-y-16">
        <p className="font-mono text-[12px] md:text-[13px] uppercase tracking-widest">
          <span className="text-accent">// 오늘 한눈에</span> <span className="opacity-60">· {todayLabel}</span>
        </p>

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
            shownNotices.map((n, i) => (
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
        {(hiddenCount > 0 || (showAllNotices && notices.length > NOTICE_LIMIT)) && (
          <button
            type="button"
            onClick={() => setShowAllNotices(!showAllNotices)}
            aria-expanded={showAllNotices}
            className="font-mono text-[13px] opacity-50 hover:opacity-100 transition-opacity"
          >
            {showAllNotices ? "[ 접기 ▴ ]" : `[ 공지 ${hiddenCount}개 더 보기 ▾ ]`}
          </button>
        )}
      </section>

      <ClassTodayBrief lessons={lessons} lessonsLoaded={lessonsLoaded} onOpenSubtab={onOpenSubtab} />
      </div>

      {/* 수업 도구: 외부 사이트 링크 (수업 타이머는 옆의 작은 탭) */}
      <section className="space-y-8">
        <div className="border-b border-line pb-6">
          <h3 className={`text-[28px] font-normal tracking-tight ${currentTheme.activeText}`}>수업 도구</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
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
    </div>
  );
}

// 파일 맨 하단에 명시적 기본 내보내기를 추가하여 번들러 해석 누락 방지
export default TabClass;