// 교실 화면 메시지·채팅의 Firestore 읽기·쓰기.
//   classroom_screens/{id}            { ownerUid, grade, classNum, noticeText, noticeDay, noticeAt, noticeDrawing?, classEvents?, teacherReadAt, createdAt }
//     noticeDrawing: 선생님 그림 (src/lib/drawing.js 의 문자열). 그림이 없으면 필드를 아예 두지 않는다
//     classEvents: 우리 반 일정 [{ id, title, start, end }] (src/lib/classEvents.js). 넣은 적이 없으면 필드가 없다
//   classroom_screens/{id}/messages   { from: "student"|"teacher", text, name, createdAt }
//   classroom_screens/{id}/push       휴대폰 알림 받는 기기 { endpoint, p256dh, auth, label, createdAt } (src/lib/chatPush.js)
// 문서 ID 는 교실 컴퓨터 주소(?classroom=ID)에 들어가는 무작위 글자다. 규칙은 firestore.rules 참고.
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { makeScreenId } from "@/lib/classroomChat";
import { cleanClassEvents } from "@/lib/classEvents";

const SCREENS = "classroom_screens";
const toDate = (ts) => (ts && typeof ts.toDate === "function" ? ts.toDate() : null);

function screenFrom(snap) {
  const d = snap.data({ serverTimestamps: "estimate" });
  return {
    id: snap.id,
    ownerUid: d.ownerUid,
    grade: d.grade,
    classNum: d.classNum,
    noticeText: d.noticeText || "",
    noticeDay: d.noticeDay || "",
    noticeAt: toDate(d.noticeAt),
    noticeDrawing: typeof d.noticeDrawing === "string" ? d.noticeDrawing : "",
    classEvents: cleanClassEvents(d.classEvents),
    teacherReadAt: toDate(d.teacherReadAt),
  };
}

function messageFrom(snap) {
  const d = snap.data({ serverTimestamps: "estimate" });
  return { id: snap.id, from: d.from, text: d.text || "", name: d.name || "", at: toDate(d.createdAt) };
}

/** 내가 만든 교실 화면 목록 (실시간). cb(목록) · 읽지 못하면 cb(null) */
export function watchMyScreens(uid, cb) {
  return onSnapshot(
    query(collection(db, SCREENS), where("ownerUid", "==", uid)),
    (qs) => cb(qs.docs.map(screenFrom)),
    () => cb(null)
  );
}

/** 교실 화면 한 개 (실시간). cb(화면) · 없으면 cb(false) · 읽지 못하면 cb(null) */
export function watchScreen(id, cb) {
  return onSnapshot(
    doc(db, SCREENS, id),
    (snap) => cb(snap.exists() ? screenFrom(snap) : false),
    () => cb(null)
  );
}

/** 최근 대화 (실시간, 순서는 정하지 않음 — todayMessages 로 거른다). 읽지 못하면 cb(null) */
export function watchMessages(id, cb, max = 80) {
  return onSnapshot(
    query(collection(db, SCREENS, id, "messages"), orderBy("createdAt", "desc"), limit(max)),
    (qs) => cb(qs.docs.map(messageFrom)),
    () => cb(null)
  );
}

/** 새 교실 화면을 만든다. carry: 주소를 바꿀 때 옮겨 갈 메시지·우리 반 일정 */
export async function createScreen(uid, grade, classNum, carry = {}) {
  const id = makeScreenId();
  await setDoc(doc(db, SCREENS, id), {
    ownerUid: uid,
    grade,
    classNum,
    noticeText: carry.noticeText || "",
    noticeDay: carry.noticeDay || "",
    noticeAt: carry.noticeAt ? Timestamp.fromDate(carry.noticeAt) : null,
    ...(carry.noticeDrawing ? { noticeDrawing: carry.noticeDrawing } : {}),
    ...(carry.classEvents?.length ? { classEvents: carry.classEvents } : {}),
    teacherReadAt: null,
    createdAt: serverTimestamp(),
  });
  return id;
}

// 대화 지우기 규칙은 한 건마다 문서를 1~2번 확인하고, 한 번에 묶어 쓰는 요청은 확인을 20번까지만 할 수 있다.
// 그래서 10건씩 나눠 지운다.
const DELETE_CHUNK = 10;

async function deleteRefs(refs) {
  for (let i = 0; i < refs.length; i += DELETE_CHUNK) {
    const batch = writeBatch(db);
    refs.slice(i, i + DELETE_CHUNK).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

/** 교실 화면과 대화·알림 받는 기기를 지운다. 규칙이 지우는 사람을 문서의 ownerUid 로 확인하므로 아래 것부터 지운다 */
export async function deleteScreen(id) {
  const qs = await getDocs(collection(db, SCREENS, id, "messages"));
  await deleteRefs(qs.docs.map((d) => d.ref));
  try {
    const ps = await getDocs(collection(db, SCREENS, id, "push"));
    await deleteRefs(ps.docs.map((d) => d.ref));
  } catch {
    // 알림 기기 규칙을 게시하기 전이면 읽지 못한다 → 기기 문서가 없으니 그냥 넘어간다
  }
  await deleteDoc(doc(db, SCREENS, id));
}

/** 주소 바꾸기: 새 주소를 만들고(지금 메시지·우리 반 일정·알림 받는 기기는 옮김) 예전 주소와 대화는 지운다. 새 ID 를 돌려준다 */
export async function replaceScreen(screen) {
  const id = await createScreen(screen.ownerUid, screen.grade, screen.classNum, screen);
  try {
    const ps = await getDocs(collection(db, SCREENS, screen.id, "push"));
    await Promise.all(ps.docs.map((d) => savePushDevice(id, d.id, d.data())));
  } catch {
    // 기기를 못 옮기면 새 주소에서 "알림 받기"를 다시 누르면 된다
  }
  await deleteScreen(screen.id);
  return id;
}

// ---------- 휴대폰 알림 받는 기기: classroom_screens/{id}/push/{기기 ID} ----------
// { endpoint, p256dh, auth, label, createdAt }. 기기 ID 는 src/lib/chatPush.js 의 pushDeviceId.

/** 알림 받는 기기 목록 (실시간). cb([{ id, label, createdAt }]) · 읽지 못하면 cb([]) */
export function watchPushDevices(id, cb) {
  return onSnapshot(
    collection(db, SCREENS, id, "push"),
    (qs) => {
      const list = qs.docs.map((d) => {
        const v = d.data({ serverTimestamps: "estimate" });
        return { id: d.id, label: v.label || "", createdAt: toDate(v.createdAt) };
      });
      list.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
      cb(list);
    },
    () => cb([])
  );
}

/** 기기 등록(같은 ID 면 덮어씀). data = { endpoint, p256dh, auth, label } */
export function savePushDevice(id, deviceId, { endpoint, p256dh, auth, label = "" }) {
  return setDoc(doc(db, SCREENS, id, "push", deviceId), { endpoint, p256dh, auth, label, createdAt: serverTimestamp() });
}

export function deletePushDevice(id, deviceId) {
  return deleteDoc(doc(db, SCREENS, id, "push", deviceId));
}

/** 선생님 메시지 띄우기. drawing: 그림 문자열 ("" 이면 그림 없음) */
export function setNotice(id, text, day, drawing = "") {
  return updateDoc(doc(db, SCREENS, id), {
    noticeText: text,
    noticeDay: day,
    noticeAt: serverTimestamp(),
    noticeDrawing: drawing ? drawing : deleteField(),
  });
}

export function clearNotice(id) {
  return updateDoc(doc(db, SCREENS, id), { noticeText: "", noticeDay: "", noticeAt: null, noticeDrawing: deleteField() });
}

/** 우리 반 일정 저장 (목록 전체를 바꾼다) */
export function setClassEvents(id, list) {
  return updateDoc(doc(db, SCREENS, id), { classEvents: list.map(({ id: eid, title, start, end }) => ({ id: eid, title, start, end })) });
}

/** 선생님이 대화를 확인했다 (교실 화면에 "읽음"이 뜬다) */
export function markRead(id) {
  return updateDoc(doc(db, SCREENS, id), { teacherReadAt: serverTimestamp() });
}

export function sendMessage(id, { from, text, name = "" }) {
  return addDoc(collection(db, SCREENS, id, "messages"), { from, text, name, createdAt: serverTimestamp() });
}

/** 대화 몇 개를 지운다 (선생님만) */
export function deleteMessages(id, messageIds) {
  return deleteRefs(messageIds.map((mid) => doc(db, SCREENS, id, "messages", mid)));
}

/** before 보다 오래된 대화를 지운다 (선생님 화면을 열 때 부른다) */
export async function pruneOldMessages(id, before) {
  const qs = await getDocs(
    query(collection(db, SCREENS, id, "messages"), where("createdAt", "<", Timestamp.fromDate(before)), limit(300))
  );
  await deleteRefs(qs.docs.map((d) => d.ref));
}
