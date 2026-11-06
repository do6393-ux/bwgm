import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import SettingsModal from "./SettingsModal";
import TeacherAdminModal from "./TeacherAdminModal";
import { isAdmin } from "@/lib/admin";

export default function Header({
  activeTab,
  setActiveTab,
  currentUser,
  currentTheme,
  isOutline,
  cutoutColor,
  onOpenLogin,
  canWork,
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTeacherAdminOpen, setIsTeacherAdminOpen] = useState(false);
  const isAdminUser = isAdmin(currentUser);
  const sheet = isOutline
    ? { fill: cutoutColor, stroke: "currentColor", strokeWidth: 2.8 }
    : { fill: "currentColor", stroke: cutoutColor, strokeWidth: 2.2 };

  return (
    <>
      <header className={`w-full border-b transition-colors duration-500 ${currentTheme.border} px-4 md:px-12 py-3 md:py-[clamp(1.5rem,2.2vw,2rem)]`}>
        {/* 🎯 부모 컨테이너 간격(gap) 확대 */}
        <div className="max-w-[1360px] w-full mx-auto flex flex-wrap md:flex-nowrap items-center md:items-start justify-between gap-x-4 gap-y-3 md:gap-[clamp(2rem,4vw,4rem)] md:overflow-x-auto no-scrollbar">
          
          {/* 🎯 로고 영역: min-w-max 추가 */}
          <div className="order-1 md:order-none flex-shrink-0 min-w-max">
            <h1 className="font-normal leading-[1.0] tracking-tighter text-[clamp(18px,2.4vw,34px)]">
              buwon<br className="hidden md:block"/><span className="md:hidden"> </span>informatics
            </h1>
          </div>

          {/* 🎯 탭 영역: min-w-max 추가하여 찌그러짐 원천 차단 */}
          <div className="order-3 md:order-none w-full md:w-auto grid grid-cols-4 md:flex md:flex-row md:flex-nowrap items-start md:flex-1 md:min-w-max gap-1 md:gap-[clamp(1.5rem,3vw,3rem)] md:pr-4">
            
            {/* 탭 1: 정보 수업 */}
            <div 
              className={`flex flex-col md:flex-row items-center md:items-start flex-shrink-0 cursor-pointer group transition-colors gap-1.5 md:gap-[clamp(0.5rem,1vw,0.85rem)] py-1 md:py-0 ${activeTab === 'class' ? currentTheme.activeText : currentTheme.navText}`}
              onClick={() => setActiveTab("class")}
            >
              <div className="relative w-5 h-8 md:w-[clamp(32px,4.2vw,60px)] md:h-[clamp(58px,7.8vw,110px)]">
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
              <div className="flex flex-col items-center md:items-start md:pt-[clamp(2px,0.25vw,4px)]">
                <span className="font-normal tracking-tight leading-[1.0] text-[13px] md:text-[clamp(16px,2.4vw,34px)] md:mb-[clamp(0.4rem,0.9vw,0.75rem)]">정보 수업</span>
                <span className="hidden md:block leading-[1.5] font-light lowercase text-[clamp(9px,0.95vw,14px)]">공지사항<br/>수업 자료실<br/>과제</span>
              </div>
            </div>

            {/* 탭 2: 내 학급 */}
            <div 
              className={`flex flex-col md:flex-row items-center md:items-start flex-shrink-0 cursor-pointer group transition-colors gap-1.5 md:gap-[clamp(0.5rem,1vw,0.85rem)] py-1 md:py-0 ${!currentUser ? 'opacity-30 cursor-not-allowed' : activeTab === 'homeroom' ? currentTheme.activeText : currentTheme.navText}`}
              onClick={() => currentUser && setActiveTab("homeroom")}
            >
              <div className="relative md:pt-[clamp(2px,0.25vw,4px)] w-8 h-8 md:w-[clamp(48px,6.5vw,90px)] md:h-[clamp(58px,7.8vw,110px)]">
                <svg viewBox="9.5 3 81 97.6" className="w-full h-full absolute top-0 left-0 overflow-visible">
                  {/* 학생 명찰: 위 구멍을 중심으로 마우스를 올리면 살랑 흔들린다 */}
                  <g className="origin-[50px_16px] motion-safe:group-hover:animate-swing">
                    {isOutline ? (
                      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
                        <rect x="19.5" y="6.5" width="61" height="87" rx="7" />
                        <line x1="40" y1="16" x2="60" y2="16" />
                        <circle cx="50" cy="46" r="9.5" />
                        <path d="M33 82 A17 17 0 0 1 67 82" />
                      </g>
                    ) : (
                      <>
                        <rect x="17" y="4" width="66" height="92" rx="9" fill="currentColor" />
                        <rect x="38" y="12" width="24" height="8" rx="4" fill={cutoutColor} />
                        <circle cx="50" cy="46" r="12" fill={cutoutColor} />
                        <path d="M28 88 A22 22 0 0 1 72 88 Z" fill={cutoutColor} />
                      </>
                    )}
                  </g>
                </svg>
              </div>
              <div className="flex flex-col items-center md:items-start md:pt-[clamp(2px,0.25vw,4px)]">
                <span className="font-normal tracking-tight leading-[1.0] text-[13px] md:text-[clamp(16px,2.4vw,34px)] md:mb-[clamp(0.4rem,0.9vw,0.75rem)]">내 학급</span>
                <span className="hidden md:block leading-[1.5] font-light lowercase text-[clamp(9px,0.95vw,14px)]">비상연락망<br/>자리배치<br/>행발세특</span>
              </div>
            </div>

            {/* 탭 3: 정보 업무 */}
            <div 
              title={currentUser && !canWork ? "관리자가 허용한 교사만 볼 수 있는 메뉴입니다" : undefined}
              className={`flex flex-col md:flex-row items-center md:items-start flex-shrink-0 cursor-pointer group transition-colors gap-1.5 md:gap-[clamp(0.5rem,1vw,0.85rem)] py-1 md:py-0 ${!canWork ? 'opacity-30 cursor-not-allowed' : activeTab === 'work' ? currentTheme.activeText : currentTheme.navText}`}
              onClick={() => canWork && setActiveTab("work")}
            >
              <div className="relative md:pt-[clamp(2px,0.25vw,4px)] w-8 h-8 md:w-[clamp(48px,6.5vw,90px)] md:h-[clamp(58px,7.8vw,110px)]">
                <svg viewBox="22.5 11.2 55 66.25" className="w-full h-full absolute top-0 left-0 overflow-visible">
                  {/* 서류 더미: 마우스를 올리면 뒤의 두 장이 부채꼴로 펼쳐진다 (펼쳐도 글자와 안 겹치게 데스크톱에서 살짝 왼쪽) */}
                  <g className="md:-translate-x-1.5">
                    <g className="origin-[50px_86px] transition-transform duration-500 -rotate-[10deg] motion-safe:group-hover:-rotate-[16deg]">
                      <rect x="31" y="14" width="38" height="56" rx="3" {...sheet} />
                    </g>
                    <g className="origin-[50px_86px] transition-transform duration-500 rotate-[10deg] motion-safe:group-hover:rotate-[16deg]">
                      <rect x="31" y="14" width="38" height="56" rx="3" {...sheet} />
                    </g>
                    <rect x="31" y="14" width="38" height="56" rx="3" {...sheet} />
                    <path d="M39 28H61M39 39H61M39 50H53" fill="none" stroke={isOutline ? "currentColor" : cutoutColor} strokeWidth={isOutline ? 2.8 : 3.6} strokeLinecap="round" />
                  </g>
                </svg>
              </div>
              <div className="flex flex-col items-center md:items-start md:pt-[clamp(2px,0.25vw,4px)]">
                <span className="font-normal tracking-tight leading-[1.0] text-[13px] md:text-[clamp(16px,2.4vw,34px)] md:mb-[clamp(0.4rem,0.9vw,0.75rem)]">정보 업무</span>
                <span className="hidden md:block leading-[1.5] font-light lowercase text-[clamp(9px,0.95vw,14px)]">업무 현황<br/>업무 매뉴얼<br/>업무 검색</span>
              </div>
            </div>

            {/* 탭 4: 교무실 */}
            <div 
              className={`flex flex-col md:flex-row items-center md:items-start flex-shrink-0 cursor-pointer group transition-colors gap-1.5 md:gap-[clamp(0.5rem,1vw,0.85rem)] py-1 md:py-0 ${!currentUser ? 'opacity-30 cursor-not-allowed' : activeTab === 'office' ? currentTheme.activeText : currentTheme.navText}`}
              onClick={() => currentUser && setActiveTab("office")}
            >
              <div className="relative md:pt-[clamp(2px,0.25vw,4px)] w-8 h-8 md:w-[clamp(48px,6.5vw,90px)] md:h-[clamp(58px,7.8vw,110px)]">
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
              <div className="flex flex-col items-center md:items-start md:pt-[clamp(2px,0.25vw,4px)]">
                <span className="font-normal tracking-tight leading-[1.0] text-[13px] md:text-[clamp(16px,2.4vw,34px)] md:mb-[clamp(0.4rem,0.9vw,0.75rem)]">교무실</span>
                <span className="hidden md:block leading-[1.5] font-light lowercase text-[clamp(9px,0.95vw,14px)]">시간표<br/>오늘의 급식<br/>기본 설정</span>
              </div>
            </div>
          </div>

          {/* 🎯 로그인 영역: min-w-max와 ml-auto 추가로 무조건 우측으로 밀어내기 */}
          <div className="order-2 md:order-none flex items-center md:items-start flex-shrink-0 md:min-w-max gap-[clamp(1rem,1.5vw,1.5rem)] ml-auto md:pl-4">
            <div className="flex flex-row md:flex-col items-center md:items-end gap-4 md:gap-0 text-right font-mono md:pt-[clamp(4px,0.5vw,8px)]">
              {currentUser ? (
                <>
                  <button onClick={() => setIsSettingsOpen(true)} className={`transition-colors py-1.5 md:py-0 text-[clamp(11px,0.9vw,13px)] ${currentTheme.navText} hover:underline`}>
                    settings
                  </button>
                  {isAdminUser && (
                    <button onClick={() => setIsTeacherAdminOpen(true)} className={`transition-colors py-1.5 md:py-0 text-[clamp(11px,0.9vw,13px)] ${currentTheme.navText} hover:underline md:mt-0.5`}>
                      teachers
                    </button>
                  )}
                  <button onClick={() => signOut(auth)} className={`transition-colors py-1.5 md:py-0 text-[clamp(11px,0.9vw,13px)] ${currentTheme.navText} hover:underline md:mt-0.5`}>
                    logout
                  </button>
                  <span className="hidden md:block opacity-50 uppercase tracking-widest text-[clamp(8px,0.7vw,10px)] mt-[clamp(2px,0.2vw,4px)]">
                    {currentUser.displayName || "sys.admin"}<br/>active
                  </span>
                </>
              ) : (
                <>
                  <button onClick={onOpenLogin} className={`transition-colors py-1.5 md:py-0 text-[clamp(11px,0.9vw,13px)] ${currentTheme.navText} hover:underline`}>
                    teacher login
                  </button>
                  <span className="hidden md:block opacity-50 uppercase tracking-widest text-[clamp(8px,0.7vw,10px)] mt-[clamp(2px,0.2vw,4px)]">
                    auth<br/>required
                  </span>
                </>
              )}
            </div>
            <svg viewBox="0 0 100 100" className="hidden md:block opacity-90 group-hover:rotate-90 transition-transform duration-700 w-[clamp(36px,4.5vw,70px)] h-[clamp(36px,4.5vw,70px)]">
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
      
      {currentUser && (
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          currentUser={currentUser} 
          currentTheme={currentTheme}
        />
      )}

      {isAdminUser && (
        <TeacherAdminModal
          isOpen={isTeacherAdminOpen}
          onClose={() => setIsTeacherAdminOpen(false)}
          currentUser={currentUser}
        />
      )}
    </>
  );
}