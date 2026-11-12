// 업무분장 카드 저장 (work_tasks). 규칙은 firestore.rules 의 work_tasks 와 같다 (정보 업무 권한자 누구나).
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { dutyDocId } from "@/lib/workDuties";

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
