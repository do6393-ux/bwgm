// 교실 화면의 선생님 메시지 · 채팅 계산 (화면·Firebase 와 분리해서 테스트한다).
// 교실 컴퓨터는 로그인 없이 "?classroom=<아무도 못 맞히는 글자>" 주소로 연다.
import { dateKey } from "./workCalendar";
import { parseDrawing } from "./drawing";

// 글자 수는 firestore.rules 의 classroom_screens 규칙과 같게 둘 것
export const NOTICE_MAX = 50; // TV 맨 위에 두 줄
export const CHAT_MAX = 200;
export const NAME_MAX = 12;

export const CHAT_IDLE_MS = 60 * 1000; // 교실 채팅창을 이만큼 안 쓰면 저절로 닫는다
export const SEND_GAP_MS = 5 * 1000; // 교실에서 연달아 보내지 못하게
export const KEEP_DAYS = 7; // 이보다 오래된 대화는 선생님 화면을 열 때 지운다

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; // 62자
export const SCREEN_ID_LENGTH = 24;

const cryptoBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/** 교실 화면 주소에 넣을 무작위 글자 24자 (randomBytes 는 테스트용) */
export function makeScreenId(randomBytes = cryptoBytes) {
  let id = "";
  while (id.length < SCREEN_ID_LENGTH) {
    for (const b of randomBytes(32)) {
      // 248 = 62 × 4. 그 위는 버려야 글자가 고르게 나온다
      if (b < 248 && id.length < SCREEN_ID_LENGTH) id += ID_CHARS[b % 62];
    }
  }
  return id;
}

/** 주소의 ?classroom= 값이 교실 화면 ID 모양인지 (규칙과 같은 모양) */
export function isScreenId(value) {
  return typeof value === "string" && /^[A-Za-z0-9]{20,40}$/.test(value);
}

/** 교실 컴퓨터에 띄울 주소 */
export function screenLink(origin, id) {
  return `${origin}/?classroom=${id}`;
}

/** 입력한 글을 한 줄로 다듬고 길이를 자른다 */
export function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** 오늘 보여 줄 선생님 메시지 ("" 이면 없음). 메시지는 띄운 날에만 보인다 */
export function noticeToday(screen, today) {
  const text = typeof screen?.noticeText === "string" ? screen.noticeText.trim() : "";
  return text && screen.noticeDay === today ? text : "";
}

/** 오늘 보여 줄 선생님 그림 (획 목록, 없으면 null). 글 메시지처럼 띄운 날에만 */
export function drawingToday(screen, today) {
  return screen?.noticeDay === today ? parseDrawing(screen.noticeDrawing) : null;
}

/**
 * 오늘 대화만, 오래된 것부터.
 * list: [{ id, from: "student"|"teacher", text, name, at: Date | null }] (at 이 없으면 방금 보내서 아직 서버 시각이 없는 것)
 */
export function todayMessages(list, now) {
  const today = dateKey(now);
  return (list || [])
    .map((m) => (m.at ? m : { ...m, at: now }))
    .filter((m) => dateKey(m.at) === today)
    .sort((a, b) => a.at - b.at);
}

/** 선생님이 아직 확인하지 않은 학생 메시지 (readAt: 선생님이 마지막으로 확인한 시각) */
export function unreadFromStudents(messages, readAt) {
  return messages.filter((m) => m.from === "student" && (!readAt || m.at > readAt));
}

/** 마지막 학생 메시지를 선생님이 확인했는지. 학생 메시지가 없으면 null */
export function lastStudentRead(messages, readAt) {
  const last = [...messages].reverse().find((m) => m.from === "student");
  if (!last) return null;
  return !!readAt && readAt >= last.at;
}

/** seenAt 뒤에 온 선생님 답장 수 (교실 화면 단추의 "새 답장") */
export function newReplies(messages, seenAt) {
  return messages.filter((m) => m.from === "teacher" && (!seenAt || m.at > seenAt)).length;
}

/** "HH:MM" */
export function clockLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
