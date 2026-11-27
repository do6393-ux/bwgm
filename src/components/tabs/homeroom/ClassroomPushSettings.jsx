// 교실 채팅 카드 맨 아래 "휴대폰 알림": 이 기기로 알림 받기 · 알림 받는 기기 목록(이 기기는 끄기, 다른 기기는 빼기).
// 학생이 교실에서 채팅을 보내면 여기 등록된 기기에 알림이 간다 (src/lib/chatPush.js 의 흐름 설명 참고).
import { useEffect, useState } from "react";
import { Bell, BellOff, Monitor, Smartphone } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { PUSH_MAX_DEVICES, isPhoneLike } from "@/lib/chatPush";
import { enablePush, healPushDevice, pushSupport, thisDeviceId } from "@/lib/chatPushClient";
import { deletePushDevice, watchPushDevices } from "@/lib/classroomApi";

const EMPTY = [];
const isPhoneLabel = (label) => /안드로이드|아이폰|아이패드/.test(label);
const browserOf = (label) => String(label || "").split(" · ").pop();
const sinceLabel = (d) => (d ? `${d.getMonth() + 1}월 ${d.getDate()}일부터` : "방금");

export default function ClassroomPushSettings({ screen }) {
  const { toast, confirm } = useDialog();
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const phone = isPhoneLike(ua);
  const thing = phone ? "휴대폰" : "기기";

  const [devices, setDevices] = useState({ id: null, list: EMPTY });
  useEffect(() => watchPushDevices(screen.id, (list) => setDevices({ id: screen.id, list })), [screen.id]);
  const list = devices.id === screen.id ? devices.list : EMPTY;

  const [support, setSupport] = useState(() => pushSupport());
  const [myId, setMyId] = useState(null);
  const [checkN, setCheckN] = useState(0);
  useEffect(() => {
    let alive = true;
    thisDeviceId().then((id) => {
      if (alive) setMyId(id);
    });
    return () => {
      alive = false;
    };
  }, [checkN]);

  // 브라우저가 이 기기의 구독을 바꿨으면 목록을 고쳐 둔다
  useEffect(() => {
    if (myId && list.length > 0) healPushDevice(screen.id, list, myId).catch(() => {});
  }, [screen.id, myId, list]);

  const registered = !!myId && list.some((d) => d.id === myId);
  const full = !registered && list.length >= PUSH_MAX_DEVICES;
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await enablePush(screen.id);
      if (result === "ok") {
        setCheckN((n) => n + 1);
        toast(`알림을 켰어요. 교실에서 채팅이 오면 ${phone ? "이 휴대폰이" : "이 기기가"} 울려요.`, "success");
      } else if (result === "dismissed") {
        toast("'허용'을 눌러야 알림이 와요. 다시 눌러 주세요.", "error");
      } else {
        setSupport(result === "blocked" ? "blocked" : "unsupported");
      }
    } catch {
      toast("알림을 켜지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  };

  const recheck = () => {
    setSupport(pushSupport());
    setCheckN((n) => n + 1);
  };

  const remove = async (device) => {
    const mine = device.id === myId;
    if (!mine) {
      const ok = await confirm(`'${device.label || "다른 기기"}'를 뺄까요? 그 기기에는 더 이상 알림이 가지 않아요.`, { confirmText: "빼기", danger: true });
      if (!ok) return;
    }
    try {
      await deletePushDevice(screen.id, device.id);
      toast(mine ? `이 ${thing}의 알림을 껐어요.` : "기기를 뺐어요.", "success");
    } catch {
      toast("바꾸지 못했어요. 잠시 뒤 다시 해 주세요.", "error");
    }
  };

  return (
    <div className="border-t border-line pt-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {support === "blocked" ? (
          <BellOff className="w-4 h-4 text-amber-300" strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <Bell className={`w-4 h-4 ${support === "unsupported" ? "text-ink-muted" : "text-emerald-400"}`} strokeWidth={2.4} aria-hidden="true" />
        )}
        <h4 className="text-[15px] font-bold text-ink-strong">휴대폰 알림</h4>
        {registered && <span className="px-2.5 py-px rounded-full bg-emerald-400 text-[#052e22] text-[12px] font-bold">켜짐</span>}
        {!registered && support === "blocked" && <span className="px-2.5 py-px rounded-full bg-amber-400 text-[#3a2a05] text-[12px] font-bold">막혀 있어요</span>}
      </div>

      {support === "unsupported" && (
        <>
          <p className="text-[13px] text-ink leading-relaxed">이 브라우저에서는 알림을 받을 수 없어요.</p>
          <ul className="rounded-field bg-well px-3.5 py-3 flex flex-col gap-2 text-[13px] text-ink-muted leading-relaxed">
            <li>
              <b className="text-ink-strong">아이폰·아이패드</b> · 사파리에서 공유 › '홈 화면에 추가'를 한 뒤, 홈 화면의 포털 아이콘으로 열고 다시 로그인해서
              눌러 주세요. (iOS·iPadOS 16.4 이상)
            </li>
            <li>
              <b className="text-ink-strong">안드로이드</b> · 삼성 인터넷이나 Chrome 으로 열어 주세요. 카톡 안에서 연 창은 알림을 못 받아요.
            </li>
          </ul>
        </>
      )}

      {support === "blocked" && !registered && (
        <>
          <p className="text-[13px] text-ink leading-relaxed">
            이 브라우저에서 포털 알림이 '차단'으로 되어 있어요. 주소창 왼쪽 자물쇠(또는 메뉴 › 설정 › 사이트 권한 › 알림)에서 '허용'으로 바꾼 뒤 다시 눌러
            주세요.
          </p>
          <button
            type="button"
            onClick={recheck}
            className="h-11 rounded-field border-[1.5px] border-amber-400 text-amber-200 hover:bg-amber-400/10 text-[14px] font-bold"
          >
            바꿨어요, 다시 확인
          </button>
        </>
      )}

      {support === "ok" && !registered && (
        <>
          <p className="text-[13px] text-ink-muted leading-relaxed">
            학생이 채팅을 보내면 이 {thing}에 알림이 와요. 포털을 닫아 두거나 화면이 꺼져 있어도 와요.
          </p>
          <button
            type="button"
            onClick={turnOn}
            disabled={busy || full}
            className="h-11 rounded-field border-[1.5px] border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40 text-[14px] font-bold flex items-center justify-center gap-2"
          >
            <Bell className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />
            {busy ? "켜는 중…" : phone ? "이 휴대폰으로 알림 받기" : "이 기기로 알림 받기"}
          </button>
          {full && <p className="text-[12px] text-amber-300">기기는 {PUSH_MAX_DEVICES}대까지예요. 아래에서 안 쓰는 기기를 빼 주세요.</p>}
        </>
      )}

      {list.length > 0 && (
        <ul className="rounded-field bg-well py-1 flex flex-col" aria-label="알림 받는 기기">
          {list.map((d, i) => {
            const mine = d.id === myId;
            const Icon = isPhoneLabel(d.label) ? Smartphone : Monitor;
            return (
              <li key={d.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <Icon className={`w-5 h-5 shrink-0 ${mine ? "text-emerald-400" : "text-ink-muted"}`} strokeWidth={2} aria-hidden="true" />
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className={`text-[14px] truncate ${mine ? "font-bold text-ink-strong" : "text-ink"}`}>
                    {mine ? (
                      <>
                        이 {thing} <span className="font-normal text-ink-muted">· {browserOf(d.label)}</span>
                      </>
                    ) : (
                      d.label || "다른 기기"
                    )}
                  </span>
                  <span className="text-[12px] text-ink-muted">{sinceLabel(d.createdAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d)}
                  className={`shrink-0 h-9 px-3.5 rounded-[10px] border border-line-strong hover:border-line-hover text-[13px] ${mine ? "text-ink" : "text-rose-300"}`}
                >
                  {mine ? "끄기" : "빼기"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {registered && (
        <p className="text-[12px] text-ink-faint leading-relaxed">
          교실 컴퓨터(또는 PC 에서 연 교실 화면 주소)에서 채팅을 보내 보면 알림이 오는지 시험할 수 있어요.
          {/Android/.test(ua) ? ` 알림이 늦게 오면 휴대폰 설정 › 애플리케이션 › ${browserOf(list.find((d) => d.id === myId)?.label)} › 배터리를 '제한 없음'으로 바꿔 주세요.` : ""}
        </p>
      )}
    </div>
  );
}
