// 내 학급 "교실 화면" 작은 탭: 로그인 없이 띄우는 교실 주소 · 선생님 메시지 · 교실 채팅 · 미리보기(전체 화면).
// 교실 화면은 선생님마다·반마다 하나 (classroom_screens 문서, 만든 선생님만 고친다).
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Link2, Maximize, RefreshCw } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { createScreen, pruneOldMessages, replaceScreen, sendMessage, watchMessages, watchMyScreens } from "@/lib/classroomApi";
import { KEEP_DAYS, screenLink } from "@/lib/classroomChat";
import { notifyTeacherPhone } from "@/lib/chatPushClient";
import { useFullscreen, useWakeLock } from "@/lib/useScreenAwake";
import ClassroomScreen from "./ClassroomScreen";
import ClassroomTeacherPanel from "./ClassroomTeacherPanel";

// focusChat: 처음 열 때 교실 채팅 카드까지 내려 준다 (알림을 눌러 들어왔을 때)
export default function SubtabClassroom({ grade, classNum, currentUser, focusChat = false }) {
  const uid = currentUser?.uid || null;
  const { toast, confirm } = useDialog();
  const boxRef = useRef(null);
  const linkRef = useRef(null);
  const [full, enterFull] = useFullscreen(boxRef);
  useWakeLock(full); // 전체 화면으로 띄워 둔 동안에는 화면이 꺼지지 않게

  // 내가 만든 교실 화면들: undefined 불러오는 중 | null 읽지 못함 | 목록
  const [screens, setScreens] = useState(undefined);
  useEffect(() => (uid ? watchMyScreens(uid, setScreens) : undefined), [uid]);
  const screen = Array.isArray(screens) ? screens.find((s) => s.grade === grade && s.classNum === classNum) || null : null;
  const screenId = screen?.id || null;

  const [messages, setMessages] = useState({ id: null, list: null });
  useEffect(() => {
    if (!screenId) return undefined;
    return watchMessages(screenId, (list) => setMessages({ id: screenId, list }));
  }, [screenId]);
  const msgList = messages.id === screenId ? messages.list : null;

  // 일주일 지난 대화는 지운다 (주소마다 한 번)
  const pruned = useRef(new Set());
  useEffect(() => {
    if (!screenId || pruned.current.has(screenId)) return;
    pruned.current.add(screenId);
    const before = new Date();
    before.setDate(before.getDate() - KEEP_DAYS);
    pruneOldMessages(screenId, before).catch(() => {});
  }, [screenId]);

  const link = screenId ? screenLink(window.location.origin, screenId) : "";
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await createScreen(uid, grade, classNum);
      toast("교실 화면 주소를 만들었어요.", "success");
    } catch {
      toast("주소를 만들지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  };

  const renew = async () => {
    if (!screen || busy) return;
    const ok = await confirm(
      "주소를 바꾸면 예전 주소로 띄운 교실 화면은 더 이상 열리지 않아요. 교실 컴퓨터에서 새 주소를 다시 열어 주세요. 대화도 함께 지워져요.",
      { title: "주소 바꾸기", danger: true, confirmText: "주소 바꾸기" }
    );
    if (!ok) return;
    setBusy(true);
    try {
      await replaceScreen(screen);
      toast("새 주소를 만들었어요. 교실 컴퓨터에서 새 주소를 열어 주세요.", "success");
    } catch {
      toast("주소를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("주소를 복사했어요. 교실 컴퓨터에서 열어 주세요.", "success");
    } catch {
      linkRef.current?.select();
      toast("복사가 안 돼요. 주소 칸을 눌러 직접 복사해 주세요.", "error");
    }
  };

  const onEnterFull = async () => {
    try {
      await enterFull();
    } catch {
      toast("이 기기에서는 전체 화면을 쓸 수 없어요. 교실 컴퓨터나 TV 브라우저에서 열어 주세요.", "error");
    }
  };

  // 선생님 계정으로 전체 화면을 띄워 둔 교실에서도 학생이 채팅을 보낼 수 있게 (주소가 있을 때만).
  // 휴대폰 알림도 교실 컴퓨터에서 보낸 것과 똑같이 간다
  const onStudentSend = ({ text, name }) =>
    sendMessage(screenId, { from: "student", text, name }).then((ref) => {
      notifyTeacherPhone(screenId, ref.id);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 bg-surface border border-line rounded-card p-5 md:p-6">
        <div className="min-w-0">
          <h3 className="text-[18px] md:text-[20px] font-bold text-white">교실 화면</h3>
          <p className="mt-1 text-[13px] text-ink-muted leading-relaxed">
            교실 TV·전자칠판에 띄워 두는 화면이에요. 시간표·급식·학사일정이 저절로 바뀌어요. 전체 화면에서 Esc 를 누르면 돌아와요.
          </p>
        </div>
        <button
          type="button"
          onClick={onEnterFull}
          className="flex items-center justify-center gap-2 shrink-0 px-5 py-3 rounded-full bg-emerald-400 hover:bg-emerald-300 text-[#052e22] text-[14px] font-bold transition-colors active:scale-95"
        >
          <Maximize className="w-4 h-4" strokeWidth={2.4} />
          전체 화면으로 띄우기
        </button>
      </div>

      <section aria-labelledby="classroom-link-title" className="bg-surface border border-line rounded-card p-5 md:p-6 flex flex-col gap-3">
        <div>
          <h3 id="classroom-link-title" className="flex items-center gap-2 text-[16px] md:text-[18px] font-bold text-white">
            <Link2 className="w-4 h-4 text-emerald-400" strokeWidth={2.4} />
            로그인 없이 교실에 띄우기
          </h3>
          <p className="mt-1 text-[13px] text-ink-muted leading-relaxed">
            교실 컴퓨터에서 이 주소를 열어 두면 로그인하지 않아도 {grade}학년 {classNum}반 교실 화면이 떠요. 즐겨찾기나 시작 페이지로 두세요. 학생이 보낸 메시지는 선생님께만 와요.
          </p>
        </div>

        {screens === undefined ? (
          <div className="h-11 rounded-field bg-well animate-pulse" aria-label="주소를 불러오는 중" />
        ) : screens === null ? (
          <p className="text-[13px] text-rose-300">교실 화면 주소를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
        ) : !screen ? (
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="self-start h-11 px-5 rounded-field bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 text-[#052e22] text-[14px] font-bold"
          >
            {busy ? "만드는 중…" : `${grade}학년 ${classNum}반 교실 주소 만들기`}
          </button>
        ) : (
          <>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                ref={linkRef}
                type="text"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                aria-label="교실 화면 주소"
                className="flex-1 min-w-0 h-11 rounded-field border border-line bg-well text-ink px-3.5 font-mono text-[13px] focus:outline-none focus:border-emerald-400"
              />
              <div className="grid grid-cols-3 md:flex gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="flex items-center justify-center gap-1.5 h-11 px-2 md:px-4 whitespace-nowrap rounded-field bg-emerald-400 hover:bg-emerald-300 text-[#052e22] text-[13px] font-bold"
                >
                  <Copy className="hidden md:block w-4 h-4" strokeWidth={2.4} />
                  복사
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 h-11 px-2 md:px-4 whitespace-nowrap rounded-field border border-line hover:border-line-hover text-ink text-[13px] font-medium"
                >
                  <ExternalLink className="hidden md:block w-4 h-4" strokeWidth={2.2} />
                  새 창
                </a>
                <button
                  type="button"
                  onClick={renew}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 h-11 px-2 md:px-4 whitespace-nowrap rounded-field border border-line hover:border-rose-300 text-rose-300 disabled:opacity-40 text-[13px] font-medium"
                >
                  <RefreshCw className="hidden md:block w-4 h-4" strokeWidth={2.2} />
                  주소 바꾸기
                </button>
              </div>
            </div>
            <p className="text-[12px] text-ink-faint leading-relaxed">
              주소 바꾸기를 누르면 예전 주소로는 더 안 열려요. 주소가 학생 휴대폰 등으로 퍼졌을 때 쓰세요. 교실 컴퓨터에서 F11 을 누르면 화면을 꽉 채워요.
            </p>
          </>
        )}
      </section>

      {screen && <ClassroomTeacherPanel screen={screen} messages={msgList} focusChat={focusChat} />}

      <div
        ref={boxRef}
        className={full ? "w-full h-full bg-[#2b2b2b]" : "w-full aspect-video bg-[#2b2b2b] rounded-card overflow-hidden border border-line"}
      >
        <ClassroomScreen
          grade={grade}
          classNum={classNum}
          screen={screen}
          messages={msgList}
          chatMode={full && screenId ? "live" : "preview"}
          onSend={onStudentSend}
        />
      </div>
    </div>
  );
}
