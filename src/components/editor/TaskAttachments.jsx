import { useRef, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { extensionOf, formatBytes, validateFile } from "@/lib/attachments";
import { addTaskAttachment, downloadTaskAttachment, removeTaskAttachment, uploadTaskAttachment } from "@/lib/taskAttachments";

function uploadErrorMessage(name, err) {
  if (err?.code === "permission-denied") return `${name}: 올릴 권한이 없습니다. (정보 업무 권한과 firestore.rules 배포를 확인해 주세요)`;
  return `${name}: 올리지 못했습니다. 연결 상태를 확인해 주세요.`;
}

/**
 * 업무 카드 상세의 첨부파일 영역.
 * 올리거나 지우는 즉시 저장된다 (본문의 [ save task ] 와는 별개).
 * canEdit 이 아니면 목록만 보여 주고, 첨부가 없으면 영역 자체를 그리지 않는다.
 */
export default function TaskAttachments({ taskId, attachments = [], canEdit }) {
  const { confirm, toast } = useDialog();
  const inputRef = useRef(null);
  const [uploads, setUploads] = useState([]); // 올리는 중·대기 중: { id, name, progress }
  const [downloads, setDownloads] = useState({}); // 내려받는 중: { [첨부ID]: 진행률 0~1 }
  const [dragOver, setDragOver] = useState(false);

  if (!canEdit && attachments.length === 0) return null;

  const startUploads = async (fileList) => {
    const queue = [];
    for (const file of Array.from(fileList || [])) {
      const problem = validateFile(file);
      if (problem) {
        toast(`${file.name}: ${problem}`, "error");
        continue;
      }
      queue.push({ file, id: `${Date.now()}-${queue.length}-${Math.random()}` });
    }
    if (queue.length === 0) return;
    setUploads((list) => [...list, ...queue.map(({ file, id }) => ({ id, name: file.name, progress: 0 }))]);

    let done = 0;
    for (const { file, id } of queue) {
      try {
        const attachment = await uploadTaskAttachment(taskId, file, (progress) =>
          setUploads((list) => list.map((u) => (u.id === id ? { ...u, progress } : u)))
        );
        await addTaskAttachment(taskId, attachment);
        done++;
      } catch (err) {
        console.error("task attachment upload:", err);
        toast(uploadErrorMessage(file.name, err), "error");
      } finally {
        setUploads((list) => list.filter((u) => u.id !== id));
      }
    }
    if (done > 0) toast(done === 1 ? "첨부했습니다." : `${done}개 파일을 첨부했습니다.`, "success");
  };

  const handleDownload = async (attachment) => {
    if (downloads[attachment.id] !== undefined) return; // 이미 받는 중
    setDownloads((m) => ({ ...m, [attachment.id]: 0 }));
    try {
      await downloadTaskAttachment(taskId, attachment, (progress) => setDownloads((m) => ({ ...m, [attachment.id]: progress })));
    } catch (err) {
      console.error("task attachment download:", err);
      toast("파일을 받지 못했습니다. 삭제됐거나 권한이 없을 수 있습니다.", "error");
    } finally {
      setDownloads((m) => {
        const rest = { ...m };
        delete rest[attachment.id];
        return rest;
      });
    }
  };

  const handleRemove = async (attachment) => {
    if (!(await confirm(`"${attachment.name}" 첨부를 삭제하시겠습니까?`, { danger: true, confirmText: "삭제" }))) return;
    try {
      await removeTaskAttachment(taskId, attachment);
      toast("첨부를 삭제했습니다.", "success");
    } catch (err) {
      console.error("task attachment remove:", err);
      toast("삭제하지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
    }
  };

  return (
    <section
      aria-label="첨부파일"
      className={`border bg-white transition-colors ${dragOver ? "border-accent bg-accent/[0.04]" : "border-line"}`}
      onDragOver={
        canEdit
          ? (e) => {
              e.preventDefault();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={canEdit ? () => setDragOver(false) : undefined}
      onDrop={
        canEdit
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              startUploads(e.dataTransfer.files);
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-line">
        <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-widest">
          <Paperclip className="w-4 h-4 opacity-60" />
          <span>attachments</span>
          <span className="opacity-40">{attachments.length}</span>
        </div>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-widest hover:text-accent transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> 파일 첨부
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                startUploads(e.target.files);
                e.target.value = ""; // 같은 파일을 다시 고를 수 있도록 비운다
              }}
            />
          </>
        )}
      </div>

      {attachments.length === 0 && uploads.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] opacity-40">
          파일을 이 영역으로 끌어다 놓거나 [ 파일 첨부 ] 를 누르세요. 올리는 즉시 저장됩니다. (파일 하나당 25MB까지)
        </p>
      ) : (
        <ul>
          {attachments.map((a) => {
            const progress = downloads[a.id];
            return (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-b-0">
                <span className="shrink-0 min-w-[3rem] text-center border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase opacity-70">
                  {extensionOf(a.name) || "file"}
                </span>
                <button
                  type="button"
                  onClick={() => handleDownload(a)}
                  title={`${a.name} — 눌러서 내려받기`}
                  className="min-w-0 flex-1 truncate text-left text-[14px] hover:text-accent transition-colors"
                >
                  {a.name}
                </button>
                <span className="shrink-0 font-mono text-[11px] opacity-50">
                  {progress !== undefined ? `${Math.round(progress * 100)}%` : formatBytes(a.size)}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a)}
                    aria-label={`${a.name} 삭제`}
                    className="shrink-0 p-1 opacity-40 hover:opacity-100 hover:text-danger transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}

          {uploads.map((u) => (
            <li key={u.id} className="px-5 py-3 border-b border-line last:border-b-0">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate opacity-70">{u.name}</span>
                <span className="shrink-0 font-mono text-[11px] opacity-50">
                  {u.progress > 0 ? `${Math.round(u.progress * 100)}%` : "대기"}
                </span>
              </div>
              <div className="mt-2 h-[3px] bg-line">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(u.progress * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
