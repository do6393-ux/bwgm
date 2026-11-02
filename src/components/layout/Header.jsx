import React, { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import SettingsModal from "./SettingsModal"; // 🎯 추가됨

export default function Header({
  activeTab,
  setActiveTab,
  currentUser,
  currentTheme,
  isOutline,
  cutoutColor,
  onOpenLogin,
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // 🎯 설정 모달 상태 추가

  return (
    <>
      <header className={`w-full border-b transition-colors duration-500 ${currentTheme.border} px-6 md:px-12 py-[clamp(1.5rem,2.2vw,2rem)]`}>
        <div className="max-w-[1360px] w-full mx-auto flex flex-row items-start justify-between gap-[clamp(1rem,3vw,2rem)] overflow-x-auto no-scrollbar">
          
          <div className="flex-shrink-0">
            <h1 className="font-normal leading-[1.0] tracking-tighter text-[clamp(18px,2.4vw,34px)]">
              buwon<br/>informatics
            </h1>
          </div>

          <div className="flex flex-row flex-nowrap items-start flex-1 gap-[clamp(1rem,3vw,3rem)]">
            
            {/* 탭 1: 정보 수업 */}
            <div 
              className={`flex items-start flex-shrink-0 cursor-pointer group transition-colors gap-[clamp(0.5rem,1vw,0.85rem)] ${activeTab === 'class' ? currentTheme.activeText : currentTheme.navText}`}
              onClick={() => setActiveTab("class")}
            >
              <div className="relative w-[clamp(32px,4.2vw,60px)] h-[clamp(58px,7.8vw,110px)]">
                <svg viewBox="0 0 100 160" className="w-full h-full absolute top-0 left-0">
                  {isOutline ? (
                    <g className="origin-[50px_50px] transition-transform duration-700 group-hover:animate-[spin_2s_linear_infinite]">
                      <g transform="translate(50,50) scale(1.4) translate(-50,-50)" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
                        <path d="M50 44 C 65 5, 95 20, 56 47" />
                        <path d="M50 44 C 65 5, 95 20, 56 47" transform="rotate(90 50 50)" />
                        <path d="M50 44 C 65 5, 95 20, 56 47" transform="rotate(180 50 50)" />
                        <path d="M50 44 C 65 5, 95 20, 56 47" transform="rotate(270 50 50)" />
                        <circle cx="50" cy="50" r="5" />
                      </g>
                    </g>
                  ) : (
                    <g className="origin-[50px_50px] transition-transform duration-700 group-hover:animate-[spin_2s_linear_infinite]">
                      <g transform="translate(50,50) scale(1.4) translate(-50,-50)">
                        <g fill="currentColor">
                          <path d="M50 44 C 65 5, 95 20, 56 47 Z" />
                          <path d="M50 44 C 65 5, 95 20, 56 47 Z" transform="rotate(90 50 50)" />
                          <path d="M50 44 C 65 5, 95 20, 56 47 Z" transform="rotate(180 50 50)" />
                          <path d="M50 44 C 65 5, 95 20, 56 47 Z" transform="rotate(270 50 50)" />
                        </g>
                        <circle cx="50" cy="50" r="5" fill={cutoutColor} />
                      </g>
                    </g>
                  )}
                  <line x1="50" y1="62" x2="50" y2="160" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex flex-col pt-[clamp(2px,0.25vw,4px)]">
                <span className="font-normal tracking-tight leading-[1.0] text-[clamp(16px,2.4vw,34px)] mb-[clamp(0.4rem,0.9vw,0.75rem)]">정보 수업</span>
                <span className="leading-[1.5] font-light lowercase text-[clamp(9px,0.95vw,14px)]">공지사항<br/>수업 자료실<br/>과제 제출</span>
              </div>
            </div>

            {/* 탭 2: 내 학급 */}
            <div 
              className={`flex items-start flex-shrink-0 cursor-pointer group transition-colors gap-[clamp(0.5rem,1vw,0.85rem)] ${!currentUser ? 'opacity-30 cursor-not-allowed' : activeTab === 'homeroom' ? currentTheme.activeText : currentTheme.navText}`}
              onClick={() => currentUser && setActiveTab("homeroom")}
            >
              <div className="relative pt-[clamp(2px,0.25vw,4px)] w-[clamp(48px,6.5vw,90px)] h-[clamp(58px,7.8vw,110px)]">
                <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0">
                  <g fill={isOutline ? "none" : "currentColor"} stroke={isOutline ? "currentColor" : "none"} strokeWidth={isOutline ? "5" : "0"}>
                    <circle cx="16" cy="16" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[16px_16px]" style={{transitionDelay: '0ms'}}/>
                    <circle cx="50" cy="16" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[50px_16px]" style={{transitionDelay: '50ms'}}/>
                    <circle cx="84" cy="16" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[84px_16px]" style={{transitionDelay: '100ms'}}/>
                    
                    <circle cx="16" cy="50" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[16px_50px]" style={{transitionDelay: '50ms'}}/>
                    <circle cx="50" cy="50" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[50px_50px]" style={{transitionDelay: '100ms'}}/>
                    <circle cx="84" cy="50" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[84px_50px]" style={{transitionDelay: '150ms'}}/>
                    
                    <circle cx="16" cy="84" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[16px_84px]" style={{transitionDelay: '100ms'}}/>
                    <circle cx="50" cy="84" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[50px_84px]" style={{transitionDelay: '150ms'}}/>
                    <circle cx="84" cy="84" r={isOutline ? "11.5" : "14"} className="transition-transform duration-500 group-hover:scale-50 origin-[84px_84px]" style={{transitionDelay: '200ms'}}/>
                  </g>
                </svg>
              </div>
              <div className="flex flex-col pt-[clamp(2px,0.25vw,4px)]">
                <span className="font-normal tracking-tight leading-[1.0] text-[clamp(16px,2.4vw,34px)] mb-[clamp(0.4rem,0.9vw,0.75rem)]">내 학급</span>
                <span className="leading-[1.5] font-light lowercase text-[clamp(9px,0.95vw,14px)]">비상연락망<br/>자리배치<br/>행발세특</span>
              </div>
            </div>

            {/* 탭 3: 정보 업무 */}
            <div 
              className={`flex items-start flex-shrink-0 cursor-pointer group transition-colors gap-[clamp(0.5rem,1vw,0.85rem)] ${!currentUser ? 'opacity-30 cursor-not-allowed' : activeTab === 'work' ? currentTheme.activeText : currentTheme.navText}`}
              onClick={() => currentUser && setActiveTab("work")}
            >
              <div className="relative pt-[clamp(2px,0.25vw,4px)] w-[clamp(48px,6.5vw,90px)] h-[clamp(58px,7.8vw,110px)]">
                <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0">
                  {isOutline ? (
                    <g fill="none" stroke="currentColor" strokeWidth="5">
                      <rect x="2.5" y="2.5" width="95" height="23" />
                      <rect x="2.5" y="38.5" width="95" height="23" />
                      <rect x="2.5" y="74.5" width="95" height="23" />
                    </g>
                  ) : (
                    <g fill="currentColor">
                      <path d="M0 0 H100 V28 H0 Z" />
                      <path d="M0 36 H100 V64 H0 Z" />
                      <path d="M0 72 H100 V100 H0 Z" />
                    </g>
                  )}
                  <g fill={isOutline ? "currentColor" : cutoutColor}>
                    <circle cx="15" cy="14" r="5" className="transition-transform duration-500 group-hover:translate-x-12" />
                    <circle cx="85" cy="50" r="5" className="transition-transform duration-700 group-hover:-translate-x-20" />
                    <circle cx="25" cy="86" r="5" className="transition-transform duration-500 group-hover:translate-x-16" />
                  </g>
                </svg>
              </div>
              <div className="flex flex-col pt-[clamp(2px,0.25vw,4px)]">
                <span className="font-normal tracking-tight leading-[1.0] text-[clamp(16px,2.4vw,34px)] mb-[clamp(0.4rem,0.9vw,0.75rem)]">정보 업무</span>
                <span className="leading-[1.5] font-light lowercase text-[clamp(9px,0.95vw,14px)]">진행 현황<br/>아카이브<br/>보안 로그</span>
              </div>
            </div>

            {/* 탭 4: 교무실 */}
            <div 
              className={`flex items-start flex-shrink-0 cursor-pointer group transition-colors gap-[clamp(0.5rem,1vw,0.85rem)] ${!currentUser ? 'opacity-30 cursor-not-allowed' : activeTab === 'office' ? currentTheme.activeText : currentTheme.navText}`}
              onClick={() => currentUser && setActiveTab("office")}
            >
              <div className="relative pt-[clamp(2px,0.25vw,4px)] w-[clamp(48px,6.5vw,90px)] h-[clamp(58px,7.8vw,110px)]">
                <svg viewBox="0 0 100 100" className="w-full h-full absolute top-0 left-0">
                  {isOutline ? (
                    <>
                      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="5" />
                      <line x1="50" y1="50" x2="50" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="origin-[50px_50px] transition-transform duration-500 group-hover:animate-[spin_1s_linear_infinite]" />
                      <line x1="50" y1="50" x2="68" y2="68" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="origin-[50px_50px] transition-transform duration-500 group-hover:animate-[spin_12s_linear_infinite]" />
                    </>
                  ) : (
                    <>
                      <circle cx="50" cy="50" r="48.5" fill="currentColor" />
                      <line x1="50" y1="50" x2="50" y2="18" stroke={cutoutColor} strokeWidth="3" strokeLinecap="round" className="origin-[50px_50px] transition-transform duration-500 group-hover:animate-[spin_1s_linear_infinite]" />
                      <line x1="50" y1="50" x2="68" y2="68" stroke={cutoutColor} strokeWidth="3" strokeLinecap="round" className="origin-[50px_50px] transition-transform duration-500 group-hover:animate-[spin_12s_linear_infinite]" />
                    </>
                  )}
                </svg>
              </div>
              <div className="flex flex-col pt-[clamp(2px,0.25vw,4px)]">
                <span className="font-normal tracking-tight leading-[1.0] text-[clamp(16px,2.4vw,34px)] mb-[clamp(0.4rem,0.9vw,0.75rem)]">교무실</span>
                <span className="leading-[1.5] font-light lowercase text-[clamp(9px,0.95vw,14px)]">시간표<br/>오늘의 급식<br/>기본 설정</span>
              </div>
            </div>
          </div>

          <div className="flex items-start flex-shrink-0 gap-[clamp(1rem,1.5vw,1.5rem)]">
            <div className="flex flex-col items-end text-right font-mono pt-[clamp(4px,0.5vw,8px)]">
              {currentUser ? (
                <>
                  {/* 🎯 오리지널 감성에 맞게 settings 버튼 추가 */}
                  <button onClick={() => setIsSettingsOpen(true)} className={`transition-colors text-[clamp(10px,0.9vw,13px)] ${currentTheme.navText} hover:underline`}>
                    settings
                  </button>
                  <button onClick={() => signOut(auth)} className={`transition-colors text-[clamp(10px,0.9vw,13px)] ${currentTheme.navText} hover:underline mt-0.5`}>
                    logout
                  </button>
                  <span className="opacity-50 uppercase tracking-widest text-[clamp(8px,0.7vw,10px)] mt-[clamp(2px,0.2vw,4px)]">
                    {currentUser.displayName || "sys.admin"}<br/>active
                  </span>
                </>
              ) : (
                <>
                  <button onClick={onOpenLogin} className={`transition-colors text-[clamp(10px,0.9vw,13px)] ${currentTheme.navText} hover:underline`}>
                    teacher login
                  </button>
                  <span className="opacity-50 uppercase tracking-widest text-[clamp(8px,0.7vw,10px)] mt-[clamp(2px,0.2vw,4px)]">
                    auth<br/>required
                  </span>
                </>
              )}
            </div>
            <svg viewBox="0 0 100 100" className="opacity-90 group-hover:rotate-90 transition-transform duration-700 w-[clamp(36px,4.5vw,70px)] h-[clamp(36px,4.5vw,70px)]">
              {isOutline ? (
                <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round">
                  <polygon points="15,40 40,15 50,25 25,50" />
                  <polygon points="25,50 50,25 85,60 60,85" />
                  <circle cx="55" cy="55" r="9" />
                </g>
              ) : (
                <g>
                  <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M15 40 L40 15 L50 25 L25 50 Z" />
                  <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M25 50 L50 25 L85 60 L60 85 Z" />
                  <circle cx="55" cy="55" r="12" fill={cutoutColor} />
                </g>
              )}
            </svg>
          </div>

        </div>
      </header>
      
      {/* 🎯 설정 모달 렌더링 */}
      {currentUser && (
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          currentUser={currentUser} 
          currentTheme={currentTheme}
        />
      )}
    </>
  );
}