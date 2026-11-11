import { X } from "lucide-react";

/** 기자재 대여 장부의 창 껍데기 (업무 카드·일정 창과 같은 모양) */
export default function EquipModal({ eyebrow, title, onClose, children, size = "max-w-xl" }) {
  return (
    <div className="ui-fade ui-scrim fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-label={title}
        className={`bg-white rounded-card p-6 md:p-8 ${size} w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-black/[0.08] ui-pop`}
      >
        <div className="flex justify-between items-start gap-3 border-b border-black/[0.06] pb-4 mb-6">
          <div className="min-w-0">
            <span className="text-[11px] font-mono text-accent uppercase tracking-wider block mb-1">{eyebrow}</span>
            <h3 className="text-[22px] md:text-[24px] font-normal tracking-tight text-neutral-900 break-keep">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 -mt-1 w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-black/[0.04] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
