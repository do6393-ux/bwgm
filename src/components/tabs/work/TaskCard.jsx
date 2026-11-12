import { ExternalLink, Paperclip, RefreshCw } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import { findPart } from "@/lib/workParts";

const STATUS_MAP = {
  todo: {
    label: "대기",
    badge: "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-600 border-black/[0.06]",
    dot: "bg-neutral-400",
    glow: "",
  },
  doing: {
    label: "진행",
    badge: "bg-accent/[0.08] hover:bg-accent/[0.14] text-accent border-accent/20",
    dot: "bg-accent",
    glow: "shadow-[0_0_8px_rgba(0,102,255,0.6)] animate-pulse",
  },
  done: {
    label: "완료",
    badge: "bg-ok/[0.08] hover:bg-ok/[0.14] text-ok-strong border-ok/20",
    dot: "bg-ok",
    glow: "shadow-[0_0_6px_rgba(0,168,107,0.5)]",
  },
};

/**
 * 예전부터 쓰던 업무 카드 한 장 (업무분장 항목이 아닌 카드).
 * 누르면 ?task=ID 상세(매뉴얼·서식)가 새 창으로 열린다.
 */
export default function TaskCard({ task: t, index, canEdit, onToggleStatus, onEdit, onDelete, onSchedule }) {
  const statusInfo = STATUS_MAP[t.status] || STATUS_MAP.todo;
  const part = findPart(t.part);

  return (
    <div
      style={{ "--i": Math.min(index, 8) }}
      onClick={() => window.open(`?task=${t.id}`, "_blank")}
      className="flex flex-col justify-between border border-black/[0.08] bg-white rounded-panel p-6 h-full hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer group ui-enter"
    >
      <div>
        <div className="flex justify-between items-center mb-4">
          <span className="text-[11px] font-mono text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-md">
            {part.icon} {part.label}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (canEdit) onToggleStatus(t);
            }}
            title={canEdit ? "클릭하여 상태 전환 (대기 ➔ 진행 ➔ 완료)" : undefined}
            className={`group/btn flex items-center gap-2 pl-2.5 pr-2 py-1 rounded-full border transition-all ${canEdit ? "active:scale-90" : "cursor-default"} ${statusInfo.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot} ${statusInfo.glow}`}></span>
            <span className="text-[12px] font-medium tracking-tight">{statusInfo.label}</span>
            {canEdit && <RefreshCw className="w-2.5 h-2.5 opacity-30 group-hover/btn:opacity-90 group-hover/btn:rotate-180 transition-all duration-300 ml-0.5" />}
          </button>
        </div>

        <h4 className="text-[19px] font-medium text-neutral-900 group-hover:text-accent transition-colors leading-snug mb-2">{t.title}</h4>
        {t.summary && <p className="text-[13px] text-neutral-500 font-light leading-relaxed mb-4 line-clamp-2">{t.summary}</p>}

        {t.content && (
          <div
            className="text-[13px] text-neutral-600 border-t border-black/[0.05] pt-3 my-2 line-clamp-3 leading-relaxed font-light opacity-80 [&_img]:hidden"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.content) }}
          />
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-black/[0.05] flex flex-wrap justify-between items-center gap-x-3 gap-y-2 text-[12px]">
        <span className="text-neutral-400 group-hover:text-neutral-900 flex items-center gap-3 font-mono text-[11px] transition-colors">
          <span className="flex items-center gap-1">
            OPEN TERMINAL <ExternalLink className="w-3 h-3 ml-0.5" />
          </span>
          {t.attachments?.length > 0 && (
            <span className="flex items-center gap-1" title={`첨부파일 ${t.attachments.length}개`}>
              <Paperclip className="w-3 h-3" /> {t.attachments.length}
            </span>
          )}
        </span>

        {canEdit && (
          <div className="flex items-center gap-3 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onSchedule(t)}
              title="이 업무를 달력에 넣기 (마감일을 정하면 시작일은 오늘로 자동)"
              className="text-neutral-400 hover:text-accent transition-colors"
            >
              [ + 일정 ]
            </button>
            <button onClick={() => onEdit(t)} className="text-neutral-400 hover:text-accent transition-colors">
              [ EDIT ]
            </button>
            <button onClick={() => onDelete(t)} className="text-neutral-400 hover:text-red-500 transition-colors">
              [ DEL ]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
