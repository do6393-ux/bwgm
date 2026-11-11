// 기자재 대여 장부(정보 업무 › 기자재 대여)의 순수 계산 함수들.
//
// 저장 모양 (바꾸면 firestore.rules 의 equipment 규칙도 같이 바꿀 것)
//   equipment/inventory   { kinds: [{ id, name, items: [{ id, label, repair }] }], updatedAt }
//   equipment_loans/{id}  { items: [{ id, kindId, kindName, label }], borrower, outDate, dueDate, memo,
//                           returned: { [itemId]: "YYYY-MM-DD" }, open, createdAt, closedAt? }
// - 번호(label)는 선생님이 직접 넣는 글자다. 숫자가 아니어도 되고, 한 종류 안에서만 겹치지 않으면 된다.
// - 기자재는 번호가 아니라 id 로 구분한다. 그래서 번호를 고쳐도 빌려준 기록이 그대로 따라간다.
// - 빌려준 기록에는 그때의 종류 이름·번호를 복사해 둔다. 나중에 기자재를 지워도 기록은 읽힌다.
// - 여러 대를 한 번에 빌려주면 기록 한 건이다. 일부만 돌아오면 returned 에 그 대만 날짜가 찍힌다.
// - 날짜는 workCalendar 와 같이 "YYYY-MM-DD" 문자열이다.

import { addDays, diffDays, formatPeriod, isDateKey, weekdayOf } from "./workCalendar";

export const KINDS_MAX = 20;
export const KIND_NAME_MAX = 20;
export const ITEMS_MAX = 300; // 한 종류에 넣을 수 있는 대수
export const LABEL_MAX = 30;
export const BORROWER_MAX = 40;
export const MEMO_MAX = 200;
export const LOAN_ITEMS_MAX = 300; // 한 번에 빌려줄 수 있는 대수

export const STATE_LABELS = { stock: "보관 중", loan: "대여 중", over: "반납 지남", repair: "수리 중" };

/** 저장 실패 알림 문구 */
export function saveErrorText(err) {
  if (err?.code === "permission-denied") return "저장할 권한이 없어요. Firebase 콘솔에 새 Firestore 규칙을 게시했는지 확인해 주세요.";
  if (err?.code === "not-found") return "그 기록이 이미 없어요. 다른 기기에서 지웠을 수 있어요.";
  return "저장하지 못했어요. 인터넷 연결을 확인해 주세요.";
}

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** 겹치지 않는 짧은 id (8글자) */
export function newId(taken = new Set(), random = Math.random) {
  for (let tries = 0; tries < 1000; tries++) {
    let id = "";
    for (let i = 0; i < 8; i++) id += ID_CHARS[Math.floor(random() * ID_CHARS.length)];
    if (!taken.has(id)) return id;
  }
  throw new Error("newId: 빈 id 를 찾지 못했습니다");
}

/** 저장된 종류 목록을 화면에서 쓰기 좋게 다듬는다 (깨진 항목은 버린다) */
export function normalizeKinds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((k) => k && typeof k.id === "string" && k.id)
    .map((k) => ({
      id: k.id,
      name: typeof k.name === "string" ? k.name : "",
      items: (Array.isArray(k.items) ? k.items : [])
        .filter((it) => it && typeof it.id === "string" && it.id && typeof it.label === "string")
        .map((it) => ({ id: it.id, label: it.label, repair: !!it.repair })),
    }));
}

/** 모든 종류의 기자재 id */
export function allItemIds(kinds) {
  const ids = new Set();
  for (const k of kinds) for (const it of k.items) ids.add(it.id);
  return ids;
}

/** "종류 이름 번호" (예: "태블릿 12") */
export function itemName(kindName, label) {
  return `${kindName || ""} ${label}`.trim();
}

// ---------------------------------------------------------------------------
// 목록 고치기 (한 줄에 한 대)
// ---------------------------------------------------------------------------

/** 목록 칸의 글자 → 번호 배열. 앞뒤 빈칸과 빈 줄은 버리고, 엑셀에서 붙인 탭·여러 칸 공백은 한 칸으로 줄인다 */
export function parseLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * "번호로 채우기": 앞 글자 + from ~ to.
 * pad 가 켜지면 자릿수를 맞춘다 (1~40 → 01~40, 1~120 → 001~120).
 * 반환: { lines } 또는 { error }
 */
export function fillRange({ prefix = "", from, to, pad = false }) {
  const fromText = String(from ?? "").trim();
  const toText = String(to ?? "").trim();
  if (!fromText || !toText) return { error: "번호를 두 칸 다 적어 주세요." };
  if (!/^\d+$/.test(fromText) || !/^\d+$/.test(toText)) return { error: "번호 칸에는 숫자만 적어 주세요." };
  const a = Number(fromText);
  const b = Number(toText);
  if (a > b) return { error: "앞 번호가 뒤 번호보다 클 수 없어요." };
  if (b - a + 1 > ITEMS_MAX) return { error: `한 번에 ${ITEMS_MAX}대까지 채울 수 있어요.` };
  const width = pad ? Math.max(2, String(b).length) : 0;
  const lines = [];
  for (let n = a; n <= b; n++) lines.push(`${prefix}${String(n).padStart(width, "0")}`.replace(/\s+/g, " ").trim());
  return { lines };
}

/**
 * 목록을 새 줄들로 바꾸면 무엇이 바뀌는지 계산한다.
 * 같은 번호는 같은 기자재로 본다(그래서 빌려준 기록·수리 중 표시가 유지된다). 새 번호는 새 기자재, 빠진 번호는 지운다.
 *   oldItems: 지금 목록, lines: 새 번호들, busyIds: 빌려 가 있는 기자재 id, takenIds: 다른 종류까지 포함해 이미 쓰는 id
 * 반환: { error } 또는 { items, kept, added, removed, blocked, reordered }
 *   blocked: 지우려는 것 중 빌려 가 있는 기자재 (있으면 저장하면 안 된다)
 */
export function planKindEdit(oldItems, lines, busyIds = new Set(), takenIds = new Set()) {
  if (lines.length > ITEMS_MAX) return { error: `한 종류에 ${ITEMS_MAX}대까지 넣을 수 있어요. (지금 ${lines.length}줄)` };
  const tooLong = lines.find((l) => l.length > LABEL_MAX);
  if (tooLong) return { error: `번호는 ${LABEL_MAX}자까지 쓸 수 있어요: "${tooLong.slice(0, 15)}…"` };
  const seen = new Set();
  const dups = new Set();
  for (const l of lines) {
    if (seen.has(l)) dups.add(l);
    seen.add(l);
  }
  if (dups.size) return { error: `같은 번호가 두 번 있어요: ${[...dups].slice(0, 5).join(", ")}${dups.size > 5 ? " …" : ""}` };

  const byLabel = new Map(oldItems.map((it) => [it.label, it]));
  const taken = new Set(takenIds);
  for (const it of oldItems) taken.add(it.id);
  const added = [];
  const items = lines.map((label) => {
    const old = byLabel.get(label);
    if (old) return old;
    const item = { id: newId(taken), label, repair: false };
    taken.add(item.id);
    added.push(item);
    return item;
  });
  const keep = new Set(items.map((it) => it.id));
  const removed = oldItems.filter((it) => !keep.has(it.id));
  const blocked = removed.filter((it) => busyIds.has(it.id));
  const keptOrder = items.filter((it) => !added.includes(it)).map((it) => it.id);
  const oldOrder = oldItems.filter((it) => keep.has(it.id)).map((it) => it.id);
  const reordered = keptOrder.some((id, i) => id !== oldOrder[i]);
  return { items, kept: items.length - added.length, added, removed, blocked, reordered };
}

/** 종류 이름 점검. 문제가 있으면 안내 문구, 없으면 null */
export function validateKindName(name, kinds, selfId = null) {
  const n = String(name || "").trim();
  if (!n) return "종류 이름을 적어 주세요. (예: 태블릿)";
  if (n.length > KIND_NAME_MAX) return `종류 이름은 ${KIND_NAME_MAX}자까지 쓸 수 있어요.`;
  if (kinds.some((k) => k.id !== selfId && k.name.trim() === n)) return `"${n}" 종류가 이미 있어요.`;
  return null;
}

/** 번호 하나 고칠 때 점검 */
export function validateLabel(label, kind, selfId) {
  const l = String(label || "").replace(/\s+/g, " ").trim();
  if (!l) return "번호를 적어 주세요.";
  if (l.length > LABEL_MAX) return `번호는 ${LABEL_MAX}자까지 쓸 수 있어요.`;
  if (kind.items.some((it) => it.id !== selfId && it.label === l)) return `"${itemName(kind.name, l)}" 번호가 이미 있어요.`;
  return null;
}

// ---------------------------------------------------------------------------
// 상태 (보관 중 · 대여 중 · 반납 지남 · 수리 중)
// ---------------------------------------------------------------------------

/**
 * 기자재마다 지금 상태. Map<itemId, { state, loan }>
 *   state: "stock"(보관 중) | "loan"(대여 중) | "over"(반납 날짜 지남) | "repair"(수리 중)
 * 빌려 가 있으면 수리 중 표시보다 대여 상태가 앞선다.
 */
export function itemStates(kinds, openLoans, today) {
  const map = new Map();
  for (const k of kinds) for (const it of k.items) map.set(it.id, { state: it.repair ? "repair" : "stock", loan: null });
  for (const loan of openLoans) {
    if (!loan || !loan.open) continue;
    const over = isDateKey(loan.dueDate) && loan.dueDate < today;
    for (const it of loan.items || []) {
      if (loan.returned?.[it.id] || !map.has(it.id)) continue;
      map.set(it.id, { state: over ? "over" : "loan", loan });
    }
  }
  return map;
}

export const isBusy = (info) => !!info && (info.state === "loan" || info.state === "over");

/** 빌려 가 있는 기자재 id */
export function busyIds(states) {
  const ids = new Set();
  for (const [id, info] of states) if (isBusy(info)) ids.add(id);
  return ids;
}

/** 머리 카드의 숫자들. loan 은 반납 지남(over)을 포함한다 */
export function countStates(kinds, states) {
  const c = { total: 0, stock: 0, loan: 0, over: 0, repair: 0 };
  for (const k of kinds) {
    for (const it of k.items) {
      const s = states.get(it.id)?.state || "stock";
      c.total++;
      if (s === "stock") c.stock++;
      else if (s === "repair") c.repair++;
      else {
        c.loan++;
        if (s === "over") c.over++;
      }
    }
  }
  return c;
}

/** 상태 칸(전체·보관 중·대여 중·반납 지남)으로 거를 때 이 기자재가 보이나 */
export function stateMatchesFilter(state, filter) {
  if (filter === "stock") return state === "stock";
  if (filter === "loan") return state === "loan" || state === "over";
  if (filter === "over") return state === "over";
  return true;
}

// ---------------------------------------------------------------------------
// 빌려준 기록
// ---------------------------------------------------------------------------

/** 아직 돌아오지 않은 기자재 */
export function unreturnedItems(loan) {
  return (loan.items || []).filter((it) => !loan.returned?.[it.id]);
}

/**
 * 기자재 묶음을 짧게: "태블릿 1~30 (30대)", "노트북 05", "태블릿 1, 3 · 노트북 02 (3대)".
 * 지금 목록에서 바로 이어진 번호 3대 이상은 "처음~끝"으로 줄인다. 지금 번호(고쳤으면 고친 번호)를 쓰고,
 * 지워진 기자재는 기록에 남은 번호를 쓴다.
 */
export function describeItems(loanItems, kinds, { count = true } = {}) {
  const kindIndex = new Map(kinds.map((k, i) => [k.id, i]));
  const groups = new Map();
  for (const it of loanItems) {
    if (!groups.has(it.kindId)) groups.set(it.kindId, []);
    groups.get(it.kindId).push(it);
  }
  const order = [...groups.keys()].sort((a, b) => (kindIndex.get(a) ?? 1e9) - (kindIndex.get(b) ?? 1e9));
  const parts = order.map((kindId) => {
    const list = groups.get(kindId);
    const kind = kinds.find((k) => k.id === kindId);
    const pos = new Map((kind?.items || []).map((x, i) => [x.id, i]));
    const entries = list
      .map((it) => {
        const p = pos.has(it.id) ? pos.get(it.id) : null;
        return { label: p === null ? it.label : kind.items[p].label, pos: p };
      })
      .sort((a, b) => (a.pos ?? 1e9) - (b.pos ?? 1e9));
    const runs = [];
    for (const e of entries) {
      const last = runs[runs.length - 1];
      if (last && e.pos !== null && last.end !== null && e.pos === last.end + 1) {
        last.labels.push(e.label);
        last.end = e.pos;
      } else {
        runs.push({ labels: [e.label], end: e.pos });
      }
    }
    const segs = runs.flatMap((r) =>
      r.labels.length >= 3 ? [{ text: `${r.labels[0]}~${r.labels[r.labels.length - 1]}`, count: r.labels.length }] : r.labels.map((l) => ({ text: l, count: 1 }))
    );
    const shown = segs.slice(0, 4).map((s) => s.text).join(", ");
    const hidden = segs.slice(4).reduce((sum, s) => sum + s.count, 0);
    const name = kind ? kind.name : list[0].kindName || "";
    return itemName(name, shown + (hidden ? ` 외 ${hidden}대` : ""));
  });
  return parts.join(" · ") + (count && loanItems.length > 1 ? ` (${loanItems.length}대)` : "");
}

/** "11/9(월)" */
export function formatDay(key) {
  return isDateKey(key) ? formatPeriod(key, key) : "";
}

/** 반납 날짜 표시: { tone: "over" | "today" | "normal", label } */
export function dueBadge(dueDate, today) {
  if (!isDateKey(dueDate)) return { tone: "normal", label: "대여 중" };
  const d = diffDays(today, dueDate);
  if (d < 0) return { tone: "over", label: `${-d}일 지남` };
  if (d === 0) return { tone: "today", label: "오늘까지" };
  if (d === 1) return { tone: "normal", label: "내일까지" };
  return { tone: "normal", label: `${d}일 남음` };
}

/** 지금 빌려 간 것: 반납 날짜가 이른 것(지난 것)이 위로 */
export function sortOpenLoans(loans) {
  return [...loans].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return String(a.dueDate) < String(b.dueDate) ? -1 : 1;
    if (a.outDate !== b.outDate) return String(a.outDate) < String(b.outDate) ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** 지난 기록의 "반납한 날": 하루에 다 왔으면 그 날, 나눠 왔으면 "11/9(월) 29대 · 11/10(화) 1대" */
export function returnedText(loan) {
  const counts = new Map();
  for (const it of loan.items || []) {
    const d = loan.returned?.[it.id];
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  const dates = [...counts.keys()].sort();
  if (dates.length === 0) return "";
  if (dates.length === 1) return formatDay(dates[0]);
  return dates.map((d) => `${formatDay(d)} ${counts.get(d)}대`).join(" · ");
}

/** 반납 날짜 빠른 선택: 오늘 · 내일 · (이번 주|다음 주) 금요일 */
export function dueChoices(today) {
  const wd = weekdayOf(today); // 0(일) ~ 6(토)
  const toFri = (5 - wd + 7) % 7;
  const thisWeek = wd >= 1 && wd <= 3; // 월~수면 이번 주 금요일이 모레 이후
  const friDays = thisWeek ? toFri : toFri <= 1 ? toFri + 7 : toFri;
  return [
    { id: "today", label: "오늘", date: today },
    { id: "tomorrow", label: "내일", date: addDays(today, 1) },
    { id: "friday", label: thisWeek ? "이번 주 금요일" : "다음 주 금요일", date: addDays(today, friDays) },
  ];
}

/** "11/11" */
export function shortDate(key) {
  return isDateKey(key) ? `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}` : "";
}

/** 빌려주기·고치기 저장 전 점검. minDue: 반납 날짜가 이보다 앞이면 안 된다 (새로 빌려줄 때는 오늘) */
export function validateLoan({ itemCount, borrower, dueDate, memo }, minDue) {
  if (itemCount !== undefined && itemCount < 1) return "빌려줄 기자재를 골라 주세요.";
  if (itemCount > LOAN_ITEMS_MAX) return `한 번에 ${LOAN_ITEMS_MAX}대까지 빌려줄 수 있어요.`;
  const who = String(borrower || "").trim();
  if (!who) return "누가 빌려 가는지 적어 주세요.";
  if (who.length > BORROWER_MAX) return `빌리는 사람은 ${BORROWER_MAX}자까지 쓸 수 있어요.`;
  if (!isDateKey(dueDate)) return "언제까지 돌려받을지 골라 주세요.";
  if (minDue && dueDate < minDue) return "반납 날짜가 빌린 날보다 앞일 수 없어요.";
  if (String(memo || "").length > MEMO_MAX) return `메모는 ${MEMO_MAX}자까지 쓸 수 있어요.`;
  return null;
}

/** 최근에 쓴 빌리는 사람 이름 (최근 것부터, 겹치지 않게) */
export function recentBorrowers(loans, limit = 5) {
  const ms = (l) => (typeof l.createdAt?.toMillis === "function" ? l.createdAt.toMillis() : Number.MAX_SAFE_INTEGER);
  const out = [];
  for (const l of [...loans].sort((a, b) => ms(b) - ms(a))) {
    const who = String(l.borrower || "").trim();
    if (who && !out.includes(who)) out.push(who);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 번호 범위로 고르기. 목록 순서 기준으로 from 번호부터 to 번호까지 (거꾸로 적어도 된다).
 * "1" 을 적었는데 목록이 "01" 이면 숫자로 맞춰 찾는다. isFree 가 false 인 기자재는 빠진다.
 * 반환: { ids, skipped } 또는 { error }
 */
export function pickRange(items, fromLabel, toLabel, isFree) {
  const find = (raw) => {
    const t = String(raw || "").replace(/\s+/g, " ").trim();
    if (!t) return -2;
    const exact = items.findIndex((it) => it.label === t);
    if (exact >= 0 || !/^\d+$/.test(t)) return exact;
    return items.findIndex((it) => /^\d+$/.test(it.label) && Number(it.label) === Number(t));
  };
  const a = find(fromLabel);
  const b = find(toLabel);
  if (a === -2 || b === -2) return { error: "번호를 두 칸 다 적어 주세요." };
  if (a < 0) return { error: `목록에 "${String(fromLabel).trim()}" 번호가 없어요.` };
  if (b < 0) return { error: `목록에 "${String(toLabel).trim()}" 번호가 없어요.` };
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const span = items.slice(lo, hi + 1);
  const ids = span.filter(isFree).map((it) => it.id);
  return { ids, skipped: span.length - ids.length };
}

/** 검색: 빌린 사람, 메모, 기자재 번호 */
export function loanMatches(loan, q, kinds) {
  if (!q) return true;
  const kindName = (it) => kinds.find((k) => k.id === it.kindId)?.name ?? it.kindName ?? "";
  const labelOf = (it) => kinds.find((k) => k.id === it.kindId)?.items.find((x) => x.id === it.id)?.label ?? it.label;
  const text = [loan.borrower, loan.memo, ...(loan.items || []).map((it) => `${itemName(kindName(it), labelOf(it))} ${it.label}`)]
    .join("\n")
    .toLowerCase();
  return text.includes(q);
}

export function itemMatches(kind, item, q) {
  return !q || itemName(kind.name, item.label).toLowerCase().includes(q) || item.label.toLowerCase().includes(q);
}

/** 빌려줄 때 기록에 남길 기자재 목록 (종류 순서 → 목록 순서) */
export function loanItemsFor(kinds, ids) {
  const out = [];
  for (const k of kinds) for (const it of k.items) if (ids.has(it.id)) out.push({ id: it.id, kindId: k.id, kindName: k.name, label: it.label });
  return out;
}
