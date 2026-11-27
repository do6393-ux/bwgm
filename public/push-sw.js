// 교실 채팅 휴대폰 알림을 받는 서비스 워커.
// 선생님이 내 학급 › 교실 화면 › 교실 채팅에서 "이 휴대폰으로 알림 받기"를 누른 기기에만 등록된다.
// 페이지를 불러오는 일(fetch)에는 손대지 않는다 — 포털이 뜨는 방식은 그대로다.
// 보내는 쪽은 api/chat-push.js, 내용 모양은 src/lib/chatPush.js 의 chatPushPayload.
"use strict";

const ICON = "/icons/icon-192.png";
const BADGE = "/icons/badge-96.png";
const MAX_IDS = 50;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const titleFor = (title, count) => (count > 1 ? `${title} · 새 메시지 ${count}개` : title);

async function showChat(data) {
  const tag = `classroom-${data.sid}`;
  const [old] = await self.registration.getNotifications({ tag });
  const prevIds = old && old.data && Array.isArray(old.data.mids) ? old.data.mids : [];
  const seen = prevIds.includes(data.mid); // 같은 메시지가 두 번 와도 다시 울리지 않는다
  const mids = seen ? prevIds : [...prevIds, data.mid].slice(-MAX_IDS);
  return self.registration.showNotification(titleFor(data.title, mids.length), {
    body: data.body,
    tag, // 같은 교실 알림은 쌓이지 않고 한 칸이 바뀐다
    renotify: !seen,
    icon: ICON,
    badge: BADGE,
    timestamp: typeof data.at === "number" ? data.at : Date.now(),
    data: { sid: data.sid, g: data.g, c: data.c, mids },
  });
}

self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  if (data && data.t === "classroom-chat" && data.sid && data.mid) {
    event.waitUntil(showChat(data));
  } else {
    event.waitUntil(self.registration.showNotification("부원여중 정보교사 포털", { body: "새 알림이 있어요.", icon: ICON, badge: BADGE }));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const query = d.sid ? `?chat=${encodeURIComponent(d.sid)}&g=${encodeURIComponent(d.g)}&c=${encodeURIComponent(d.c)}` : "";
  const url = new URL(`/${query}`, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // 이미 열려 있는 포털 창이 있으면 그 창에서 교실 채팅을 연다 (교실 TV 화면 창은 빼고)
      const portal = windows.find((w) => {
        const u = new URL(w.url);
        return u.origin === self.location.origin && !u.searchParams.has("classroom");
      });
      if (portal) {
        portal.postMessage({ t: "open-classroom-chat", sid: d.sid, g: d.g, c: d.c });
        return portal.focus();
      }
      return self.clients.openWindow(url);
    })()
  );
});
