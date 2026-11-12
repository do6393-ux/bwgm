// 바로가기·연락처 저장 (work_links). 규칙은 firestore.rules 의 work_links (정보 업무 권한자 누구나).
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** 목록을 실시간으로 받는다. onChange(목록, 오류 | null) → 구독 끊는 함수 */
export function watchLinks(onChange) {
  return onSnapshot(
    collection(db, "work_links"),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })), null),
    (err) => {
      console.error("work_links listener:", err);
      onChange([], err);
    }
  );
}

/** id 가 없으면 새로 넣고, 있으면 고친다. data 는 workLinks.js 의 toDoc 결과 */
export function saveLink(id, data) {
  if (id) return updateDoc(doc(db, "work_links", id), { ...data, updatedAt: serverTimestamp() });
  return addDoc(collection(db, "work_links"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export function deleteLink(id) {
  return deleteDoc(doc(db, "work_links", id));
}
