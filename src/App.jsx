import React, { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useWorkAccess } from "@/lib/useWorkAccess";

import Header from "@/components/layout/Header";
import LoginModal from "@/components/layout/LoginModal";
import TabClass from "@/components/tabs/TabClass";
import TabOffice from "@/components/tabs/TabOffice";
import TabWork from "@/components/tabs/TabWork";
import TabHomeroom from "@/components/tabs/homeroom/TabHomeroom";
import LessonDetailView from "@/components/editor/LessonDetailView";
import TaskDetailView from "@/components/editor/TaskDetailView";

const THEMES = {
  class: {
    bg: "bg-white", text: "text-black", border: "border-[#E5E5E5]",
    navText: "text-[#A0A0A0] hover:text-black", activeText: "text-black",
    cardBg: "bg-[#F5F5F5]", accent: "text-black"
  },
  homeroom: {
    // 🎯 기존 #525252에서 아주 살짝만 밝힌 #5C5C5C 적용 (다크 감성 유지)
    bg: "bg-[#5C5C5C]", text: "text-[#F5F5F5]", border: "border-[#707070]",
    navText: "text-[#A0A0A0] hover:text-emerald-400", activeText: "text-emerald-400",
    cardBg: "bg-[#4E4E4E]", accent: "text-[#E0E0E0]"
  },
  work: {
    bg: "bg-[#EAEAEA]", text: "text-[#1A1A1A]", border: "border-[#D0D0D0]",
    navText: "text-[#888888] hover:text-black", activeText: "text-black",
    cardBg: "bg-[#DFDFDF]", accent: "text-[#0055FF]"
  },
  office: {
    bg: "bg-[#050505]", text: "text-[#E5E5E5]", border: "border-[#222222]",
    navText: "text-[#666666] hover:text-white", activeText: "text-white",
    cardBg: "bg-[#111111]", accent: "text-[#FF5000]"
  }
};

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const activeLessonId = urlParams.get("lesson");
  const activeTaskId = urlParams.get("task");

  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // 비로그인 방문자(학생)의 첫 화면은 공개 탭인 "정보 수업"
  const [activeTab, setActiveTab] = useState("class");
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      // 로그인하면 교무실(시간표) 탭으로, 로그아웃하면 공개 탭으로 이동
      setActiveTab(user ? "office" : "class");
      setAuthReady(true);
    });
  }, []);

  // 정보 업무는 관리자 + 관리자가 허용한 교사(teachers/{이메일}.canWork)만 열람 가능
  const { canWork, ready: workAccessReady } = useWorkAccess(currentUser);

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

  // 인증 상태가 확정되기 전에는 아무 탭도 그리지 않음 (교사 전용 탭이 잠깐이라도 보이지 않도록)
  if (!authReady) return <div className="min-h-screen bg-white" />;

  // 비로그인 상태에서는 어떤 경로로 activeTab 이 바뀌어도 공개 탭만 렌더링
  // 정보 업무 탭은 관리자/허용된 교사만, 나머지 교사 탭은 로그인한 교사만 접근 가능
  const canView = activeTab === "class" || (activeTab === "work" ? canWork : !!currentUser);
  const visibleTab = canView ? activeTab : "class";
  const currentTheme = THEMES[visibleTab];
  const isOutline = visibleTab === "office";
  const cutoutColor = visibleTab === "class" ? "#FFFFFF" : visibleTab === "homeroom" ? "#5C5C5C" : visibleTab === "work" ? "#EAEAEA" : "#050505";

  return (
    <div className={`min-h-screen ${currentTheme.bg} ${currentTheme.text} font-sans font-light selection:bg-emerald-500 selection:text-white pb-32 transition-colors duration-500 antialiased tracking-tight`}>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        .font-sans { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif !important; }
        .font-mono { font-family: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace !important; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />

      <Header activeTab={visibleTab} setActiveTab={setActiveTab} currentUser={currentUser} currentTheme={currentTheme} isOutline={isOutline} cutoutColor={cutoutColor} onOpenLogin={() => setIsLoginOpen(true)} canWork={canWork} />

      <main className="max-w-[1360px] mx-auto px-6 md:px-10 pt-16 w-full">
        {visibleTab === "class" && <TabClass currentUser={currentUser} currentTheme={currentTheme} />}
        {canWork && visibleTab === "work" && <TabWork currentUser={currentUser} currentTheme={currentTheme} />}
        {currentUser && visibleTab === "office" && <TabOffice currentUser={currentUser} />}
        {currentUser && visibleTab === "homeroom" && <TabHomeroom currentUser={currentUser} currentTheme={currentTheme} />}
      </main>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}