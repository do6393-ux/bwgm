// 로그인 없이 교실 컴퓨터에 띄우는 교실 화면 (주소 ?classroom=<무작위 글자>).
// 선생님이 내 학급 › 교실 화면에서 만든 주소다. 그 문서의 학년·반, 선생님 메시지, 채팅을 보여 준다.
import { useEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import { watchMessages, watchScreen, sendMessage } from "@/lib/classroomApi";
import { isScreenId } from "@/lib/classroomChat";
import { useFullscreen, useWakeLock } from "@/lib/useScreenAwake";
import ClassroomScreen from "./ClassroomScreen";

const RETRY_MS = 30 * 1000; // 읽기가 거절되면(규칙 게시 전 등) 이만큼 뒤 다시 시도
const BUTTON_SHOW_MS = 4000; // 마우스를 움직이면 전체 화면 단추가 이만큼 보인다
const RELOAD_HOUR = 5; // 새 버전을 받도록 다음 날 새벽에 한 번 새로고침

/** 다음 날 새벽에 새로고침 (인터넷이 될 때, 단추로 들어간 전체 화면이 아닐 때만. F11 전체 화면은 그대로 남는다) */
function useDailyReload() {
  useEffect(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(RELOAD_HOUR, 0, 0, 0);
    let timer = null;
    const tryReload = () => {
      fetch(window.location.href, { method: "HEAD", cache: "no-store" })
        .then((r) => {
          if (r.ok && !document.fullscreenElement) window.location.reload();
          else timer = setTimeout(tryReload, 10 * 60 * 1000);
        })
        .catch(() => {
          timer = setTimeout(tryReload, 10 * 60 * 1000);
        });
    };
    timer = setTimeout(tryReload, next.getTime() - Date.now());
    return () => clearTimeout(timer);
  }, []);
}

function Message({ title, children }) {
  return (
    <div className="fixed inset-0 bg-[#2b2b2b] text-[#f5f5f5] flex flex-col items-center justify-center gap-3 px-6 text-center font-sans">
      <p className="text-[24px] font-bold">{title}</p>
      {children && <p className="text-[16px] text-[#bdbdbd] leading-relaxed">{children}</p>}
    </div>
  );
}

export default function ClassroomKiosk({ screenId }) {
  const valid = isScreenId(screenId);

  // screen: undefined 불러오는 중 | false 없는 주소 | null 읽지 못함 | 문서
  const [attempt, setAttempt] = useState(0);
  const [screen, setScreen] = useState(undefined);
  const [lastGood, setLastGood] = useState(null);
  useEffect(() => {
    if (!valid) return undefined;
    let retry = null;
    const unsub = watchScreen(screenId, (s) => {
      setScreen(s);
      if (s) setLastGood(s);
      if (s === null) retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    });
    return () => {
      unsub();
      clearTimeout(retry);
    };
  }, [screenId, valid, attempt]);

  const [messages, setMessages] = useState(null);
  useEffect(() => {
    if (!valid) return undefined;
    return watchMessages(screenId, (list) => setMessages(list));
  }, [screenId, valid, attempt]);

  const boxRef = useRef(null);
  const [full, enterFull] = useFullscreen(boxRef);
  useWakeLock(valid);
  useDailyReload();

  // 전체 화면 단추: 처음과 마우스를 움직였을 때만 잠깐 보인다
  const [showButton, setShowButton] = useState(true);
  useEffect(() => {
    let t = setTimeout(() => setShowButton(false), BUTTON_SHOW_MS * 2);
    const onMove = () => {
      setShowButton(true);
      clearTimeout(t);
      t = setTimeout(() => setShowButton(false), BUTTON_SHOW_MS);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onMove);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);

  if (!valid) return <Message title="교실 화면 주소가 올바르지 않아요.">선생님께 교실 화면 주소를 다시 받아 주세요.</Message>;
  if (screen === false) return <Message title="이 주소는 이제 쓰지 않아요.">선생님이 주소를 바꿨어요. 새 주소를 받아 주세요.</Message>;

  const shown = screen || lastGood; // 잠깐 못 읽어도 앞의 화면을 그대로 둔다
  if (!shown) {
    if (screen === null) return <Message title="교실 화면을 불러오지 못했어요.">인터넷 연결을 확인해 주세요. 잠시 뒤 저절로 다시 시도해요.</Message>;
    return <div className="fixed inset-0 bg-[#2b2b2b]" />;
  }

  const onSend = ({ text, name }) => sendMessage(screenId, { from: "student", text, name });

  return (
    <div ref={boxRef} className="fixed inset-0 bg-[#2b2b2b]">
      <ClassroomScreen grade={shown.grade} classNum={shown.classNum} screen={shown} messages={messages} chatMode="live" onSend={onSend} />
      {!full && (
        <button
          type="button"
          onClick={() => enterFull().catch(() => {})}
          className={`fixed left-3 bottom-3 flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/70 hover:bg-black text-white text-[14px] font-bold transition-opacity ${
            showButton ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Maximize className="w-4 h-4" strokeWidth={2.4} />
          전체 화면 (F11 키도 돼요)
        </button>
      )}
    </div>
  );
}
