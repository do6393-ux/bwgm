import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { applyReturnEdits, normalizeKinds } from "@/lib/equipment";

// 기자재 대여 장부의 Firestore 읽기·쓰기. 데이터 모양은 src/lib/equipment.js 머리말 참고.
// 권한은 정보 업무와 같다 (firestore.rules 의 equipment, equipment_loans).

const inventoryRef = () => doc(db, "equipment", "inventory");
const loansCol = () => collection(db, "equipment_loans");
const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/** 종류·번호 목록. 문서가 아직 없으면 빈 목록 */
export function watchInventory(onData, onError) {
  return onSnapshot(inventoryRef(), (snap) => onData(normalizeKinds(snap.exists() ? snap.data().kinds : [])), onError);
}

/** 아직 다 돌아오지 않은 대여 기록 */
export function watchOpenLoans(onData, onError) {
  return onSnapshot(query(loansCol(), where("open", "==", true)), (snap) => onData(withId(snap)), onError);
}

/** 반납까지 끝난 기록, 최근 것부터 max 건 (closedAt 이 있는 문서만 잡힌다) */
export function watchHistory(max, onData, onError) {
  return onSnapshot(query(loansCol(), orderBy("closedAt", "desc"), limit(max)), (snap) => onData(withId(snap)), onError);
}

// 종류 목록은 한 문서라서, 두 사람이 동시에 고쳐도 서로 지우지 않도록 트랜잭션으로 읽고 고친다.
function editInventory(change) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(inventoryRef());
    const kinds = normalizeKinds(snap.exists() ? snap.data().kinds : []);
    tx.set(inventoryRef(), { kinds: change(kinds), updatedAt: serverTimestamp() });
  });
}

/** 종류 하나를 통째로 저장 (없으면 맨 뒤에 추가). kind = { id, name, items } */
export function saveKind(kind) {
  return editInventory((kinds) => {
    const i = kinds.findIndex((k) => k.id === kind.id);
    if (i < 0) return [...kinds, kind];
    const next = [...kinds];
    next[i] = kind;
    return next;
  });
}

export function deleteKind(kindId) {
  return editInventory((kinds) => kinds.filter((k) => k.id !== kindId));
}

/** 기자재 한 대 고치기. patch = { label?, repair? } */
export function updateItem(kindId, itemId, patch) {
  return editInventory((kinds) =>
    kinds.map((k) => (k.id !== kindId ? k : { ...k, items: k.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }))
  );
}

export function deleteItem(kindId, itemId) {
  return editInventory((kinds) => kinds.map((k) => (k.id !== kindId ? k : { ...k, items: k.items.filter((it) => it.id !== itemId) })));
}

/** 빌려주기. data = { items: [{ id, kindId, kindName, label }], borrower, outDate, memo } */
export async function createLoan(data) {
  const ref = await addDoc(loansCol(), {
    items: data.items,
    borrower: data.borrower,
    outDate: data.outDate,
    memo: data.memo,
    returned: {},
    open: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

const loanRef = (id) => doc(db, "equipment_loans", id);
const notFound = () => Object.assign(new Error("대여 기록이 없습니다"), { code: "not-found" });

/**
 * 빌린 사람·빌린 날·메모 고치기 (지금 빌려 간 것, 지난 기록 둘 다).
 * returnChanges: 반납 일시 묶음마다 { from, to } — 고치는 사이 다른 기기에서 반납한 것은 건드리지 않도록 트랜잭션으로 바꾼다.
 */
export function updateLoan(id, { borrower, outDate, memo, returnChanges = [] }) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(loanRef(id));
    if (!snap.exists()) throw notFound();
    tx.update(loanRef(id), { borrower, outDate, memo, returned: applyReturnEdits(snap.data().returned, returnChanges) });
  });
}

export function deleteLoan(id) {
  return deleteDoc(loanRef(id));
}

/**
 * 반납 처리. itemIds 를 stamp("YYYY-MM-DD HH:MM")에 돌아온 것으로 적고 메모를 바꾼다.
 * 전부 돌아왔으면 기록을 닫는다(지난 기록으로). 반환: { allBack, left } (left = 아직 안 돌아온 대수)
 */
export function returnItems(loanId, itemIds, stamp, memo) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(loanRef(loanId));
    if (!snap.exists()) throw notFound();
    const loan = snap.data();
    const returned = { ...(loan.returned || {}) };
    for (const id of itemIds) if (!returned[id]) returned[id] = stamp;
    const left = (loan.items || []).filter((it) => !returned[it.id]).length;
    const patch = { returned, memo: typeof memo === "string" ? memo : loan.memo || "" };
    tx.update(loanRef(loanId), left === 0 ? { ...patch, open: false, closedAt: serverTimestamp() } : patch);
    return { allBack: left === 0, left };
  });
}
