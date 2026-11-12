// 업무분장 카드 저장 (work_tasks). 규칙은 firestore.rules 의 work_tasks 와 같다 (정보 업무 권한자 누구나).
// 업무분장 목록 (work_config/duties). 읽기는 정보 업무 권한자, 고치기는 관리자 · 부장 (firestore.rules 의 isWorkHead).
import { doc, onSnapshot, setDoc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { dutyDocId, normalizeDuties } from "@/lib/workDuties";

/**
 * 업무분장 카드 문서가 없으면 만든다 → 카드 ID.
 * 문서 ID 를 duty_<key> 로 고정해서, 두 사람이 동시에 열어도 카드가 두 장 생기지 않는다.
 */
export async function ensureDutyTask(duty, task) {
  if (task) return task.id;
  const id = dutyDocId(duty.key);
  await setDoc(doc(db, "work_tasks", id), {
    part: duty.part,
    duty: duty.key,
    title: duty.title,
    status: "todo",
    summary: "",
    content: "",
    todos: [],
    createdAt: serverTimestamp(),
  });
  return id;
}

/** 해야 할 일 목록을 통째로 저장한다 */
export function saveTodos(taskId, todos) {
  return updateDoc(doc(db, "work_tasks", taskId), { todos });
}

const dutiesDoc = () => doc(db, "work_config", "duties");

/**
 * 업무분장 목록을 실시간으로 받는다. onChange(목록 | null) — null 이면 아직 고친 적이 없거나 못 읽은 것
 * (그때 화면은 workDuties.js 의 DUTIES 를 쓴다). → 구독 끊는 함수
 */
export function watchDuties(onChange) {
  return onSnapshot(
    dutiesDoc(),
    (snap) => onChange(snap.exists() ? normalizeDuties(snap.data().parts) : null),
    (err) => {
      console.error("work_config/duties listener:", err);
      onChange(null);
    }
  );
}

/**
 * 고친 업무분장 목록을 저장한다. 다른 보직으로 옮긴 업무의 카드 part 도 한 번에 맞춘다.
 * parts: { head|plan|device|nais: [{ key, title, tool? }] } · fixes: [{ id, part }]
 */
export async function saveDuties(parts, fixes, email) {
  const batch = writeBatch(db);
  batch.set(dutiesDoc(), { parts, updatedAt: serverTimestamp(), updatedBy: email || "" });
  for (const f of fixes) batch.update(doc(db, "work_tasks", f.id), { part: f.part });
  await batch.commit();
}
