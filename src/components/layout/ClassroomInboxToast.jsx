// 교실에서 학생 메시지가 왔을 때 포털 오른쪽 아래에 뜨는 알림 (어느 탭을 보고 있어도).
import { useState } from "react";
import { MessageSquare } from "lucide-react";

export default function ClassroomInboxToast({ latest, count, onOpen }) {
  const [dismissedId, setDismissedId] = useState(null);
  if (!latest || latest.message.id === dismissedId) return null;
  const { screen, message } = latest;

  return (
    <div
      role="status"
      className="ui-pop fixed left-4 right-4 bottom-4 md:left-auto md:right-6 md:bottom-6 md:w-[400px] z-[100] bg-[#1f1f1f] border-2 border-emerald-400 rounded-[18px] px-[18px] py-4 flex flex-col gap-2.5 shadow-2xl font-sans"
    >
      <div className="flex items-center gap-2.5">
        <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0" strokeWidth={2.4} />
        <span className="text-[15px] font-bold text-[#f5f5f5]">
          {screen.grade}학년 {screen.classNum}반 교실에서 메시지가 왔어요{count > 1 ? ` (${count}개)` : ""}
        </span>
      </div>
      <p className="text-[14px] text-[#c4c4c4] leading-relaxed truncate">
        {message.name ? `${message.name} · ` : ""}
        {message.text}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setDismissedId(message.id)}
          className="h-[38px] px-3.5 rounded-[10px] border border-[#4a4a4a] text-[#c4c4c4] hover:text-white text-[13px]"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissedId(message.id);
            onOpen(screen);
          }}
          className="h-[38px] px-4 rounded-[10px] bg-emerald-400 hover:bg-emerald-300 text-[#052e22] text-[13px] font-bold"
        >
          보고 답장하기
        </button>
      </div>
    </div>
  );
}
