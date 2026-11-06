import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// 달력 일정(work_events). 업무 카드(work_tasks)를 가리키되, 카드가 지워져도 일정이 남도록
// 카드 이름(title)과 파트(part)를 일정에 복사해 둔다.
//   { taskId: "" | 카드 ID, title, part, start: "YYYY-MM-DD", end: "YYYY-MM-DD", note, done, createdAt }
// 필드를 바꾸면 firestore.rules 의 work_events 규칙도 같이 바꿀 것.

/** id 가 없으면 새로 만들고, 있으면 고친다. data = { taskId, title, part, start, end, note, done } */
export async function saveWorkEvent(id, data) {
  const fields = {
    taskId: data.taskId || "",
    title: data.title,
    part: data.part,
    start: data.start,
    end: data.end,
    note: data.note,
    done: !!data.done,
  };
  if (id) {
    await updateDoc(doc(db, "work_events", id), fields);
    return id;
  }
  const ref = await addDoc(collection(db, "work_events"), { ...fields, createdAt: serverTimestamp() });
  return ref.id;
}

export function setWorkEventDone(id, done) {
  return updateDoc(doc(db, "work_events", id), { done: !!done });
}

export function deleteWorkEvent(id) {
  return deleteDoc(doc(db, "work_events", id));
}
