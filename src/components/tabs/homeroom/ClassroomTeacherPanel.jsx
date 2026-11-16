// 내 학급 › 교실 화면: 선생님 쪽 "교실에 띄울 메시지"와 "교실 채팅".
// 답장도 교실 TV 에 뜨므로 반 친구들이 같이 본다. "읽음"은 선생님이 확인 단추를 누르거나 답장할 때만 바뀐다
// (교실 컴퓨터에 선생님이 로그인해 둔 채로 자리를 비워도 저절로 읽음이 되지 않게).
import { useEffect, useRef, useState } from "react";
import { Megaphone, MessageSquare } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { clearNotice, deleteMessages, markRead, sendMessage, setNotice } from "@/lib/classroomApi";
import { CHAT_MAX, NOTICE_MAX, cleanText, clockLabel, noticeToday, todayMessages, unreadFromStudents } from "@/lib/classroomChat";
import { useNow } from "@/lib/useScreenAwake";
import { dateKey } from "@/lib/workCalendar";

function NoticeCard({ screen, today }) {
  const { toast } = useDialog();
  const notice = noticeToday(screen, today);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const clean = cleanText(draft, NOTICE_MAX);

  const post = async () => {
    if (!clean || saving) return;
    setSaving(true);
    try {
      await setNotice(screen.id, clean, today);
      setDraft("");
      toast("교실 화면에 띄웠어요.", "success");
    } catch {
      toast("띄우지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    } finally {
      setSaving(false);
    }
  };

  const takeDown = async () => {
    try {
      await clearNotice(screen.id);
      toast("메시지를 내렸어요.", "success");
    } catch {
      toast("내리지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    }
  };

  return (
    <section aria-labelledby="classroom-notice-title" className="bg-surface border border-line rounded-card p-5 md:p-6 flex flex-col gap-3">
      <h3 id="classroom-notice-title" className="flex items-center gap-2 text-[16px] md:text-[18px] font-bold text-white">
        <Megaphone className="w-4 h-4 text-amber-300" strokeWidth={2.4} />
        교실에 띄울 메시지
      </h3>

      {notice ? (
        <div className="rounded-field border-2 border-amber-400 bg-[#3a3324] px-4 py-3 flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-amber-400">
            지금 교실에 떠 있어요{screen.noticeAt ? ` · ${clockLabel(screen.noticeAt)}부터` : ""}
          </span>
          <span className="text-[15px] font-bold text-[#fff7e0] leading-relaxed break-keep">{notice}</span>
          <button
            type="button"
            onClick={takeDown}
            className="self-start mt-1 h-9 px-3.5 rounded-[10px] border border-amber-700 text-amber-200 hover:bg-amber-400/10 text-[13px] font-medium"
          >
            내리기
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">지금 교실에 떠 있는 메시지가 없어요. 교실 화면 맨 위가 비어 있어요.</p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-muted">{notice ? "새 메시지 (띄우면 지금 것과 바뀌어요)" : "새 메시지"}</span>
        <textarea
          rows={3}
          value={draft}
          maxLength={NOTICE_MAX + 10}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="예) 오늘 종례 없이 바로 하교해요."
          className="w-full rounded-field border border-line bg-well text-ink px-3.5 py-3 text-[15px] leading-relaxed resize-none placeholder:text-ink-ghost focus:outline-none focus:border-amber-400"
        />
      </label>
      <div className="flex items-center justify-between gap-3 -mt-1">
        <span className="text-[12px] text-ink-faint leading-relaxed">
          <span className={`font-mono ${clean.length >= NOTICE_MAX ? "text-amber-300" : ""}`}>
            {clean.length} / {NOTICE_MAX}자
          </span>{" "}
          · 오늘 하루만 떠 있어요. 다음 날 아침이면 저절로 내려가요.
        </span>
        <button
          type="button"
          onClick={post}
          disabled={!clean || saving}
          className="shrink-0 h-11 px-5 rounded-field bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#3a2a05] text-[14px] font-bold"
        >
          {saving ? "띄우는 중…" : notice ? "바꿔 띄우기" : "교실에 띄우기"}
        </button>
      </div>
    </section>
  );
}

function ChatCard({ screen, messages, now }) {
  const { toast, confirm } = useDialog();
  const chat = todayMessages(messages, now);
  const unread = unreadFromStudents(chat, screen.teacherReadAt);
  const unreadIds = new Set(unread.map((m) => m.id));
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const markSeen = () => {
    if (unread.length > 0) markRead(screen.id).catch(() => {});
  };

  const send = async (e) => {
    e.preventDefault();
    const text = cleanText(reply, CHAT_MAX);
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage(screen.id, { from: "teacher", text });
      setReply("");
      markRead(screen.id).catch(() => {});
    } catch {
      toast("보내지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    } finally {
      setSending(false);
    }
  };

  const clearToday = async () => {
    const ok = await confirm("오늘 대화를 모두 지울까요? 교실 화면에서도 사라져요.", { danger: true, confirmText: "지우기" });
    if (!ok) return;
    try {
      await deleteMessages(screen.id, chat.map((m) => m.id));
      toast("오늘 대화를 지웠어요.", "success");
    } catch {
      toast("지우지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    }
  };

  return (
    <section aria-labelledby="classroom-chat-title" className="bg-surface border border-line rounded-card p-5 md:p-6 flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 id="classroom-chat-title" className="flex items-center gap-2 text-[16px] md:text-[18px] font-bold text-white">
            <MessageSquare className="w-4 h-4 text-emerald-400" strokeWidth={2.4} />
            교실 채팅
          </h3>
          {unread.length > 0 && (
            <button
              type="button"
              onClick={markSeen}
              className="px-2.5 py-0.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-[#052e22] text-[12px] font-bold"
              title="누르면 교실 화면에 '선생님이 읽었어요'가 떠요"
            >
              새 메시지 {unread.length} · 확인
            </button>
          )}
        </div>
        {chat.length > 0 && (
          <button type="button" onClick={clearToday} className="h-8 px-3 rounded-[10px] border border-line text-ink-muted hover:text-white hover:border-line-hover text-[12px]">
            오늘 대화 지우기
          </button>
        )}
      </div>

      <ol ref={listRef} className="h-[260px] overflow-y-auto rounded-field bg-well p-3.5 flex flex-col gap-2.5" aria-live="polite">
        {chat.length === 0 && <li className="m-auto text-[13px] text-ink-faint">오늘 교실에서 온 메시지가 없어요.</li>}
        {chat.map((m) =>
          m.from === "student" ? (
            <li key={m.id} className="self-start max-w-[85%] flex flex-col items-start gap-[3px]">
              <span className={`text-[12px] ${unreadIds.has(m.id) ? "text-emerald-400 font-bold" : "text-ink-muted"}`}>
                교실{m.name ? ` · ${m.name}` : ""} · {clockLabel(m.at)}
                {unreadIds.has(m.id) ? " · 새 메시지" : ""}
              </span>
              <span className="bg-raised text-ink-strong rounded-[16px_16px_16px_4px] px-3 py-2 text-[15px] leading-relaxed break-words">{m.text}</span>
            </li>
          ) : (
            <li key={m.id} className="self-end max-w-[85%] flex flex-col items-end gap-[3px]">
              <span className="text-[12px] text-ink-muted">나 · {clockLabel(m.at)}</span>
              <span className="bg-emerald-400 text-[#052e22] rounded-[16px_16px_4px_16px] px-3 py-2 text-[15px] font-medium leading-relaxed break-words">{m.text}</span>
            </li>
          )
        )}
      </ol>

      <form onSubmit={send} className="flex gap-2">
        <input
          type="text"
          value={reply}
          maxLength={CHAT_MAX}
          onChange={(e) => setReply(e.target.value)}
          onFocus={markSeen}
          placeholder="답장 쓰기"
          aria-label="답장"
          className="flex-1 min-w-0 h-11 rounded-field border border-line bg-well text-ink px-3.5 text-[15px] placeholder:text-ink-ghost focus:outline-none focus:border-emerald-400"
        />
        <button
          type="submit"
          disabled={!reply.trim() || sending}
          className="shrink-0 h-11 px-5 rounded-field bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 text-[#052e22] text-[14px] font-bold"
        >
          보내기
        </button>
      </form>
      <p className="-mt-1 text-[12px] text-ink-faint">답장은 교실 TV에 떠서 반 친구들도 같이 봐요. 대화는 일주일 지나면 저절로 지워져요.</p>
    </section>
  );
}

export default function ClassroomTeacherPanel({ screen, messages }) {
  const now = useNow(30000);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <NoticeCard screen={screen} today={dateKey(now)} />
      <ChatCard screen={screen} messages={messages} now={now} />
    </div>
  );
}
