// 브라우저 쪽 휴대폰 알림: 알림 허락 받기 · 이 기기 등록 · 학생이 채팅을 보낸 뒤 서버 기능 부르기.
// 계산은 src/lib/chatPush.js, 알림을 띄우는 것은 public/push-sw.js.
import { PUSH_PUBLIC_KEY, base64UrlToBytes, deviceLabel, pushDeviceId } from "@/lib/chatPush";
import { deletePushDevice, savePushDevice } from "@/lib/classroomApi";

const SW_URL = "/push-sw.js";
const DEVICE_KEY = "chat_push_device"; // 이 기기를 마지막으로 등록한 기기 ID (구독이 바뀌면 고쳐 주려고)

/** "ok" | "blocked"(알림을 차단함) | "unsupported"(알림을 못 받는 브라우저) */
export function pushSupport() {
  if (typeof window === "undefined" || !window.isSecureContext) return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "ok";
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

const sameKey = (sub) => {
  const key = sub?.options?.applicationServerKey;
  if (!key) return false;
  const a = new Uint8Array(key);
  const b = base64UrlToBytes(PUSH_PUBLIC_KEY);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

/** 이 기기의 기기 ID (알림을 허락했고 구독이 있을 때만, 아니면 null) */
export async function thisDeviceId() {
  if (pushSupport() !== "ok" || Notification.permission !== "granted") return null;
  try {
    const sub = await currentSubscription();
    return sub && sameKey(sub) ? await pushDeviceId(sub.endpoint) : null;
  } catch {
    return null;
  }
}

/**
 * 이 기기로 알림 받기 (단추를 누른 그 순간에 불러야 한다 — 브라우저가 누른 직후에만 허락을 묻게 해 준다).
 * 돌려주는 값: "ok" | "blocked" | "dismissed"(허락 창을 그냥 닫음) | "unsupported"
 */
export async function enablePush(screenId) {
  if (pushSupport() === "unsupported") return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "dismissed";

  await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(PUSH_PUBLIC_KEY) });

  const { endpoint, keys } = sub.toJSON();
  const deviceId = await pushDeviceId(endpoint);
  await savePushDevice(screenId, deviceId, { endpoint, p256dh: keys.p256dh, auth: keys.auth, label: deviceLabel(navigator.userAgent) });
  try {
    localStorage.setItem(DEVICE_KEY, deviceId);
  } catch {
    // 저장소를 못 쓰면 구독이 바뀔 때 저절로 고쳐 주지 못할 뿐이다
  }
  return "ok";
}

/**
 * 브라우저가 이 기기의 구독을 새로 바꿨으면(드물다) 목록의 예전 것을 새 것으로 바꾼다.
 * devices = 지금 목록, nowId = thisDeviceId() 값
 */
export async function healPushDevice(screenId, devices, nowId) {
  let oldId = null;
  try {
    oldId = localStorage.getItem(DEVICE_KEY);
  } catch {
    return;
  }
  if (!nowId || !oldId || oldId === nowId || !devices.some((d) => d.id === oldId) || devices.some((d) => d.id === nowId)) return;
  const sub = await currentSubscription();
  if (!sub) return;
  const { endpoint, keys } = sub.toJSON();
  await savePushDevice(screenId, nowId, { endpoint, p256dh: keys.p256dh, auth: keys.auth, label: deviceLabel(navigator.userAgent) });
  await deletePushDevice(screenId, oldId);
  localStorage.setItem(DEVICE_KEY, nowId);
}

/** 알림을 눌러 들어온 주소의 ?chat=…&g=…&c=… 를 지운다 (새로고침해도 다시 열리지 않게) */
export function clearChatLinkFromUrl() {
  try {
    const u = new URL(window.location.href);
    ["chat", "g", "c"].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${u.hash}`);
  } catch {
    // 주소를 못 바꿔도 채팅은 이미 열렸다
  }
}

/** 학생이 채팅을 보낸 직후: 선생님 휴대폰에 알림을 보내 달라고 서버 기능을 부른다. 실패해도 채팅에는 영향 없음 */
export function notifyTeacherPhone(screenId, messageId) {
  if (!screenId || !messageId) return;
  try {
    fetch("/api/chat-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: screenId, mid: messageId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch 가 없는 아주 오래된 브라우저
  }
}
