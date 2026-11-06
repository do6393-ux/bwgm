import { Bytes, arrayRemove, arrayUnion, doc, getDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { chunkCount, chunkDocId, chunkRange, newAttachmentId, safeFileName } from "@/lib/attachments";

// 업무 카드(work_tasks/{id})의 attachments 배열에는 이런 항목이 들어간다.
//   { id, name: "원래 파일명.hwp", size: 12345, type: "application/x-hwp", chunks: 3, uploadedAt: 1730000000000 }
// 파일 본체는 하위 컬렉션 work_tasks/{id}/work_files 에 조각(Bytes)으로 들어 있다.
// (Firebase Storage 는 결제 수단 등록이 필요해서 쓰지 않는다. 자세한 구조는 attachments.js 참고)
// 카드 목록은 부모 문서만 읽으므로, 조각이 아무리 많아도 목록 화면은 느려지지 않는다.

const chunkRef = (taskId, attId, index) => doc(db, "work_tasks", taskId, "work_files", chunkDocId(attId, index));

/** 파일을 조각내어 올리고 attachments 항목을 돌려준다. onProgress(0~1) 로 진행률을 알려 준다. */
export async function uploadTaskAttachment(taskId, file, onProgress) {
  const id = newAttachmentId();
  const chunks = chunkCount(file.size);
  try {
    for (let i = 0; i < chunks; i++) {
      const [start, end] = chunkRange(i, file.size);
      const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
      await setDoc(chunkRef(taskId, id, i), { attId: id, index: i, data: Bytes.fromUint8Array(bytes) });
      onProgress?.((i + 1) / chunks);
    }
  } catch (err) {
    await deleteChunks(taskId, id, chunks).catch(() => {}); // 중간에 실패하면 올린 조각을 치운다
    throw err;
  }
  return { id, name: file.name, size: file.size, type: file.type || "", chunks, uploadedAt: Date.now() };
}

/** 올리기가 끝난 파일을 카드에 붙인다. arrayUnion 이라 동시에 여러 파일을 올려도 서로 덮어쓰지 않는다. */
export function addTaskAttachment(taskId, attachment) {
  return updateDoc(doc(db, "work_tasks", taskId), { attachments: arrayUnion(attachment) });
}

/**
 * 카드에서 파일을 떼고 조각도 지운다.
 * 카드 목록에서 먼저 빼므로, 조각 삭제가 실패해도 열 수 없는 항목이 화면에 남지 않는다.
 */
export async function removeTaskAttachment(taskId, attachment) {
  await updateDoc(doc(db, "work_tasks", taskId), { attachments: arrayRemove(attachment) });
  await deleteChunks(taskId, attachment.id, attachment.chunks);
}

/** 카드를 지울 때 딸린 파일 조각들을 치운다. (하위 컬렉션은 부모를 지워도 남기 때문에 따로 지워야 한다) */
export async function deleteTaskFiles(taskId, attachments = []) {
  for (const a of attachments) await deleteChunks(taskId, a.id, a.chunks);
}

async function deleteChunks(taskId, attId, count) {
  const BATCH = 400; // writeBatch 한 번에 500개까지
  for (let from = 0; from < count; from += BATCH) {
    const batch = writeBatch(db);
    for (let i = from; i < Math.min(from + BATCH, count); i++) batch.delete(chunkRef(taskId, attId, i));
    await batch.commit();
  }
}

/** 조각을 받아 이어 붙인 뒤 브라우저 다운로드를 시작한다. onProgress(0~1) 로 진행률을 알려 준다. */
export async function downloadTaskAttachment(taskId, attachment, onProgress) {
  const total = attachment.chunks;
  const parts = new Array(total);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < total) {
      const i = next++;
      const snap = await getDoc(chunkRef(taskId, attachment.id, i));
      if (!snap.exists()) throw new Error(`첨부 조각이 없습니다: ${i + 1}/${total}`);
      parts[i] = snap.data().data.toUint8Array();
      onProgress?.(++done / total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, total) }, worker)); // 4개씩 동시에 읽는다

  const blob = new Blob(parts, { type: attachment.type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(attachment.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
