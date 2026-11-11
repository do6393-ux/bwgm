import { useState } from "react";
import { Check } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { LABEL_MAX, STATE_LABELS, describeItems, formatDay, isBusy, itemName, saveErrorText, unreturnedItems, validateLabel } from "@/lib/equipment";
import { deleteItem, updateItem } from "@/lib/equipmentApi";
import EquipModal from "./EquipModal";

const STATE_TONE = {
  stock: "bg-white text-neutral-800 border-black/[0.14]",
  loan: "bg-accent text-white border-accent",
  repair: "bg-neutral-200 text-neutral-700 border-dashed border-neutral-500",
};

/** 번호 한 대: 지금 상태(누가 빌려 갔는지), 번호 바꾸기, 수리 중 표시, 지우기 */
export default function ItemModal({ kind, item, info, onClose, onReturn }) {
  const { confirm, toast } = useDialog();
  const [label, setLabel] = useState(item.label);
  const [busyAction, setBusyAction] = useState(false);
  const state = info?.state || "stock";
  const out = isBusy(info);
  const loan = info?.loan || null;
  const name = itemName(kind.name, item.label);

  const run = async (work, done) => {
    setBusyAction(true);
    try {
      await work();
      toast(done, "success");
      return true;
    } catch (err) {
      console.error("equipment item:", err);
      toast(saveErrorText(err), "error");
      return false;
    } finally {
      setBusyAction(false);
    }
  };

  const rename = async (e) => {
    e.preventDefault();
    const next = label.replace(/\s+/g, " ").trim();
    if (next === item.label) return;
    const problem = validateLabel(next, kind, item.id);
    if (problem) return toast(problem, "info");
    await run(() => updateItem(kind.id, item.id, { label: next }), `번호를 바꿨어요: ${item.label} → ${next}`);
  };

  const toggleRepair = () =>
    run(() => updateItem(kind.id, item.id, { repair: !item.repair }), item.repair ? `${name}: 수리 끝, 보관 중으로 바꿨어요.` : `${name}: 수리 중으로 바꿨어요.`);

  const remove = async () => {
    if (!(await confirm(`${name}\n목록에서 지울까요? 지난 대여 기록은 남아요.`, { danger: true, confirmText: "지우기" }))) return;
    if (await run(() => deleteItem(kind.id, item.id), `${name}: 목록에서 지웠어요.`)) onClose();
  };

  return (
    <EquipModal eyebrow="// EQUIPMENT" title={name} onClose={onClose} size="max-w-md">
      <div className="space-y-6">
        <div className="space-y-2">
          <span className={`inline-block px-3 py-1 rounded-full border text-[12px] ${STATE_TONE[state]}`}>{STATE_LABELS[state]}</span>
          {loan && (
            <div className="p-4 rounded-panel bg-well border border-black/[0.06] text-[13px] text-neutral-700 space-y-1">
              <p className="font-semibold text-neutral-900 break-keep">{loan.borrower}</p>
              <p className="font-mono text-[12px]">{formatDay(loan.outDate)}에 빌려 감</p>
              {unreturnedItems(loan).length > 1 && <p className="text-[12px] text-neutral-500 break-keep">함께 빌려 간 것: {describeItems(unreturnedItems(loan), [kind])}</p>}
              {loan.memo && <p className="text-[12px] text-neutral-500">메모: {loan.memo}</p>}
              <button
                type="button"
                onClick={() => onReturn(loan)}
                className="mt-2 flex items-center gap-1.5 min-h-[40px] px-4 rounded-full text-[13px] font-medium bg-white border border-black/[0.12] text-neutral-800 hover:border-black/30"
              >
                <Check className="w-4 h-4 text-ok-strong" /> 반납 처리
              </button>
            </div>
          )}
        </div>

        <form onSubmit={rename}>
          <label htmlFor="item-label" className="block text-[14px] font-semibold text-neutral-900 mb-2">번호 바꾸기</label>
          <div className="flex gap-2">
            <input
              id="item-label"
              type="text"
              value={label}
              maxLength={LABEL_MAX}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1 min-w-0 bg-neutral-50 border border-neutral-200 rounded-field p-3 font-mono text-[14px] outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              disabled={busyAction || label.replace(/\s+/g, " ").trim() === item.label}
              className="shrink-0 px-5 rounded-full text-[13px] font-medium bg-accent text-white hover:bg-accent-strong disabled:opacity-40 transition-colors"
            >
              바꾸기
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-neutral-500">빌려 가 있어도 바꿀 수 있어요. 대여 기록이 새 번호로 따라가요.</p>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-black/[0.06]">
          <button
            type="button"
            onClick={toggleRepair}
            disabled={busyAction || (out && !item.repair)}
            title={out && !item.repair ? "반납한 뒤에 수리 중으로 바꿀 수 있어요" : undefined}
            className="min-h-[44px] px-4 rounded-full text-[13px] font-medium bg-white border border-black/[0.12] text-neutral-800 hover:border-black/30 disabled:opacity-40 transition-colors"
          >
            {item.repair ? "수리 끝 (보관 중으로)" : "수리 중으로 바꾸기"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busyAction || out}
            title={out ? "반납한 뒤에 지울 수 있어요" : undefined}
            className="min-h-[44px] px-2 text-[13px] text-red-700 hover:text-red-800 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            목록에서 지우기
          </button>
        </div>
        {out && <p className="-mt-3 text-[12px] text-neutral-500">빌려 가 있는 동안에는 수리 중 표시나 지우기를 할 수 없어요.</p>}
      </div>
    </EquipModal>
  );
}
