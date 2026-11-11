import { useMemo, useState } from "react";
import { useDialog } from "@/components/ui/dialogContext";
import {
  BORROWER_MAX,
  MEMO_MAX,
  STATE_LABELS,
  describeItems,
  dueChoices,
  itemName,
  loanItemsFor,
  pickRange,
  recentBorrowers,
  saveErrorText,
  shortDate,
  validateLoan,
} from "@/lib/equipment";
import { createLoan } from "@/lib/equipmentApi";
import EquipModal from "./EquipModal";
import ItemChip from "./ItemChip";

const stepLabel = "block text-[14px] font-semibold text-neutral-900 mb-3";
const fieldBox = "w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors";
const smallBox = "w-16 h-10 text-center bg-white border border-neutral-300 rounded-lg font-mono text-[14px] outline-none focus:border-accent";
const choice = (on) =>
  `min-h-[40px] px-4 rounded-full text-[13px] font-medium transition-colors ${on ? "bg-neutral-900 text-white" : "bg-white border border-black/[0.12] text-neutral-700 hover:border-black/30"}`;
const textBtn = "min-h-[40px] px-3 rounded-full text-[13px] font-medium transition-colors";

/** 빌려주기 창: 종류 고르기 → 번호 고르기(범위·전부·하나씩) → 빌리는 사람 → 반납 날짜 → 메모 */
export default function LendModal({ kinds, states, loans, today, onClose }) {
  const { toast } = useDialog();
  const [kindId, setKindId] = useState(() => (kinds.find((k) => k.items.length > 0) || kinds[0])?.id ?? null);
  const [picked, setPicked] = useState(() => new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [borrower, setBorrower] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const kind = kinds.find((k) => k.id === kindId) || null;
  const stateOf = (id) => states.get(id)?.state; // 지워진 기자재는 undefined
  const isFree = (it) => stateOf(it.id) === "stock";
  const recent = useMemo(() => recentBorrowers(loans), [loans]);
  const choices = dueChoices(today);

  // 창을 연 사이 다른 기기에서 빌려줬거나 지운 기자재는 고른 것에서 뺀다
  const validPicked = new Set([...picked].filter((id) => stateOf(id) === "stock"));
  const pickedItems = loanItemsFor(kinds, validPicked);
  const countIn = (k) => k.items.filter((it) => validPicked.has(it.id)).length;

  const addIds = (ids) =>
    setPicked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickByRange = () => {
    if (!kind) return;
    const r = pickRange(kind.items, from, to, isFree);
    if (r.error) return toast(r.error, "info");
    addIds(r.ids);
    if (r.skipped) toast(`빌려 갔거나 수리 중인 ${r.skipped}대는 빠졌어요.`, "info");
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateLoan({ itemCount: pickedItems.length, borrower, dueDate, memo }, today);
    if (problem) return toast(problem, "info");
    if (validPicked.size !== picked.size) {
      setPicked(validPicked);
      return toast("고른 것 중 그사이 빌려 갔거나 지워진 기자재가 있어서 뺐어요. 다시 확인해 주세요.", "info");
    }
    setSaving(true);
    try {
      await createLoan({ items: pickedItems, borrower: borrower.trim(), outDate: today, dueDate, memo: memo.trim() });
      toast(`${describeItems(pickedItems, kinds)} 빌려줬어요.`, "success");
      onClose();
    } catch (err) {
      console.error("equipment lend:", err);
      toast(saveErrorText(err), "error");
      setSaving(false);
    }
  };

  // 번호 칸에서 Enter 를 누르면 창 전체가 저장되지 않고 범위 고르기만 한다
  const rangeEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pickByRange();
    }
  };

  return (
    <EquipModal eyebrow="// NEW LOAN" title="빌려주기" onClose={onClose}>
      <form onSubmit={submit} className="space-y-7">
        <div>
          <span className={stepLabel}>1. 무엇을 빌려주나요?</span>
          {kinds.length > 1 && (
            <div role="tablist" aria-label="기자재 종류" className="flex flex-wrap w-fit gap-1 rounded-full bg-black/[0.06] p-1 mb-3">
              {kinds.map((k) => {
                const n = countIn(k);
                return (
                  <button
                    key={k.id}
                    type="button"
                    role="tab"
                    aria-selected={k.id === kindId}
                    onClick={() => setKindId(k.id)}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all ${k.id === kindId ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`}
                  >
                    {k.name}
                    {n > 0 && <span className={`ml-1.5 font-mono text-[11px] ${k.id === kindId ? "text-white/80" : "text-accent"}`}>{n}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {kind && kind.items.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3 text-[13px] text-neutral-700">
                <span>번호</span>
                <input value={from} onChange={(e) => setFrom(e.target.value)} onKeyDown={rangeEnter} aria-label="시작 번호" placeholder="처음" className={smallBox} />
                <span>~</span>
                <input value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={rangeEnter} aria-label="끝 번호" placeholder="끝" className={smallBox} />
                <button type="button" onClick={pickByRange} className={`${textBtn} bg-white border border-black/[0.14] text-neutral-800 hover:border-black/30`}>
                  한꺼번에 고르기
                </button>
                <button type="button" onClick={() => addIds(kind.items.filter(isFree).map((it) => it.id))} className={`${textBtn} text-accent hover:bg-accent/[0.06]`}>
                  남은 것 전부
                </button>
                {countIn(kind) > 0 && (
                  <button
                    type="button"
                    onClick={() => setPicked((prev) => new Set([...prev].filter((id) => !kind.items.some((it) => it.id === id))))}
                    className={`${textBtn} text-neutral-500 hover:text-neutral-900`}
                  >
                    고른 것 풀기
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {kind.items.map((it) => {
                  const free = isFree(it);
                  const on = validPicked.has(it.id);
                  const st = stateOf(it.id) || "stock";
                  return (
                    <ItemChip
                      key={it.id}
                      label={it.label}
                      tone={!free ? "disabled" : on ? "picked" : "stock"}
                      disabled={!free}
                      pressed={free ? on : undefined}
                      ariaLabel={`${itemName(kind.name, it.label)}${free ? (on ? " 고름" : "") : ` ${STATE_LABELS[st]}, 고를 수 없음`}`}
                      title={free ? undefined : STATE_LABELS[st]}
                      onClick={() => toggle(it.id)}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-neutral-500">이 종류에는 아직 번호가 없어요.</p>
          )}

          <p className="mt-3 text-[13px] text-neutral-800 break-keep">
            {pickedItems.length > 0 ? (
              <>
                <strong className="text-accent font-bold">{pickedItems.length}대</strong> 골랐어요 · {describeItems(pickedItems, kinds, { count: false })}
              </>
            ) : (
              "번호를 누르거나 범위를 적어 고르세요."
            )}
          </p>
          <p className="mt-1 text-[12px] text-neutral-500">줄 그은 번호(대여 중 · 수리 중)는 고를 수 없어요.</p>
        </div>

        <div>
          <label htmlFor="lend-who" className={stepLabel}>2. 누가 빌려 가나요?</label>
          <input
            id="lend-who"
            type="text"
            value={borrower}
            maxLength={BORROWER_MAX}
            onChange={(e) => setBorrower(e.target.value)}
            placeholder="예: ○○○ 선생님 · 3학년 1반 수업 / 방송부"
            className={fieldBox}
          />
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[12px] text-neutral-500 mr-1">최근에 쓴 이름</span>
              {recent.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setBorrower(name)}
                  className="min-h-[32px] px-3 rounded-full text-[12px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-black/[0.04] transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className={stepLabel}>3. 언제까지 돌려받나요?</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {choices.map((c) => (
              <button key={c.id} type="button" aria-pressed={dueDate === c.date} onClick={() => setDueDate(c.date)} className={choice(dueDate === c.date)}>
                {c.label} ({shortDate(c.date)})
              </button>
            ))}
            <label className="flex items-center gap-2 text-[13px] text-neutral-600 ml-1">
              다른 날
              <input type="date" value={dueDate} min={today} onChange={(e) => setDueDate(e.target.value)} className="h-10 px-2 bg-white border border-neutral-300 rounded-lg font-mono text-[13px] outline-none focus:border-accent" />
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="lend-memo" className={stepLabel}>
            메모 <span className="font-normal text-[12px] text-neutral-500">(안 써도 돼요)</span>
          </label>
          <input
            id="lend-memo"
            type="text"
            value={memo}
            maxLength={MEMO_MAX}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 충전기 함께 / 6교시 끝나고 반납"
            className={fieldBox}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-black/[0.06]">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors">
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white px-6 py-2.5 rounded-full font-medium text-[13px] hover:bg-accent-strong transition-all shadow-sm active:scale-95 disabled:opacity-60"
          >
            {saving ? "저장 중…" : pickedItems.length > 0 ? `${pickedItems.length}대 빌려주기` : "빌려주기"}
          </button>
        </div>
      </form>
    </EquipModal>
  );
}
