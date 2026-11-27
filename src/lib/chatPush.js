// 교실 채팅 → 선생님 휴대폰 알림(웹 푸시)에서 브라우저와 서버 기능(api/chat-push.js)이 같이 쓰는 계산.
// 서버 기능도 이 파일을 그대로 불러 쓰므로 다른 파일(@/…)이나 firebase 를 불러오지 않는다.
//
// 흐름: 선생님이 "이 휴대폰으로 알림 받기"를 누르면 그 기기의 구독 정보가
//   classroom_screens/{교실 화면 ID}/push/{기기 ID} 에 저장된다.
//   교실에서 학생이 채팅을 보내면 교실 화면이 /api/chat-push 를 부르고, 서버 기능이 그 메시지를 확인한 뒤
//   등록된 기기들에 알림을 보낸다. 기기의 public/push-sw.js 가 받아서 알림을 띄운다.

/** 알림을 보낼 때 서명하는 열쇠의 공개 쪽 (비밀 쪽은 Vercel 환경 변수 PUSH_PRIVATE_KEY 에만 있다) */
export const PUSH_PUBLIC_KEY = "BBUXh1urgXSAAw3qcbN3flx6xqFseTzYaoTtH2EpMay37NLIZFjRaPNvxnLvuZrx9BFA8kbBIS9BI7moDr1rUqI";

/** 서버 기능이 로그인 없이 Firestore 를 읽을 때 쓰는 프로젝트 (src/lib/firebase.js 와 같게) */
export const FIREBASE_PROJECT_ID = "class-208a0";

/** 교실 화면 하나에 등록할 수 있는 기기 수 */
export const PUSH_MAX_DEVICES = 5;

/** 이보다 오래된 메시지로는 알림을 보내지 않는다 (같은 메시지로 나중에 다시 불러 알림을 울리는 것을 막는다) */
export const PUSH_FRESH_MS = 2 * 60 * 1000;

/** 알림 칸에 보일 메시지 길이 */
const BODY_MAX = 180;

const SCREEN_ID_RE = /^[A-Za-z0-9]{20,40}$/;
const MESSAGE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

export const isScreenId = (s) => typeof s === "string" && SCREEN_ID_RE.test(s);

/** /api/chat-push 요청 본문 확인. 맞으면 { sid, mid }, 아니면 null */
export function checkPushRequest(body) {
  if (!body || typeof body !== "object") return null;
  const { sid, mid } = body;
  if (!isScreenId(sid) || typeof mid !== "string" || !MESSAGE_ID_RE.test(mid)) return null;
  return { sid, mid };
}

/** 알림을 보낼 만한 메시지인지: 학생이 보냈고, 방금(2분 안) 저장된 것. at 은 밀리초 */
export function isFreshStudentMessage(message, nowMs) {
  if (!message || message.from !== "student" || typeof message.at !== "number" || !Number.isFinite(message.at)) return false;
  const age = nowMs - message.at;
  return age <= PUSH_FRESH_MS && age >= -30 * 1000; // 서버 시계가 조금 어긋나도 괜찮게 30초 여유
}

const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** 휴대폰 알림에 실어 보낼 내용. screen = { grade, classNum }, message = { text, name, at } */
export function chatPushPayload(sid, mid, screen, message) {
  const text = oneLine(message.text);
  const who = oneLine(message.name) || "교실";
  const body = `${who}: ${text}`;
  return {
    t: "classroom-chat",
    sid,
    mid,
    g: screen.grade,
    c: screen.classNum,
    title: `${screen.grade}학년 ${screen.classNum}반 교실`,
    body: body.length > BODY_MAX ? `${body.slice(0, BODY_MAX - 1)}…` : body,
    at: message.at,
  };
}

/** 아직 휴대폰에 닿지 않은 같은 교실 알림은 새 것으로 바꿔 보내게 하는 이름표 (32자까지, 영문·숫자) */
export const pushTopic = (sid) => `chat${sid}`.slice(0, 32);

/**
 * 알림을 보낼 주소로 괜찮은지: https 이고, 이름 있는 바깥 주소(IP 숫자·localhost 아님).
 * 기기 정보는 선생님 계정만 넣을 수 있지만, 서버 기능이 엉뚱한 곳으로 요청하지 않게 한 번 더 본다.
 */
export function isPushEndpointOk(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return false; // IP 숫자 주소
  return true;
}

/** 기기 ID: 구독 주소의 SHA-256 앞 32자(16진수). 같은 기기를 다시 등록하면 같은 문서를 덮어쓴다 */
export async function pushDeviceId(endpoint) {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 기기 이름: "안드로이드 · 삼성 인터넷", "Windows · Chrome" 처럼.
 * touchPoints = navigator.maxTouchPoints (아이패드는 사파리가 Mac 인 척해서, 터치가 되는 "Mac" 이면 아이패드로 본다)
 */
export function deviceLabel(ua = "", touchPoints = 0) {
  if (/Macintosh/.test(ua) && touchPoints > 1) ua = ua.replace("Macintosh", "iPad");
  const browser = /SamsungBrowser/.test(ua)
    ? "삼성 인터넷"
    : /Whale\//.test(ua)
      ? "웨일"
      : /Edg(A|iOS)?\//.test(ua)
        ? "Edge"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "브라우저";
  const os = /iPad/.test(ua)
    ? "아이패드"
    : /iPhone|iPod/.test(ua)
      ? "아이폰"
      : /Android/.test(ua)
        ? "안드로이드"
        : /CrOS/.test(ua)
          ? "크롬북"
          : /Windows/.test(ua)
            ? "Windows"
            : /Mac OS X|Macintosh/.test(ua)
              ? "Mac"
              : "";
  return os ? `${os} · ${browser}` : browser;
}

/** 휴대폰(태블릿 포함)인지 — 단추 글자를 "이 휴대폰"으로 할지 "이 기기"로 할지 */
export const isPhoneLike = (ua = "") => /Android|iPhone|iPad|iPod|Mobile/.test(ua);

/**
 * 알림을 눌러 들어온 주소(?chat=교실화면ID&g=학년&c=반)를 읽는다. 맞으면 { sid, grade, classNum }, 아니면 null.
 * 알림 쪽(public/push-sw.js)이 이 모양으로 주소를 만든다.
 */
export function readChatLink(params) {
  const sid = params.get("chat");
  const grade = Number(params.get("g"));
  const classNum = Number(params.get("c"));
  if (!isScreenId(sid) || !Number.isInteger(grade) || grade < 1 || grade > 3 || !Number.isInteger(classNum) || classNum < 1 || classNum > 20) return null;
  return { sid, grade, classNum };
}

/** 알림 쪽이 열려 있는 포털 창에 보낸 말({ t: "open-classroom-chat", sid, g, c })을 읽는다. 맞으면 { sid, grade, classNum } */
export function chatLinkFromMessage(data) {
  if (!data || typeof data !== "object" || data.t !== "open-classroom-chat") return null;
  return readChatLink(new URLSearchParams({ chat: String(data.sid ?? ""), g: String(data.g ?? ""), c: String(data.c ?? "") }));
}

/** base64url 글자 → 바이트 (구독할 때 공개 열쇠를 넘기는 모양) */
export function base64UrlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}
