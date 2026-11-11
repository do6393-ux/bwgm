import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Search, X } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { dateKey } from "@/lib/workCalendar";
import {
  STATE_LABELS,
  countStates,
  describeItems,
  dueBadge,
  formatDay,
  itemMatches,
  itemName,
  itemStates,
  loanMatches,
  returnedText,
  saveErrorText,
  sortOpenLoans,
  stateMatchesFilter,
  unreturnedItems,
} from "@/lib/equipment";
import { returnItems, watchHistory, watchInventory, watchOpenLoans } from "@/lib/equipmentApi";
import ItemChip from "./ItemChip";
import ItemModal from "./ItemModal";
import LendModal from "./LendModal";
import SetupModal from "./SetupModal";
import { LoanEditModal, ReturnModal } from "./LoanModals";

const HISTORY_STEP = 20;

// 머리 카드의 숫자 칸 = 거르기 버튼 (업무 카드의 대기·진행·완료 칸과 같은 모양)
const TILES = [
  { id: "all", key: "total", label: "TOTAL (전체)", cap: "text-neutral-500", num: "text-neutral-900", on: "border-neutral-800 shadow-[0_4px_12px_rgba(0,0,0,0.1)]", off: "border-black/[0.06] hover:border-black/[0.15]" },
  { id: "stock", key: "stock", label: "IN STOCK (보관 중)", cap: "text-neutral-500", num: "text-neutral-600", on: "border-neutral-400 shadow-[0_4px_12px_rgba(0,0,0,0.08)]", off: "border-black/[0.06] hover:border-black/[0.15]" },
  { id: "loan", key: "loan", label: "ON LOAN (대여 중)", cap: "text-accent", num: "text-accent", on: "border-accent shadow-[0_4px_16px_rgba(0,102,255,0.2)]", off: "border-black/[0.06] hover:border-accent/40" },
  { id: "over", key: "over", label: "OVERDUE (반납 지남)", cap: "text-red-600", num: "text-red-600", on: "border-red-500 shadow-[0_4px_16px_rgba(220,38,38,0.18)]", off: "border-black/[0.06] hover:border-red-400/50" },
];

const BADGE = {
  over: "bg-red-50 text-red-700 border-red-200 font-bold",
  today: "bg-amber-50 text-amber-800 border-amber-300 font-bold",
  normal: "bg-accent/[0.08] text-accent-strong border-accent/20 font-medium",
};

const pill = "flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-full text-[13px] font-medium transition-all active:scale-95 shrink-0";
const ghostPill = `${pill} text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.04]`;
const whitePill = `${pill} bg-white border border-black/[0.12] text-neutral-800 hover:border-black/30 shadow-sm`;
const bluePill = `${pill} bg-accent hover:bg-accent-strong text-white px-5 shadow-sm`;

/** 읽기 실패: 규칙을 아직 게시하지 않았으면 permission-denied 가 온다 */
const onLoadError = (what, setError, markLoaded) => (err) => {
  console.error(`equipment ${what}:`, err);
  setError(err?.code === "permission-denied" ? "permission" : "other");
  markLoaded();
};

function SectionHead({ title, note }) {
  return (
    <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-black/[0.06] pb-3">
      <h3 className="text-[20px] font-semibold text-neutral-900">{title}</h3>
      {note && <span className="font-mono text-[12px] text-neutral-500">{note}</span>}
    </div>
  );
}

function LoanRow({ loan, kinds, today, index, onReturn, onEdit }) {
  const left = unreturnedItems(loan);
  const back = (loan.items || []).length - left.length;
  const badge = dueBadge(loan.dueDate, today);
  return (
    <li style={{ "--i": Math.min(index, 8) }} className="ui-enter flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 rounded-panel bg-white border border-black/[0.08]">
      <span className={`shrink-0 min-w-[80px] text-center px-2.5 py-1 rounded-full border text-[12px] ${BADGE[badge.tone]}`}>{badge.label}</span>
      <div className="min-w-0 flex-[999_1_280px] space-y-1">
        <p className="text-[16px] font-semibold text-neutral-900 break-keep">
          {describeItems(left, kinds)}
          {back > 0 && <span className="ml-2 text-[12px] font-normal text-neutral-500">({back}대는 반납함)</span>}
        </p>
        <p className="text-[13px] text-neutral-700 break-keep">
          {loan.borrower}
          {loan.memo && <span className="text-neutral-500"> · {loan.memo}</span>}
        </p>
        <p className="font-mono text-[12px] text-neutral-500">
          {formatDay(loan.outDate)} 빌림 → {loan.dueDate === today ? "오늘" : formatDay(loan.dueDate)}까지
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button type="button" onClick={onEdit} className={ghostPill} title="빌린 사람·반납 날짜·메모 고치기, 잘못 넣은 기록 지우기">
          <Pencil className="w-3.5 h-3.5" /> 고치기
        </button>
        <button type="button" onClick={onReturn} className={whitePill}>
          <Check className="w-4 h-4 text-ok-strong" /> 반납 처리
        </button>
      </div>
    </li>
  );
}

function Legend() {
  const box = "inline-block w-3.5 h-3.5 rounded";
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-neutral-600">
      <span className="flex items-center gap-1.5"><span className={`${box} bg-white border border-black/20`} />보관 중</span>
      <span className="flex items-center gap-1.5"><span className={`${box} bg-accent`} />대여 중</span>
      <span className="flex items-center gap-1.5"><span className={`${box} bg-white border-2 border-red-600`} />반납 지남</span>
      <span className="flex items-center gap-1.5"><span className={`${box} bg-neutral-200 border border-dashed border-neutral-500`} />수리 중</span>
    </div>
  );
}

/** 정보 업무 › 기자재 대여. 정보 업무 권한이 있는 사람에게만 보인다 (TabWork 가 걸러 준다). */
export default function EquipmentLedger() {
  const { confirm, toast } = useDialog();
  const [today] = useState(() => dateKey(new Date()));
  const [kinds, setKinds] = useState([]);
  const [kindsLoaded, setKindsLoaded] = useState(false);
  const [openLoans, setOpenLoans] = useState([]);
  const [loansLoaded, setLoansLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyMax, setHistoryMax] = useState(HISTORY_STEP);
  const [loadError, setLoadError] = useState(null); // null | "permission" | "other"
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState("all");
  const [lendOpen, setLendOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [returningId, setReturningId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [detail, setDetail] = useState(null); // { kindId, itemId }

  useEffect(
    () => watchInventory((k) => { setKinds(k); setKindsLoaded(true); }, onLoadError("inventory", setLoadError, () => setKindsLoaded(true))),
    []
  );
  useEffect(
    () => watchOpenLoans((l) => { setOpenLoans(l); setLoansLoaded(true); }, onLoadError("loans", setLoadError, () => setLoansLoaded(true))),
    []
  );
  useEffect(
    () => watchHistory(historyMax, (l) => { setHistory(l); setHistoryLoaded(true); }, onLoadError("history", setLoadError, () => setHistoryLoaded(true))),
    [historyMax]
  );

  const states = useMemo(() => itemStates(kinds, openLoans, today), [kinds, openLoans, today]);
  const counts = useMemo(() => countStates(kinds, states), [kinds, states]);
  const sortedLoans = useMemo(() => sortOpenLoans(openLoans), [openLoans]);

  const q = keyword.trim().toLowerCase();
  const visibleLoans = sortedLoans.filter((l) => (filter !== "over" || dueBadge(l.dueDate, today).tone === "over") && loanMatches(l, q, kinds));
  const visibleOut = visibleLoans.reduce((sum, l) => sum + unreturnedItems(l).length, 0);
  const groups = kinds
    .map((kind) => ({ kind, items: kind.items.filter((it) => stateMatchesFilter(states.get(it.id)?.state, filter) && itemMatches(kind, it, q)) }))
    .filter((g) => g.items.length > 0 || (filter === "all" && !q));
  const visibleHistory = history.filter((l) => loanMatches(l, q, kinds));

  const loaded = kindsLoaded && loansLoaded;
  const returning = openLoans.find((l) => l.id === returningId) || null;
  const editing = openLoans.find((l) => l.id === editingId) || null;
  const detailKind = detail ? kinds.find((k) => k.id === detail.kindId) : null;
  const detailItem = detailKind?.items.find((it) => it.id === detail.itemId) || null;

  const kindSummary = (kind) => {
    let stock = 0;
    let out = 0;
    let repair = 0;
    for (const it of kind.items) {
      const s = states.get(it.id)?.state;
      if (s === "repair") repair++;
      else if (s === "loan" || s === "over") out++;
      else stock++;
    }
    return [`${kind.items.length}대`, `보관 ${stock}`, out && `대여 ${out}`, repair && `수리 ${repair}`].filter(Boolean).join(" · ");
  };

  // 한 대만 남았으면 바로 확인창, 여러 대면 돌아온 것을 고르는 창
  const startReturn = async (loan) => {
    const left = unreturnedItems(loan);
    if (left.length > 1) return setReturningId(loan.id);
    const name = describeItems(left, kinds);
    if (!(await confirm(`${name} 반납 처리할까요?`, { confirmText: "반납" }))) return;
    try {
      await returnItems(loan.id, left.map((it) => it.id), today);
      toast(`${name} 반납했어요.`, "success");
    } catch (err) {
      console.error("equipment return:", err);
      toast(saveErrorText(err), "error");
    }
  };

  return (
    <div className="space-y-12">
      <section className="border border-black/[0.08] bg-well rounded-card p-5 md:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-5 border-b border-black/[0.06] pb-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_#0066FF]"></span>
                <span className="font-semibold text-neutral-700">EQUIPMENT LEDGER</span>
              </div>
              <h2 className="text-[26px] md:text-[32px] font-normal tracking-tight text-neutral-900 leading-tight">기자재 대여 장부</h2>
            </div>
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="번호, 빌린 사람 검색..."
                aria-label="기자재 번호나 빌린 사람으로 찾기"
                className="pl-9 pr-8 py-2 rounded-full text-[13px] bg-white/90 border border-black/[0.08] text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/15 transition-all w-64 sm:w-72 shadow-sm"
              />
              {keyword && (
                <button type="button" onClick={() => setKeyword("")} aria-label="검색어 지우기" className="absolute right-3 text-neutral-400 hover:text-neutral-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSetupOpen(true)} className={whitePill}>
              기자재 등록 · 고치기
            </button>
            <button
              type="button"
              onClick={() => (counts.total === 0 ? toast("먼저 \"기자재 등록 · 고치기\"에서 기자재를 넣어 주세요.", "info") : setLendOpen(true))}
              className={bluePill}
            >
              <Plus className="w-4 h-4" /> 빌려주기
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-[13px]">
          {TILES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`text-left p-4 rounded-panel transition-all duration-200 hover:-translate-y-1 bg-white/70 backdrop-blur-sm border ${filter === t.id ? t.on : t.off}`}
            >
              <span className={`block text-[11px] font-mono mb-1 ${t.cap}`}>{t.label}</span>
              <span className={`text-[22px] font-semibold ${t.num}`}>{loaded ? `${counts[t.key]}대` : "–"}</span>
            </button>
          ))}
        </div>
      </section>

      {loadError && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-panel border border-red-200 bg-red-50 text-[13px] text-red-800 break-keep">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            {loadError === "permission"
              ? "기자재 장부를 읽을 권한이 없어요. Firebase 콘솔에 새 Firestore 규칙(firestore.rules)을 게시했는지 확인해 주세요."
              : "기자재 장부를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요."}
          </p>
        </div>
      )}

      {loaded && kinds.length === 0 && !loadError ? (
        <section className="py-16 px-6 text-center border border-dashed border-black/[0.15] rounded-card bg-white/50">
          <p className="text-[16px] text-neutral-900 font-medium mb-2">아직 등록한 기자재가 없어요.</p>
          <p className="text-[13px] text-neutral-600 mb-6 break-keep">
            "기자재 등록 · 고치기"에서 종류(예: 태블릿)를 만들고 번호를 넣어 주세요. 번호는 나중에 언제든 고칠 수 있어요.
          </p>
          <button type="button" onClick={() => setSetupOpen(true)} className={`${bluePill} mx-auto`}>
            <Plus className="w-4 h-4" /> 기자재 등록하기
          </button>
        </section>
      ) : (
        <>
          <section className="space-y-4">
            <SectionHead title="지금 빌려 간 것" note={loansLoaded ? `${visibleLoans.length}건 · ${visibleOut}대 · 반납 날짜가 이른 것이 위로` : ""} />
            {!loansLoaded ? (
              <SkeletonGroup label="빌려 간 기자재를 불러오는 중" className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4 rounded-panel bg-white border border-black/[0.08]">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                  </div>
                ))}
              </SkeletonGroup>
            ) : visibleLoans.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-neutral-500">
                {q || filter === "over" ? "조건에 맞는 대여 기록이 없어요." : "지금 빌려 간 기자재가 없어요."}
              </p>
            ) : (
              <ul className="space-y-3">
                {visibleLoans.map((loan, i) => (
                  <LoanRow
                    key={loan.id}
                    loan={loan}
                    kinds={kinds}
                    today={today}
                    index={i}
                    onReturn={() => startReturn(loan)}
                    onEdit={() => setEditingId(loan.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3 border-b border-black/[0.06] pb-3">
              <h3 className="text-[20px] font-semibold text-neutral-900">기자재 목록</h3>
              <Legend />
            </div>
            {!kindsLoaded ? (
              <SkeletonGroup label="기자재 목록을 불러오는 중" className="p-5 rounded-panel bg-well border border-black/[0.06] space-y-3">
                <Skeleton className="h-5 w-40" />
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="w-12 h-11 rounded-xl" />)}
                </div>
              </SkeletonGroup>
            ) : groups.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-neutral-500">조건에 맞는 기자재가 없어요.</p>
            ) : (
              groups.map(({ kind, items }) => (
                <div key={kind.id} className="p-5 rounded-panel bg-well border border-black/[0.06] space-y-3">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="text-[15px] font-semibold text-neutral-900">{kind.name}</span>
                    <span className="font-mono text-[12px] text-neutral-500">{kindSummary(kind)}</span>
                  </div>
                  {kind.items.length === 0 ? (
                    <p className="text-[13px] text-neutral-500">아직 번호가 없어요. "기자재 등록 · 고치기"에서 넣어 주세요.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((it) => {
                        const info = states.get(it.id);
                        const st = info?.state || "stock";
                        const who = info?.loan ? ` · ${info.loan.borrower} · ${formatDay(info.loan.dueDate)}까지` : "";
                        return (
                          <ItemChip
                            key={it.id}
                            label={it.label}
                            tone={st}
                            ariaLabel={`${itemName(kind.name, it.label)} ${STATE_LABELS[st]}${who}`}
                            title={`${STATE_LABELS[st]}${who}`}
                            onClick={() => setDetail({ kindId: kind.id, itemId: it.id })}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
            <p className="text-[12px] text-neutral-500 break-keep">
              번호를 누르면 누가 빌려 갔는지 보이고, 번호 바꾸기 · 수리 중 표시 · 지우기를 할 수 있어요. 대수를 늘리거나 목록을 통째로 고칠 때는 위의 "기자재 등록 · 고치기"를 눌러요.
            </p>
          </section>

          <section className="space-y-4">
            <SectionHead title="지난 기록" note="반납까지 끝난 것, 최근 것부터" />
            {!historyLoaded ? (
              <SkeletonGroup label="지난 기록을 불러오는 중" className="rounded-panel border border-black/[0.08] bg-white p-4 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </SkeletonGroup>
            ) : visibleHistory.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-neutral-500">{q ? "조건에 맞는 지난 기록이 없어요." : "아직 반납까지 끝난 기록이 없어요."}</p>
            ) : (
              <div className="overflow-x-auto rounded-panel border border-black/[0.08] bg-white">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-well text-left font-mono text-[11px] text-neutral-600">
                      <th scope="col" className="px-4 py-3 font-bold">기자재</th>
                      <th scope="col" className="px-4 py-3 font-bold">빌린 사람</th>
                      <th scope="col" className="px-4 py-3 font-bold">빌린 날</th>
                      <th scope="col" className="px-4 py-3 font-bold">반납한 날</th>
                      <th scope="col" className="px-4 py-3 font-bold">메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleHistory.map((l) => (
                      <tr key={l.id} className="border-t border-black/[0.06] align-top">
                        <td className="px-4 py-3 font-semibold text-neutral-900 break-keep">{describeItems(l.items || [], kinds)}</td>
                        <td className="px-4 py-3 text-neutral-700 break-keep">{l.borrower}</td>
                        <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">{formatDay(l.outDate)}</td>
                        <td className="px-4 py-3 text-neutral-700">{returnedText(l)}</td>
                        <td className="px-4 py-3 text-neutral-500 break-keep">{l.memo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {history.length >= historyMax && (
              <button type="button" onClick={() => setHistoryMax((n) => n + HISTORY_STEP)} className={whitePill}>
                기록 더 보기
              </button>
            )}
          </section>
        </>
      )}

      {lendOpen && <LendModal kinds={kinds} states={states} loans={[...openLoans, ...history]} today={today} onClose={() => setLendOpen(false)} />}
      {setupOpen && <SetupModal kinds={kinds} states={states} onClose={() => setSetupOpen(false)} />}
      {returning && <ReturnModal loan={returning} kinds={kinds} today={today} onClose={() => setReturningId(null)} />}
      {editing && <LoanEditModal loan={editing} kinds={kinds} today={today} onClose={() => setEditingId(null)} />}
      {detailItem && (
        <ItemModal
          kind={detailKind}
          item={detailItem}
          info={states.get(detailItem.id)}
          today={today}
          onClose={() => setDetail(null)}
          onReturn={(loan) => {
            setDetail(null);
            startReturn(loan);
          }}
        />
      )}
    </div>
  );
}
