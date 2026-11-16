// 교실 화면의 "선생님께 메시지" 채팅창. 1280×720 교실 화면의 오른쪽 칸을 덮는다.
// 교실 TV 라 반 친구들도 같이 보므로, 1분 동안 안 쓰면 저절로 닫고 닫을 때 쓰던 글을 지운다.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CHAT_IDLE_MS, CHAT_MAX, NAME_MAX, SEND_GAP_MS, cleanText, clockLabel, lastStudentRead } from "@/lib/classroomChat";

const SEND_TIMEOUT_MS = 10000;

export default function ClassroomChatPanel({ messages, readAt, onSend, onClose }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sendState, setSendState] = useState({ sending: false, error: "", waitUntil: 0 });
  const listRef = useRef(null);
  const lastActive = useRef(0);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // 1분 동안 아무도 안 쓰면 닫는다 (교실 화면은 15초마다 다시 그려지므로 onClose 는 ref 로 둔다)
  useEffect(() => {
    lastActive.current = Date.now();
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > CHAT_IDLE_MS) closeRef.current();
    }, 5000);
    return () => clearInterval(t);
  }, []);
  const touch = () => {
    lastActive.current = Date.now();
  };

  // 새 메시지가 오면 맨 아래로
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const lastStudentId = [...messages].reverse().find((m) => m.from === "student")?.id;
  const read = lastStudentRead(messages, readAt);

  const send = async (e) => {
    e.preventDefault();
    touch();
    const clean = cleanText(text, CHAT_MAX);
    if (!clean || sendState.sending) return;
    const nowMs = Date.now();
    if (nowMs < sendState.waitUntil) {
      setSendState((s) => ({ ...s, error: "조금 뒤에 다시 보낼 수 있어요." }));
      return;
    }
    setSendState({ sending: true, error: "", waitUntil: nowMs + SEND_GAP_MS });
    try {
      await Promise.race([
        onSend({ text: clean, name: cleanText(name, NAME_MAX) }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), SEND_TIMEOUT_MS)),
      ]);
      setText("");
      setSendState((s) => ({ ...s, sending: false }));
    } catch {
      setSendState({ sending: false, error: "보내지 못했어요. 인터넷 연결을 확인하고 다시 보내 주세요.", waitUntil: 0 });
    }
  };

  return (
    <section
      aria-label="선생님께 메시지"
      onPointerDown={touch}
      onKeyDown={touch}
      className="h-full min-h-0 bg-[#383838] border-2 border-[#34d399] rounded-[28px] px-5 py-4 flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="text-[20px] font-bold text-[#f5f5f5]">선생님께 메시지</h2>
          <span className="text-[13px] text-[#bdbdbd]">교실 화면이라 친구들도 같이 봐요 · 1분 동안 안 쓰면 닫혀요</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="채팅창 닫기"
          className="shrink-0 w-12 h-12 rounded-full bg-[#4a4a4a] hover:bg-[#555555] text-[#f5f5f5] flex items-center justify-center"
        >
          <X className="w-[22px] h-[22px]" strokeWidth={2.6} />
        </button>
      </div>

      <ol ref={listRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 pr-1" aria-live="polite">
        {messages.length === 0 && <li className="m-auto text-center text-[17px] text-[#bdbdbd]">선생님께 하고 싶은 말을 보내 보세요.</li>}
        {messages.map((m) =>
          m.from === "teacher" ? (
            <li key={m.id} className="self-start max-w-[82%] flex flex-col items-start gap-[3px]">
              <span className="text-[13px] font-bold text-[#fbbf24]">선생님 · {clockLabel(m.at)}</span>
              <span className="bg-[#4a4a4a] text-[#f5f5f5] rounded-[18px_18px_18px_4px] px-3.5 py-2 text-[18px] leading-[1.4] break-words">{m.text}</span>
            </li>
          ) : (
            <li key={m.id} className="self-end max-w-[82%] flex flex-col items-end gap-[3px]">
              <span className="text-[13px] text-[#bdbdbd]">
                {m.name ? `${m.name} · ` : ""}
                {clockLabel(m.at)}
              </span>
              <span className="bg-[#34d399] text-[#052e22] rounded-[18px_18px_4px_18px] px-3.5 py-2 text-[18px] font-medium leading-[1.4] break-words">{m.text}</span>
              {m.id === lastStudentId && read !== null && (
                <span className={`text-[13px] ${read ? "text-[#34d399] font-bold" : "text-[#bdbdbd]"}`}>{read ? "선생님이 읽었어요" : "아직 안 읽었어요"}</span>
              )}
            </li>
          )
        )}
      </ol>

      <p className="px-3 py-2 rounded-xl bg-[#3a3324] text-[#fde68a] text-[14px] leading-[1.45]">다치거나 많이 아프면 메시지 말고 옆 반이나 교무실 선생님께 바로 가요.</p>

      <form onSubmit={send} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <label className="flex flex-col gap-0.5 w-[130px] shrink-0">
            <span className="text-[12px] text-[#bdbdbd]">이름 (안 써도 돼요)</span>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              autoComplete="off"
              className="w-full h-12 rounded-[14px] border border-[#5a5a5a] bg-[#2b2b2b] text-[#f5f5f5] px-3 text-[17px] placeholder:text-[#8a8a8a] focus:outline-none focus:border-[#34d399]"
            />
          </label>
          <label className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[12px] text-[#bdbdbd]">메시지</span>
            <input
              type="text"
              value={text}
              maxLength={CHAT_MAX}
              onChange={(e) => {
                setText(e.target.value);
                if (sendState.error) setSendState((s) => ({ ...s, error: "" }));
              }}
              placeholder="선생님께 보낼 말"
              autoComplete="off"
              className="w-full h-12 rounded-[14px] border border-[#5a5a5a] bg-[#2b2b2b] text-[#f5f5f5] px-3 text-[17px] placeholder:text-[#8a8a8a] focus:outline-none focus:border-[#34d399]"
            />
          </label>
        </div>
        {sendState.error && (
          <p role="alert" className="text-[14px] text-[#fca5a5]">
            {sendState.error}
          </p>
        )}
        <button
          type="submit"
          disabled={sendState.sending || !text.trim()}
          className="h-[52px] rounded-2xl bg-[#34d399] hover:bg-[#6ee7b7] disabled:bg-[#2f7a5f] disabled:text-[#0b3b2c] text-[#052e22] text-[19px] font-bold"
        >
          {sendState.sending ? "보내는 중…" : "보내기"}
        </button>
      </form>
    </section>
  );
}
