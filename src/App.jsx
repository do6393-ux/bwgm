import { useState, useEffect, useLayoutEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useWorkAccess } from "@/lib/useWorkAccess";
import { LESSONS_HASH } from "@/lib/classSubtabs";

import Header from "@/components/layout/Header";
import LoginModal from "@/components/layout/LoginModal";
import TabClass from "@/components/tabs/TabClass";
import TabOffice from "@/components/tabs/TabOffice";
import TabWork from "@/components/tabs/TabWork";
import TabHomeroom from "@/components/tabs/homeroom/TabHomeroom";
import LessonDetailView from "@/components/editor/LessonDetailView";
import TaskDetailView from "@/components/editor/TaskDetailView";
import HomeworkView from "@/components/homework/HomeworkView";
import HomeworkManager from "@/components/homework/HomeworkManager";

// 탭별 색은 src/index.css 의 [data-theme] 블록에 있고, 여기서는 그 색 이름(page, ink, line …)만 쓴다.
const THEME_CLASSES = {
  bg: "bg-page",
  border: "border-line",
  navText: "text-nav hover:text-nav-active",
  activeText: "text-nav-active",
  cardBg: "bg-surface",
};
const THEMES = {
  class: { ...THEME_CLASSES, text: "text-ink" },
  homeroom: { ...THEME_CLASSES, text: "text-ink-strong" },
  work: { ...THEME_CLASSES, text: "text-ink" },
  office: { ...THEME_CLASSES, text: "text-ink" },
};
// 모바일 브라우저 주소창 색(meta theme-color) — 각 탭의 page 색과 같게 둔다
const THEME_COLORS = { class: "#FFFFFF", homeroom: "#5C5C5C", work: "#EAEAEA", office: "#050505" };

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const activeLessonId = urlParams.get("lesson");
  const activeTaskId = urlParams.get("task");
  const activeHomeworkId = urlParams.get("assignment"); // 과제 화면 (학생 공개)
  const isHomeworkManager = urlParams.get("manage") === "assignments"; // 과제 관리 (교사 전용)

  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // 비로그인 방문자(학생)의 첫 화면은 공개 탭인 "정보 수업"
  const [activeTab, setActiveTab] = useState("class");
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      // 로그인하면 교무실(시간표) 탭으로, 로그아웃하면 공개 탭으로 이동.
      // 단, 수업 자료실 주소(…/#lessons)로 들어왔으면 정보 수업 탭에 그대로 둔다.
      setActiveTab(user && window.location.hash !== LESSONS_HASH ? "office" : "class");
      setAuthReady(true);
    });
  }, []);

  // 정보 업무는 관리자 + 관리자가 허용한 교사(teachers/{이메일}.canWork)만 열람 가능
  const { canWork, ready: workAccessReady } = useWorkAccess(currentUser);

  // 비로그인 상태에서는 어떤 경로로 activeTab 이 바뀌어도 공개 탭만 렌더링
  // 정보 업무 탭은 관리자/허용된 교사만, 나머지 교사 탭은 로그인한 교사만 접근 가능
  const canView = activeTab === "class" || (activeTab === "work" ? canWork : !!currentUser);
  const visibleTab = canView ? activeTab : "class";

  // 정보 수업 탭을 떠나면 자료실 주소(#lessons)를 지운다. 남아 있으면 새로고침 때 교무실 대신 정보 수업이 열린다.
  useEffect(() => {
    if (authReady && visibleTab !== "class" && window.location.hash === LESSONS_HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [authReady, visibleTab]);

  // 지금 화면의 색 테마를 <html data-theme> 으로 알린다 (알림창·모달·페이지 배경까지 같은 색을 쓰도록).
  // 업무 상세는 work, 수업 자료 상세는 class 테마.
  const themeKey = activeTaskId ? "work" : activeLessonId || activeHomeworkId || isHomeworkManager ? "class" : authReady ? visibleTab : "class";
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeKey;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = THEME_COLORS[themeKey];
  }, [themeKey]);

  // 업무 상세 페이지는 교사 전용 (?task=ID 로 직접 접근해도 로그인 필요)
  if (activeTaskId) {
    if (!authReady || !workAccessReady) return <div className="min-h-screen bg-[#F5F5F5]" />;
    if (!currentUser) {
      return (
        <div className="min-h-screen bg-[#F5F5F5] text-black flex flex-col items-center justify-center gap-6 font-mono px-6 text-center">
          <p className="text-[13px] uppercase tracking-widest opacity-60">교사 로그인이 필요한 페이지입니다.</p>
          <button
            onClick={() => setIsLoginOpen(true)}
            className="border border-black bg-black text-white px-8 py-3 text-[13px] uppercase tracking-widest hover:bg-[#0055FF] hover:border-[#0055FF] transition-colors"
          >
            teacher login
          </button>
          <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
        </div>
      );
    }
    // 정보 업무(보안점검·네트워크 매뉴얼 등)는 관리자와 관리자가 허용한 교사만
    if (!canWork) {
      return (
        <div className="min-h-screen bg-[#F5F5F5] text-black flex items-center justify-center font-mono px-6 text-center">
          <p className="text-[13px] uppercase tracking-widest opacity-60">관리자가 허용한 교사만 볼 수 있는 페이지입니다.</p>
        </div>
      );
    }
    return <TaskDetailView taskId={activeTaskId} currentUser={currentUser} />;
  }

  // 수업 자료는 학생에게 공개
  if (activeLessonId) return <LessonDetailView lessonId={activeLessonId} currentUser={currentUser} />;

  // 과제 관리는 교사 전용 (학생 제출물 원본이 보인다)
  if (isHomeworkManager) {
    if (!authReady) return <div className="min-h-screen bg-white" />;
    if (!currentUser) {
      return (
        <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center gap-6 font-mono px-6 text-center">
          <p className="text-[13px] uppercase tracking-widest opacity-60">교사 로그인이 필요한 페이지입니다.</p>
          <button
            onClick={() => setIsLoginOpen(true)}
            className="border border-black bg-black text-white px-8 py-3 text-[13px] uppercase tracking-widest hover:bg-accent hover:border-accent transition-colors"
          >
            teacher login
          </button>
          <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
        </div>
      );
    }
    return <HomeworkManager />;
  }

  // 과제 화면은 학생에게 공개. 교사로 로그인돼 있으면 제출 현황이 함께 보인다
  if (activeHomeworkId) {
    if (!authReady) return <div className="min-h-screen bg-white" />;
    return <HomeworkView homeworkId={activeHomeworkId} currentUser={currentUser} />;
  }

  // 인증 상태가 확정되기 전에는 아무 탭도 그리지 않음 (교사 전용 탭이 잠깐이라도 보이지 않도록)
  if (!authReady) return <div className="min-h-screen bg-white" />;

  const currentTheme = THEMES[visibleTab];
  const isOutline = visibleTab === "office";
  const cutoutColor = "rgb(var(--c-page))"; // 로고 구멍은 탭 배경색과 같아야 한다

  return (
    <div className={`min-h-screen ${currentTheme.bg} ${currentTheme.text} font-sans font-light selection:bg-accent selection:text-white pb-32 transition-colors duration-500 antialiased tracking-tight`}>

      <Header activeTab={visibleTab} setActiveTab={setActiveTab} currentUser={currentUser} currentTheme={currentTheme} isOutline={isOutline} cutoutColor={cutoutColor} onOpenLogin={() => setIsLoginOpen(true)} canWork={canWork} />

      <main className="max-w-[1360px] mx-auto px-4 md:px-10 pt-6 md:pt-16 w-full">
        {visibleTab === "class" && <TabClass currentUser={currentUser} currentTheme={currentTheme} />}
        {canWork && visibleTab === "work" && <TabWork currentUser={currentUser} />}
        {currentUser && visibleTab === "office" && <TabOffice currentUser={currentUser} canWork={canWork} onOpenTab={setActiveTab} />}
        {currentUser && visibleTab === "homeroom" && <TabHomeroom currentUser={currentUser} currentTheme={currentTheme} />}
      </main>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}