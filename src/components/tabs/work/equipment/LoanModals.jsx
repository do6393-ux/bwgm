import { useState } from "react";
import { useDialog } from "@/components/ui/dialogContext";
import {
  BORROWER_MAX,
  MEMO_MAX,
  describeItems,
  dueChoices,
  formatDay,
  itemName,
  saveErrorText,
  shortDate,
  unreturnedItems,
  validateLoan,
} from "@/lib/equipment";
import { deleteLoan, returnItems, updateLoan } from "@/lib/equipmentApi";
import EquipModal from "./EquipModal";
import ItemChip from "./ItemChip";

const fieldLabel = "block text-[14px] font-semibold text-neutral-900 mb-2";
const fieldBox = "w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors";
const choice = (on) =>
  `min-h-[40px] px-4 rounded-full text-[13px] font-medium transition-colors ${on ? "bg-neutral-900 text-white" : "bg-white border border-black/[0.12] text-neutral-700 hover:border-black/30"}`;
const primaryBtn =
  "bg-accent text-white px-6 py-2.5 rounded-full font-medium text-[13px] hover:bg-accent-strong transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:active:scale-100";
const cancelBtn = "px-5 py-2.5 rounded-full text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors";

/** 지금 번호(고쳤으면 고친 번호), 지워진 기자재면 기록의 번호 */
function currentLabel(it, kinds) {
  return kinds.find((k) => k.id === it.kindId)?.items.find((x) => x.id === it.id)?.label ?? it.label;
}

/** 여러 대를 빌려준 기록의 반납: 돌아온 것만 눌러 둔 채로 반납. 안 돌아온 번호는 대여 중으로 남는다. */
export function ReturnModal({ loan, kinds, today, onClose }) {
  const { toast } = useDialog();
  const left = unreturnedItems(loan);
  const [checked, setChecked] = useState(() => new Set(left.map((it) => it.id)));
  const [saving, setSaving] = useState(false);
  const back = left.filter((it) => checked.has(it.id));

  // 종류별로 묶어서 보여 준다
  const groups = [];
  for (const it of left) {
    let g = groups.find((x) => x.kindId === it.kindId);
    if (!g) {
      g = { kindId: it.kindId, name: kinds.find((k) => k.id === it.kindId)?.name ?? it.kindName ?? "", items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }

  const toggle = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (back.length === 0) return toast("돌아온 기자재를 눌러 표시해 주세요.", "info");
    setSaving(true);
    try {
      const res = await returnItems(loan.id, back.map((it) => it.id), today);
      toast(res.allBack ? "반납을 마쳤어요. 지난 기록으로 옮겼어요." : `${back.length}대 반납했어요. 남은 ${res.left}대는 아직 대여 중이에요.`, "success");
      onClose();
    } catch (err) {
      console.error("equipment return:", err);
      toast(saveErrorText(err), "error");
      setSaving(false);
    }
  };

  return (
    <EquipModal eyebrow="// RETURN" title="반납 처리" onClose={onClose}>
      <div className="space-y-6">
        <div className="text-[13px] text-neutral-700 space-y-1">
          <p className="text-[15px] font-semibold text-neutral-900 break-keep">{describeItems(left, kinds)}</p>
          <p>
            {loan.borrower} · {formatDay(loan.outDate)} 빌림
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-neutral-700 break-keep">돌아온 것만 파랗게 둬요. 안 돌아온 번호를 누르면 표시가 풀리고, 그 번호는 "대여 중"으로 남아요.</p>
            <div className="flex gap-1">
              <button type="button" onClick={() => setChecked(new Set(left.map((it) => it.id)))} className="min-h-[36px] px-3 rounded-full text-[12px] text-accent hover:bg-accent/[0.06]">
                모두 표시
              </button>
              <button type="button" onClick={() => setChecked(new Set())} className="min-h-[36px] px-3 rounded-full text-[12px] text-neutral-500 hover:text-neutral-900">
                모두 풀기
              </button>
            </div>
          </div>
          {groups.map((g) => (
            <div key={g.kindId}>
              {groups.length > 1 && <p className="text-[12px] font-semibold text-neutral-700 mb-1.5">{g.name}</p>}
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((it) => {
                  const label = currentLabel(it, kinds);
                  const on = checked.has(it.id);
                  return (
                    <ItemChip
                      key={it.id}
                      label={label}
                      tone={on ? "picked" : "stock"}
                      pressed={on}
                      ariaLabel={`${itemName(g.name, label)} ${on ? "돌아옴" : "안 돌아옴"}`}
                      onClick={() => toggle(it.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-black/[0.06]">
          <button type="button" onClick={onClose} className={cancelBtn}>취소</button>
          <button type="button" onClick={submit} disabled={saving || back.length === 0} className={primaryBtn}>
            {saving ? "저장 중…" : back.length === left.length ? `${back.length}대 모두 반납` : `${back.length}대 반납`}
          </button>
        </div>
      </div>
    </EquipModal>
  );
}

/** 빌린 사람·반납 날짜(연장)·메모 고치기, 잘못 넣은 기록 지우기 */
export function LoanEditModal({ loan, kinds, today, onClose }) {
  const { confirm, toast } = useDialog();
  const [borrower, setBorrower] = useState(loan.borrower || "");
  const [dueDate, setDueDate] = useState(loan.dueDate || today);
  const [memo, setMemo] = useState(loan.memo || "");
  const [saving, setSaving] = useState(false);
  const left = unreturnedItems(loan);
  const choices = dueChoices(today).filter((c) => c.date >= loan.outDate);

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateLoan({ borrower, dueDate, memo }, loan.outDate);
    if (problem) return toast(problem, "info");
    setSaving(true);
    try {
      await updateLoan(loan.id, { borrower: borrower.trim(), dueDate, memo: memo.trim() });
      toast("대여 기록을 고쳤어요.", "success");
      onClose();
    } catch (err) {
      console.error("equipment loan update:", err);
      toast(saveErrorText(err), "error");
      setSaving(false);
    }
  };

  const remove = async () => {
    const msg = `이 대여 기록을 지울까요? 잘못 넣었을 때만 지워 주세요.\n지우면 ${left.length}대가 "보관 중"으로 돌아가고, 지난 기록에도 남지 않아요.`;
    if (!(await confirm(msg, { danger: true, confirmText: "기록 지우기" }))) return;
    try {
      await deleteLoan(loan.id);
      toast("대여 기록을 지웠어요.", "success");
      onClose();
    } catch (err) {
      console.error("equipment loan delete:", err);
      toast(saveErrorText(err), "error");
    }
  };

  return (
    <EquipModal eyebrow="// EDIT LOAN" title="대여 기록 고치기" onClose={onClose}>
      <form onSubmit={submit} className="space-y-6">
        <div className="text-[13px] text-neutral-700 space-y-1">
          <p className="text-[15px] font-semibold text-neutral-900 break-keep">{describeItems(left, kinds)}</p>
          <p>{formatDay(loan.outDate)} 빌림</p>
        </div>

        <div>
          <label htmlFor="loan-who" className={fieldLabel}>빌린 사람</label>
          <input id="loan-who" type="text" value={borrower} maxLength={BORROWER_MAX} onChange={(e) => setBorrower(e.target.value)} className={fieldBox} />
        </div>

        <div>
          <span className={fieldLabel}>언제까지 돌려받나요?</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {choices.map((c) => (
              <button key={c.id} type="button" aria-pressed={dueDate === c.date} onClick={() => setDueDate(c.date)} className={choice(dueDate === c.date)}>
                {c.label} ({shortDate(c.date)})
              </button>
            ))}
            <label className="flex items-center gap-2 text-[13px] text-neutral-600 ml-1">
              다른 날
              <input
                type="date"
                value={dueDate}
                min={loan.outDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-10 px-2 bg-white border border-neutral-300 rounded-lg font-mono text-[13px] outline-none focus:border-accent"
              />
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="loan-memo" className={fieldLabel}>메모</label>
          <input id="loan-memo" type="text" value={memo} maxLength={MEMO_MAX} onChange={(e) => setMemo(e.target.value)} className={fieldBox} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-black/[0.06]">
          <button type="button" onClick={remove} className="min-h-[44px] px-2 text-[13px] text-red-700 hover:text-red-800 hover:underline">
            이 기록 지우기
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={cancelBtn}>취소</button>
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? "저장 중…" : "저장하기"}</button>
          </div>
        </div>
      </form>
    </EquipModal>
  );
}
