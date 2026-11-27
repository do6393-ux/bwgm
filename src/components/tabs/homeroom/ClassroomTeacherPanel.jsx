// 내 학급 › 교실 화면: 선생님 쪽 "교실에 띄울 메시지"와 "교실 채팅", "우리 반 일정".
// 답장도 교실 TV 에 뜨므로 반 친구들이 같이 본다. "읽음"은 선생님이 확인 단추를 누르거나 답장할 때만 바뀐다
// (교실 컴퓨터에 선생님이 로그인해 둔 채로 자리를 비워도 저절로 읽음이 되지 않게).
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Megaphone, MessageSquare, Pencil } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { clearNotice, deleteMessages, markRead, sendMessage, setClassEvents, setNotice } from "@/lib/classroomApi";
import { CHAT_MAX, NOTICE_MAX, cleanText, clockLabel, drawingToday, noticeToday, todayMessages, unreadFromStudents } from "@/lib/classroomChat";
import { CLASS_EVENT_MAX, CLASS_EVENT_TITLE_MAX, checkClassEvent, dropPastEvents, removeClassEvent, upsertClassEvent } from "@/lib/classEvents";
import { shortDate } from "@/lib/classroomScreen";
import { encodeDrawing } from "@/lib/drawing";
import { scheduleWhen } from "@/lib/neisSchedule";
import { useNow } from "@/lib/useScreenAwake";
import { dateKey } from "@/lib/workCalendar";
import ClassroomPushSettings from "./ClassroomPushSettings";
import DrawingPad from "./DrawingPad";
import DrawingView from "./DrawingView";

function NoticeCard({ screen, today }) {
  const { toast } = useDialog();
  const notice = noticeToday(screen, today);
  const drawing = drawingToday(screen, today);
  const showing = !!(notice || drawing);
  const [draft, setDraft] = useState("");
  const [drawDraft, setDrawDraft] = useState(null); // 띄울 그림 (획 목록)
  const [padOpen, setPadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const clean = cleanText(draft, NOTICE_MAX);

  const post = async () => {
    if ((!clean && !drawDraft) || saving) return;
    setSaving(true);
    try {
      await setNotice(screen.id, clean, today, drawDraft ? encodeDrawing(drawDraft) : "");
      setDraft("");
      setDrawDraft(null);
      toast(drawDraft ? "교실 화면에 띄웠어요. 그림은 1분 동안 크게 보여요." : "교실 화면에 띄웠어요.", "success");
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

      {showing ? (
        <div className="rounded-field border-2 border-amber-400 bg-[#3a3324] px-4 py-3 flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-amber-400">
            지금 교실에 떠 있어요{screen.noticeAt ? ` · ${clockLabel(screen.noticeAt)}부터` : ""}
          </span>
          <div className="flex items-start gap-3">
            <span className="flex-1 min-w-0 text-[15px] font-bold text-[#fff7e0] leading-relaxed break-keep">{notice || "(그림만)"}</span>
            {drawing && (
              <div className="shrink-0 w-[112px] aspect-video rounded-[8px] overflow-hidden border border-amber-400/70">
                <DrawingView strokes={drawing} label="교실에 떠 있는 그림" />
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={takeDown}
              className="h-9 px-3.5 rounded-[10px] border border-amber-700 text-amber-200 hover:bg-amber-400/10 text-[13px] font-medium"
            >
              내리기
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(notice);
                setDrawDraft(drawing);
              }}
              className="h-9 px-3.5 rounded-[10px] border border-amber-700 text-amber-200 hover:bg-amber-400/10 text-[13px] font-medium"
            >
              고쳐서 다시 띄우기
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">지금 교실에 떠 있는 메시지가 없어요. 교실 화면 맨 위가 비어 있어요.</p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-muted">{showing ? "새 메시지 (띄우면 지금 것과 바뀌어요)" : "새 메시지"}</span>
        <textarea
          rows={3}
          value={draft}
          maxLength={NOTICE_MAX + 10}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="예) 오늘 종례 없이 바로 하교해요."
          className="w-full rounded-field border border-line bg-well text-ink px-3.5 py-3 text-[15px] leading-relaxed resize-none placeholder:text-ink-ghost focus:outline-none focus:border-amber-400"
        />
      </label>
      <div className="flex items-center gap-3">
        {drawDraft ? (
          <>
            <button
              type="button"
              onClick={() => setPadOpen(true)}
              aria-label="띄울 그림 고치기"
              className="shrink-0 w-[128px] aspect-video rounded-[10px] overflow-hidden border-2 border-amber-400"
            >
              <DrawingView strokes={drawDraft} />
            </button>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => setPadOpen(true)} className="h-9 px-3.5 rounded-[10px] border border-line hover:border-line-hover text-ink text-[13px]">
                그림 고치기
              </button>
              <button type="button" onClick={() => setDrawDraft(null)} className="h-9 px-3.5 rounded-[10px] border border-line hover:border-rose-300 text-rose-300 text-[13px]">
                그림 빼기
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPadOpen(true)}
            className="flex items-center gap-1.5 h-10 px-4 rounded-field border border-amber-400/70 text-amber-200 hover:bg-amber-400/10 text-[13px] font-bold"
          >
            <Pencil className="w-4 h-4" strokeWidth={2.4} />
            그림 그리기
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-faint leading-relaxed">
          <span className={`font-mono ${clean.length >= NOTICE_MAX ? "text-amber-300" : ""}`}>
            {clean.length} / {NOTICE_MAX}자
          </span>{" "}
          · 오늘 하루만 떠 있어요. 다음 날 아침이면 저절로 내려가요.
        </span>
        <button
          type="button"
          onClick={post}
          disabled={(!clean && !drawDraft) || saving}
          className="shrink-0 h-11 px-5 rounded-field bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#3a2a05] text-[14px] font-bold"
        >
          {saving ? "띄우는 중…" : showing ? "바꿔 띄우기" : "교실에 띄우기"}
        </button>
      </div>

      {padOpen && (
        <DrawingPad
          initial={drawDraft}
          onCancel={() => setPadOpen(false)}
          onDone={(strokes) => {
            setDrawDraft(strokes);
            setPadOpen(false);
          }}
        />
      )}
    </section>
  );
}

function ChatCard({ screen, messages, now, focusOnMount }) {
  const { toast, confirm } = useDialog();
  const chat = todayMessages(messages, now);
  const unread = unreadFromStudents(chat, screen.teacherReadAt);
  const unreadIds = new Set(unread.map((m) => m.id));
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const cardRef = useRef(null);

  // 알림을 눌러 들어왔으면 이 카드까지 내려 준다 (위 칸들이 그려진 뒤에)
  useEffect(() => {
    if (!focusOnMount) return undefined;
    const t = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    return () => clearTimeout(t);
  }, [focusOnMount]);

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
    <section
      ref={cardRef}
      aria-labelledby="classroom-chat-title"
      className="bg-surface border border-line rounded-card p-5 md:p-6 flex flex-col gap-3 min-w-0 scroll-mt-4"
    >
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
      <ClassroomPushSettings screen={screen} />
    </section>
  );
}

const EMPTY_FORM = { start: "", end: "", title: "" };
const dateField =
  "w-full h-11 rounded-field border border-line bg-surface text-ink px-3.5 font-mono text-[14px] [color-scheme:dark] focus:outline-none focus:border-amber-400";

function ClassEventsCard({ screen, today }) {
  const { toast } = useDialog();
  const saved = screen.classEvents || [];
  const list = dropPastEvents(saved, today);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const editing = editId && list.some((e) => e.id === editId) ? editId : null;
  const titleLen = cleanText(form.title, CLASS_EVENT_TITLE_MAX).length;
  const full = !editing && list.length >= CLASS_EVENT_MAX;

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const reset = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const checked = checkClassEvent(form, today);
    const result = checked.error ? checked : upsertClassEvent(saved, checked.event, today, editing);
    if (result.error) {
      toast(result.error, "error");
      return;
    }
    setSaving(true);
    try {
      await setClassEvents(screen.id, result.list);
      toast(editing ? "일정을 고쳤어요." : "교실 화면에 일정을 넣었어요.", "success");
      reset();
    } catch {
      toast("저장하지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ev) => {
    try {
      await setClassEvents(screen.id, removeClassEvent(saved, ev.id, today));
      if (editing === ev.id) reset();
      toast(`"${ev.title}" 일정을 지웠어요.`, "success");
    } catch {
      toast("지우지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    }
  };

  return (
    <section aria-labelledby="classroom-events-title" className="md:col-span-2 bg-surface border border-line rounded-card p-5 md:p-6 flex flex-col gap-4 min-w-0">
      <div>
        <h3 id="classroom-events-title" className="flex items-center gap-2 text-[16px] md:text-[18px] font-bold text-white">
          <CalendarPlus className="w-4 h-4 text-amber-300" strokeWidth={2.4} />
          우리 반 일정
        </h3>
        <p className="mt-1 text-[13px] text-ink-muted leading-relaxed">
          교실 화면 "다가오는 일정"에 학사일정과 함께 날짜 순으로 떠요. 교실 화면에는 <span className="font-bold text-amber-300">우리 반</span> 표시가 붙어요.
        </p>
      </div>

      <div className="grid md:grid-cols-[320px_minmax(0,1fr)] gap-4 md:gap-5">
        <form onSubmit={save} className="rounded-field bg-well p-4 flex flex-col gap-3">
          <span className="text-[14px] font-bold text-ink-strong">{editing ? "일정 고치기" : "일정 넣기"}</span>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-muted">날짜</span>
            <input type="date" value={form.start} onChange={(e) => update({ start: e.target.value })} className={dateField} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-muted">
              끝나는 날 <span className="text-ink-faint">(여러 날일 때만)</span>
            </span>
            <span className="flex gap-2">
              <input type="date" value={form.end} min={form.start || undefined} onChange={(e) => update({ end: e.target.value })} className={dateField} />
              {form.end && (
                <button type="button" onClick={() => update({ end: "" })} className="shrink-0 h-11 px-3 rounded-field border border-line hover:border-line-hover text-ink-muted text-[12px]">
                  하루만
                </button>
              )}
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-muted">내용</span>
            <input
              type="text"
              value={form.title}
              maxLength={CLASS_EVENT_TITLE_MAX + 5}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="예) 정보 수행평가"
              className="w-full h-11 rounded-field border border-line bg-surface text-ink px-3.5 text-[15px] placeholder:text-ink-ghost focus:outline-none focus:border-amber-400"
            />
            <span className={`self-end font-mono text-[12px] ${titleLen >= CLASS_EVENT_TITLE_MAX ? "text-amber-300" : "text-ink-faint"}`}>
              {titleLen} / {CLASS_EVENT_TITLE_MAX}자
            </span>
          </label>
          <div className="flex gap-2">
            {editing && (
              <button type="button" onClick={reset} className="h-11 px-4 rounded-field border border-line hover:border-line-hover text-ink text-[14px]">
                취소
              </button>
            )}
            <button
              type="submit"
              disabled={saving || full || !form.start || !titleLen}
              className="flex-1 h-11 px-5 rounded-field bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-[#3a2a05] text-[14px] font-bold"
            >
              {saving ? "저장하는 중…" : editing ? "고쳐서 저장" : "교실 화면에 넣기"}
            </button>
          </div>
          {full && <p className="text-[12px] text-amber-300">일정은 {CLASS_EVENT_MAX}개까지 넣을 수 있어요. 필요 없는 것을 지워 주세요.</p>}
        </form>

        <div className="min-w-0 flex flex-col gap-2">
          <span className="text-[14px] font-bold text-ink-strong">
            넣은 일정 <span className="font-mono font-normal text-ink-muted">{list.length}</span>
          </span>
          {list.length === 0 ? (
            <p className="rounded-field bg-well px-4 py-6 text-center text-[13px] text-ink-faint">아직 넣은 일정이 없어요.</p>
          ) : (
            <ul className="max-h-[330px] overflow-y-auto overscroll-contain flex flex-col gap-2 pr-1">
              {list.map((ev) => {
                const when = scheduleWhen(ev, today);
                return (
                  <li
                    key={ev.id}
                    className={`flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1.5 rounded-field bg-well pl-4 pr-2.5 py-2.5 ${
                      editing === ev.id ? "ring-2 ring-amber-400" : ""
                    }`}
                  >
                    <span className="shrink-0 w-[112px] text-[13px] text-ink-muted leading-snug">
                      {shortDate(ev.start)}
                      {ev.end !== ev.start && (
                        <>
                          <br />~ {shortDate(ev.end)}
                        </>
                      )}
                    </span>
                    <span className="flex-1 min-w-[120px] text-[15px] font-bold text-ink-strong break-keep">{ev.title}</span>
                    <span className={`shrink-0 font-mono text-[14px] font-bold ${when.days <= 7 ? "text-emerald-400" : "text-ink"}`}>{when.label}</span>
                    <span className="shrink-0 flex gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(ev.id);
                          setForm({ start: ev.start, end: ev.end !== ev.start ? ev.end : "", title: ev.title });
                        }}
                        className="h-9 px-3 rounded-[10px] border border-line hover:border-line-hover text-ink text-[13px]"
                      >
                        고치기
                      </button>
                      <button type="button" onClick={() => remove(ev)} className="h-9 px-3 rounded-[10px] border border-line hover:border-rose-300 text-rose-300 text-[13px]">
                        지우기
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[12px] text-ink-faint leading-relaxed">
            지난 일정은 끝난 다음 날 저절로 빠져요. {CLASS_EVENT_MAX}개까지 넣을 수 있어요. 교실 화면에는 가까운 몇 개만 보이고, 그 칸을 누르면 모두 보여요.
          </p>
        </div>
      </div>
    </section>
  );
}

// focusChat: 처음 그릴 때 교실 채팅 카드까지 내려 준다 (휴대폰 알림을 눌러 들어왔을 때)
export default function ClassroomTeacherPanel({ screen, messages, focusChat = false }) {
  const now = useNow(30000);
  const today = dateKey(now);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <NoticeCard screen={screen} today={today} />
      <ChatCard screen={screen} messages={messages} now={now} focusOnMount={focusChat} />
      <ClassEventsCard screen={screen} today={today} />
    </div>
  );
}
