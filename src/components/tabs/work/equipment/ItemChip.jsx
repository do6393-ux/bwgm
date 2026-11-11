// 기자재 번호 칸 하나. 색만이 아니라 모양(테두리 굵기·점선·줄 긋기)으로도 상태를 구분한다.
const TONES = {
  stock: "bg-white text-neutral-900 border border-black/[0.14] hover:border-black/40",
  loan: "bg-accent text-white border border-accent hover:bg-accent-strong",
  repair: "bg-neutral-200 text-neutral-600 border border-dashed border-neutral-500 line-through hover:bg-neutral-300",
  picked: "bg-accent text-white border border-accent font-bold hover:bg-accent-strong",
  disabled: "bg-neutral-100 text-neutral-500 border border-dashed border-neutral-300 line-through cursor-not-allowed",
};

export default function ItemChip({ label, tone = "stock", onClick, ariaLabel, title, pressed, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      title={title}
      className={`min-w-[48px] h-11 px-2.5 rounded-xl font-mono text-[13px] whitespace-nowrap transition-colors ${TONES[tone] || TONES.stock}`}
    >
      {label}
    </button>
  );
}
