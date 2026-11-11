import { useState } from "react";
import { useDialog } from "@/components/ui/dialogContext";
import { dateKey } from "@/lib/workCalendar";
import {
  BORROWER_MAX,
  MEMO_MAX,
  describeItems,
  formatDay,
  itemName,
  returnGroups,
  returnStamp,
  saveErrorText,
  timeKey,
  unreturnedItems,
  validateLoan,
  validateMemo,
  validateReturnAt,
} from "@/lib/equipment";
import { deleteLoan, returnItems, updateLoan } from "@/lib/equipmentApi";
import EquipModal from "./EquipModal";
import ItemChip from "./ItemChip";

const fieldLabel = "block text-[14px] font-semibold text-neutral-900 mb-2";
const fieldBox = "w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors";
const dateBox = "h-10 px-2 bg-white border border-neutral-300 rounded-lg font-mono text-[13px] outline-none focus:border-accent";
const primaryBtn =
  "bg-accent text-white px-6 py-2.5 rounded-full font-medium text-[13px] hover:bg-accent-strong transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:active:scale-100";
const cancelBtn = "px-5 py-2.5 rounded-full text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors";
const MEMO_PLACEHOLDER = "예: 키보드 · 마우스 · 충전기 다 있음 / 화면 모서리 긁힘";

/** 지금 번호(고쳤으면 고친 번호), 지워진 기자재면 기록의 번호 */
function currentLabel(it, kinds) {
  return kinds.find((k) => k.id === it.kindId)?.items.find((x) => x.id === it.id)?.label ?? it.label;
}

/** 날짜 + 시각 칸 한 줄 */
function StampFields({ date, time, onDate, onTime, max, label }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="date" value={date} max={max} onChange={(e) => onDate(e.target.value)} aria-label={`${label} 날짜`} className={dateBox} />
      <input type="time" value={time} onChange={(e) => onTime(e.target.value)} aria-label={`${label} 시각`} className={dateBox} />
    </div>
  );
}

function MemoField({ id, value, onChange, help }) {
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        메모 <span className="font-normal text-[12px] text-neutral-500">(비고)</span>
      </label>
      <textarea id={id} rows={3} value={value} maxLength={MEMO_MAX} onChange={(e) => onChange(e.target.value)} placeholder={MEMO_PLACEHOLDER} className={`${fieldBox} resize-y`} />
      {help && <p className="mt-1.5 text-[12px] text-neutral-500 break-keep">{help}</p>}
    </div>
  );
}

/**
 * 반납 처리: 반납 일시(지금 시각이 들어가 있다)와 메모(구성품 확인 등)를 적는다.
 * 여러 대를 빌려준 기록이면 돌아온 것만 눌러 둔 채로 반납한다. 안 돌아온 번호는 대여 중으로 남는다.
 */
export function ReturnModal({ loan, kinds, onClose }) {
  const { toast } = useDialog();
  const left = unreturnedItems(loan);
  const [checked, setChecked] = useState(() => new Set(left.map((it) => it.id)));
  const [openedDay] = useState(() => dateKey(new Date()));
  const [date, setDate] = useState(openedDay);
  const [time, setTime] = useState(() => timeKey(new Date()));
  const [memo, setMemo] = useState(loan.memo || "");
  const [saving, setSaving] = useState(false);
  const back = left.filter((it) => checked.has(it.id));
  const many = left.length > 1;

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
    const problem = validateReturnAt(date, time, loan.outDate, dateKey(new Date())) || validateMemo(memo);
    if (problem) return toast(problem, "info");
    setSaving(true);
    try {
      const res = await returnItems(loan.id, back.map((it) => it.id), returnStamp(date, time), memo.trim());
      toast(res.allBack ? "반납을 마쳤어요. 아래 \"지난 기록\"에 남았어요." : `${back.length}대 반납했어요. 남은 ${res.left}대는 아직 대여 중이에요.`, "success");
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
            {loan.borrower} · {formatDay(loan.outDate)}에 빌림
          </p>
        </div>

        {many && (
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
        )}

        <div>
          <span className={fieldLabel}>반납 일시</span>
          <StampFields date={date} time={time} onDate={setDate} onTime={setTime} max={openedDay} label="반납" />
          <p className="mt-1.5 text-[12px] text-neutral-500 break-keep">지금 날짜와 시각이 들어가 있어요. 실제로 돌려받은 때가 다르면 고쳐요.</p>
        </div>

        <MemoField id="return-memo" value={memo} onChange={setMemo} help="빌려줄 때 쓴 메모에 이어서 적어도 돼요. 나중에 지난 기록에서 고칠 수 있어요." />

        <div className="flex justify-end gap-3 pt-4 border-t border-black/[0.06]">
          <button type="button" onClick={onClose} className={cancelBtn}>취소</button>
          <button type="button" onClick={submit} disabled={saving || back.length === 0} className={primaryBtn}>
            {saving ? "저장 중…" : !many ? "반납하기" : back.length === left.length ? `${back.length}대 모두 반납` : `${back.length}대 반납`}
          </button>
        </div>
      </div>
    </EquipModal>
  );
}

/** 대여 기록 고치기 (지금 빌려 간 것 · 지난 기록 둘 다): 빌린 사람, 빌린 날, 반납 일시, 메모, 기록 지우기 */
export function LoanEditModal({ loan, kinds, today, onClose }) {
  const { confirm, toast } = useDialog();
  const closed = !loan.open;
  const groups = returnGroups(loan);
  const [borrower, setBorrower] = useState(loan.borrower || "");
  const [outDate, setOutDate] = useState(loan.outDate || today);
  const [memo, setMemo] = useState(loan.memo || "");
  // 반납 일시 묶음마다 칸 하나 (한 번에 반납했으면 하나)
  const [stamps, setStamps] = useState(() => groups.map((g) => ({ from: g.stamp, date: g.date, time: g.time })));
  const [saving, setSaving] = useState(false);
  const left = unreturnedItems(loan);
  const backCount = (loan.items || []).length - left.length;

  const setStamp = (i, patch) => setStamps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = async (e) => {
    e.preventDefault();
    const now = dateKey(new Date());
    const problem = validateLoan({ borrower, outDate, memo }, now) || stamps.map((s) => validateReturnAt(s.date, s.time, outDate, now)).find(Boolean);
    if (problem) return toast(problem, "info");
    setSaving(true);
    try {
      await updateLoan(loan.id, {
        borrower: borrower.trim(),
        outDate,
        memo: memo.trim(),
        returnChanges: stamps.map((s) => ({ from: s.from, to: returnStamp(s.date, s.time) })),
      });
      toast(closed ? "지난 기록을 고쳤어요." : "대여 기록을 고쳤어요.", "success");
      onClose();
    } catch (err) {
      console.error("equipment loan update:", err);
      toast(saveErrorText(err), "error");
      setSaving(false);
    }
  };

  const remove = async () => {
    const msg = closed
      ? "이 지난 기록을 지울까요?\n지운 기록은 되돌릴 수 없어요."
      : `이 대여 기록을 지울까요? 잘못 넣었을 때만 지워 주세요.\n지우면 ${left.length}대가 "보관 중"으로 돌아가고, 지난 기록에도 남지 않아요.`;
    if (!(await confirm(msg, { danger: true, confirmText: "기록 지우기" }))) return;
    try {
      await deleteLoan(loan.id);
      toast("기록을 지웠어요.", "success");
      onClose();
    } catch (err) {
      console.error("equipment loan delete:", err);
      toast(saveErrorText(err), "error");
    }
  };

  return (
    <EquipModal eyebrow="// EDIT RECORD" title={closed ? "지난 기록 고치기" : "대여 기록 고치기"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-6">
        <p className="text-[15px] font-semibold text-neutral-900 break-keep">
          {describeItems(closed ? loan.items || [] : left, kinds)}
          {!closed && backCount > 0 && <span className="ml-2 text-[12px] font-normal text-neutral-500">({backCount}대는 반납함)</span>}
        </p>

        <div>
          <label htmlFor="loan-who" className={fieldLabel}>빌린 사람</label>
          <input id="loan-who" type="text" value={borrower} maxLength={BORROWER_MAX} onChange={(e) => setBorrower(e.target.value)} className={fieldBox} />
        </div>

        <div>
          <label htmlFor="loan-out" className={fieldLabel}>빌린 날</label>
          <input id="loan-out" type="date" value={outDate} max={today} onChange={(e) => setOutDate(e.target.value)} className={dateBox} />
        </div>

        {stamps.length > 0 && (
          <div className="space-y-3">
            <span className={`${fieldLabel} !mb-0`}>{stamps.length > 1 ? "반납 일시 (나눠서 반납함)" : "반납 일시"}</span>
            {stamps.map((s, i) => {
              const items = groups.find((g) => g.stamp === s.from)?.items || [];
              return (
                <div key={s.from} className="space-y-1.5">
                  {(stamps.length > 1 || !closed) && <p className="text-[12px] text-neutral-600 break-keep">{describeItems(items, kinds)}</p>}
                  <StampFields date={s.date} time={s.time} onDate={(v) => setStamp(i, { date: v })} onTime={(v) => setStamp(i, { time: v })} max={today} label="반납" />
                </div>
              );
            })}
          </div>
        )}

        <MemoField id="loan-memo" value={memo} onChange={setMemo} />

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
