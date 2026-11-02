import React, { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

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
  const [activeTab, setActiveTab] = useState("homeroom"); 
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, setCurrentUser);
  }, []);

  if (activeLessonId) return <LessonDetailView lessonId={activeLessonId} currentUser={currentUser} />;
  if (activeTaskId) return <TaskDetailView taskId={activeTaskId} currentUser={currentUser} />;

  const currentTheme = THEMES[activeTab];
  const isOutline = activeTab === "office";
  const cutoutColor = activeTab === "class" ? "#FFFFFF" : activeTab === "homeroom" ? "#5C5C5C" : activeTab === "work" ? "#EAEAEA" : "#050505";

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

      <Header activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} currentTheme={currentTheme} isOutline={isOutline} cutoutColor={cutoutColor} onOpenLogin={() => setIsLoginOpen(true)} />

      <main className="max-w-[1360px] mx-auto px-6 md:px-10 pt-16 w-full">
        {activeTab === "class" && <TabClass currentUser={currentUser} currentTheme={currentTheme} />}
        {activeTab === "work" && <TabWork currentUser={currentUser} currentTheme={currentTheme} />}
        {activeTab === "office" && <TabOffice currentUser={currentUser} />}
        {activeTab === "homeroom" && <TabHomeroom currentUser={currentUser} currentTheme={currentTheme} />}
      </main>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}