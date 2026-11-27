// POST /api/chat-push  { sid: 교실 화면 ID, mid: 방금 보낸 메시지 ID }
// 교실 화면(학생 쪽)이 채팅을 보낸 직후 부른다. 그 메시지가 정말 방금 학생이 보낸 것인지 Firestore 에서 확인하고,
// 그 교실 화면에 등록된 선생님 기기들에 휴대폰 알림을 보낸다. 선생님 답장에는 보내지 않는다.
//
// Vercel 환경 변수: PUSH_PRIVATE_KEY (필수, 알림 서명용 비밀 열쇠 — 공개 쪽은 src/lib/chatPush.js 의 PUSH_PUBLIC_KEY)
//                   PUSH_SUBJECT (선택, "https://…" 연락 주소. 없으면 이 사이트 주소)
import {
  PUSH_MAX_DEVICES,
  PUSH_PUBLIC_KEY,
  chatPushPayload,
  checkPushRequest,
  isFreshStudentMessage,
  isPushEndpointOk,
  pushTopic,
} from "../src/lib/chatPush.js";
import { getDocument, listDocuments } from "./_lib/firestoreRest.js";
import { sendWebPush } from "./_lib/webPush.js";

// 같은 메시지로 여러 번 불려도 한 번만 보낸다 (이 서버 기능이 켜져 있는 동안. 휴대폰 쪽도 같은 메시지는 다시 울리지 않는다)
const recentlySent = new Map();
const RECENT_MS = 5 * 60 * 1000;

function remember(key, now) {
  for (const [k, t] of recentlySent) if (now - t > RECENT_MS) recentlySent.delete(k);
  if (recentlySent.has(key)) return false;
  recentlySent.set(key, now);
  return true;
}

function siteSubject(req) {
  if (process.env.PUSH_SUBJECT) return process.env.PUSH_SUBJECT;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `https://${host}` : "https://vercel.app";
}

// 다른 사이트의 페이지가 부르는 것은 받지 않는다 (교실 화면은 같은 주소에서 부른다)
function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method" });
  }
  if (!sameSite(req)) return res.status(403).json({ error: "origin" });
  const privateKey = process.env.PUSH_PRIVATE_KEY;
  if (!privateKey) return res.status(503).json({ error: "not-configured" });

  const request = checkPushRequest(readBody(req));
  if (!request) return res.status(400).json({ error: "bad-request" });
  const { sid, mid } = request;

  const now = Date.now();
  const [screen, message] = await Promise.all([
    getDocument(`classroom_screens/${sid}`),
    getDocument(`classroom_screens/${sid}/messages/${mid}`),
  ]);
  if (!screen || !message) return res.status(404).json({ error: "not-found" });
  if (!isFreshStudentMessage({ from: message.from, at: message.createdAt }, now)) return res.status(200).json({ sent: 0, skipped: "not-fresh" });
  if (!remember(`${sid}/${mid}`, now)) return res.status(200).json({ sent: 0, skipped: "duplicate" });

  const devices = (await listDocuments(`classroom_screens/${sid}/push`, PUSH_MAX_DEVICES * 2)).filter(
    (d) => isPushEndpointOk(d.endpoint) && typeof d.p256dh === "string" && typeof d.auth === "string"
  );
  if (devices.length === 0) return res.status(200).json({ sent: 0, skipped: "no-devices" });

  const payload = chatPushPayload(sid, mid, screen, { text: message.text, name: message.name, at: message.createdAt });
  const vapid = { publicKey: PUSH_PUBLIC_KEY, privateKey, subject: siteSubject(req) };
  const results = await Promise.all(
    devices.slice(0, PUSH_MAX_DEVICES * 2).map((d) =>
      sendWebPush({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { vapid, topic: pushTopic(sid) }).catch(() => 0)
    )
  );
  const sent = results.filter((s) => s >= 200 && s < 300).length;
  // 404·410 = 그 기기의 구독이 끝남 (선생님 화면의 기기 목록에서 빼면 된다)
  const gone = devices.filter((_, i) => results[i] === 404 || results[i] === 410).map((d) => d.id);
  return res.status(200).json({ sent, failed: results.length - sent, gone });
}
