// 정보 업무 카드 첨부파일의 순수 도우미 (Firebase 를 부르지 않으므로 테스트하기 쉽다).
// 실제 저장·삭제는 taskAttachments.js, 화면은 TaskAttachments.jsx 에 있다.
//
// 저장 방식: Firebase Storage 는 결제 수단 등록(Blaze)이 필요해서 쓰지 않고,
// 무료인 Firestore 에 파일을 조각내어 둔다.
//   work_tasks/{업무ID}                         ... attachments: [{ id, name, size, type, chunks, uploadedAt }]
//   work_tasks/{업무ID}/work_files/{첨부ID}_{번호} ... { attId, index, data(Bytes) }
// Firestore 문서 한 개는 1MiB 가 한계라 조각 하나를 CHUNK_BYTES 로 자른다.

/** 조각 하나의 크기. 문서 한계(1MiB)에서 필드 이름 등 여유를 뺀 값. firestore.rules 의 제한(900000)보다 작아야 한다. */
export const CHUNK_BYTES = 800 * 1024;

/** 파일 하나의 최대 크기. 내려받을 때 조각 수만큼 읽기가 발생하므로(무료 하루 5만 회) 너무 크게 잡지 않는다. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** 1536 -> "1.5 KB" */
export function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** 파일 이름의 확장자(소문자, 점 없음). 없으면 "" */
export function extensionOf(name) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

/** 내려받는 파일 이름으로 쓸 수 있도록 / \ 와 제어문자를 지운다. 한글은 그대로 둔다. */
export function safeFileName(name) {
  const cleaned = String(name || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 150) || "file";
}

/** 첨부 하나의 고유 ID. 조각 문서 ID 의 앞부분이 되므로 / 가 들어가지 않는다. */
export function newAttachmentId(now = Date.now(), rand = Math.random()) {
  const salt = Math.floor(rand * 0x1000000)
    .toString(36)
    .padStart(5, "0");
  return `${now.toString(36)}${salt}`;
}

/** 파일 크기로 조각이 몇 개인지 (빈 파일은 0) */
export function chunkCount(size) {
  return size > 0 ? Math.ceil(size / CHUNK_BYTES) : 0;
}

/** n 번째 조각이 파일의 어느 구간인지: [시작, 끝) */
export function chunkRange(index, size) {
  const start = index * CHUNK_BYTES;
  return [start, Math.min(start + CHUNK_BYTES, size)];
}

/** 조각 문서 ID. 번호를 0 으로 채워 둬서 이름순 정렬이 곧 조각 순서가 된다. */
export function chunkDocId(attId, index) {
  return `${attId}_${String(index).padStart(3, "0")}`;
}

/** 올릴 수 없는 파일이면 이유(한국어)를, 괜찮으면 null 을 돌려준다. */
export function validateFile(file) {
  if (!file || typeof file.size !== "number") return "파일을 읽을 수 없습니다.";
  if (file.size === 0) return "빈 파일은 올릴 수 없습니다.";
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${formatBytes(MAX_ATTACHMENT_BYTES)} 이하의 파일만 올릴 수 있습니다. (이 파일: ${formatBytes(file.size)})`;
  }
  return null;
}
