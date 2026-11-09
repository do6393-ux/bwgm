// 과제 기능의 Firestore 읽기·쓰기. 데이터 구조는 src/lib/homework.js 머리말 참고.
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { normalizeClassSettings, normalizeStudentNum, rosterEntry } from "./homework";

const toMillis = (ts) => (ts && typeof ts.toMillis === "function" ? ts.toMillis() : undefined);

/** Firestore 문서 → 화면에서 쓰는 모양 (createdAt → at: ms, 서버 시각이 아직 없으면 undefined) */
const fromDoc = (d) => {
  const data = d.data();
  return { id: d.id, ...data, at: toMillis(data.createdAt) };
};

/** 과제 목록 (최근 것 먼저). enabled 가 false 면 구독하지 않는다 */
export function useHomeworkList(enabled = true) {
  const [state, setState] = useState({ list: [], loaded: false, error: false });
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      query(collection(db, "homework"), orderBy("createdAt", "desc")),
      (snap) => setState({ list: snap.docs.map(fromDoc), loaded: true, error: false }),
      (err) => {
        console.error("homework listener:", err);
        setState((s) => ({ ...s, loaded: true, error: true }));
      }
    );
  }, [enabled]);
  return state;
}

/** 과제 하나. missing: 없거나 삭제됨 */
export function useHomework(id) {
  const [state, setState] = useState({ homework: null, error: null });
  useEffect(
    () =>
      onSnapshot(
        doc(db, "homework", id),
        (snap) => setState(snap.exists() ? { homework: fromDoc(snap), error: null } : { homework: null, error: "missing" }),
        (err) => {
          console.error("homework doc listener:", err);
          setState({ homework: null, error: "error" });
        }
      ),
    [id]
  );
  return state;
}

/**
 * 과제의 하위 목록을 실시간으로 받는다.
 *   kind "roster"(누구나: 학번·가린 이름) | "submissions"(교사만: 원본)
 *   enabled 가 false 면 구독하지 않는다 (학생은 submissions 읽기 권한이 없다)
 */
export function useHomeworkEntries(homeworkId, kind, enabled = true) {
  const [state, setState] = useState({ list: [], loaded: false, error: false });
  useEffect(() => {
    if (!enabled || !homeworkId) return undefined;
    const unsub = onSnapshot(
      collection(db, "homework", homeworkId, kind),
      (snap) => setState({ list: snap.docs.map(fromDoc), loaded: true, error: false }),
      (err) => {
        console.error(`homework ${kind} listener:`, err);
        setState({ list: [], loaded: true, error: true });
      }
    );
    return () => {
      unsub();
      setState({ list: [], loaded: false, error: false });
    };
  }, [homeworkId, kind, enabled]);
  return state;
}

/** 여러 과제의 제출 확인 목록을 한꺼번에 (누적 현황표). { [과제ID]: [...] } */
export function useAllRosters(homeworkIds) {
  const [rosters, setRosters] = useState({});
  const key = homeworkIds.join(",");
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const unsubs = ids.map((id) =>
      onSnapshot(
        collection(db, "homework", id, "roster"),
        (snap) => setRosters((r) => ({ ...r, [id]: snap.docs.map(fromDoc) })),
        (err) => console.error("roster listener:", err)
      )
    );
    return () => {
      unsubs.forEach((u) => u());
      setRosters({});
    };
  }, [key]);
  return rosters;
}

/** 반 설정 (교사만). 문서가 없으면 빈 목록 */
export function useClassSettings(enabled = true) {
  const [state, setState] = useState({ classes: [], loaded: false });
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      doc(db, "homework_settings", "classes"),
      (snap) => setState({ classes: normalizeClassSettings(snap.data()?.classes), loaded: true }),
      (err) => {
        console.error("class settings listener:", err);
        setState({ classes: [], loaded: true });
      }
    );
  }, [enabled]);
  return state;
}

export function saveClassSettings(classes) {
  return setDoc(doc(db, "homework_settings", "classes"), { classes: normalizeClassSettings(classes) });
}

/** 과제 만들기·고치기. id 가 없으면 새로 만든다 */
export async function saveHomework(id, { title, body, classes, due, open }) {
  const data = { title: title.trim(), body: body ?? "", classes: classes ?? [], due: due ?? "", open: open !== false };
  if (id) {
    await updateDoc(doc(db, "homework", id), data);
    return id;
  }
  const ref = await addDoc(collection(db, "homework"), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export function setHomeworkOpen(id, open) {
  return updateDoc(doc(db, "homework", id), { open });
}

/** 과제와 그 제출물을 모두 지운다 (Firestore 는 하위 목록을 같이 지워 주지 않는다) */
export async function deleteHomework(id) {
  for (const kind of ["submissions", "roster"]) {
    const snap = await getDocs(collection(db, "homework", id, kind));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, "homework", id));
  await batch.commit();
}

/**
 * 학생 제출. 원본(submissions)과 공개 확인 목록(roster)을 같은 ID 로 한 번에 쓴다.
 * 규칙에서 두 문서가 함께 생기는지 확인하므로, 한쪽만 생기는 일은 없다.
 */
export async function submitHomework(homeworkId, { studentNum, studentName, text }) {
  const subRef = doc(collection(db, "homework", homeworkId, "submissions"));
  const rosterRef = doc(db, "homework", homeworkId, "roster", subRef.id);
  const entry = rosterEntry(studentNum, studentName);
  const batch = writeBatch(db);
  batch.set(subRef, {
    studentNum: normalizeStudentNum(studentNum),
    studentName: String(studentName).trim(),
    text: String(text).trim(),
    createdAt: serverTimestamp(),
  });
  batch.set(rosterRef, { ...entry, createdAt: serverTimestamp() });
  await batch.commit();
  return { id: subRef.id, ...entry, at: Date.now() };
}

/** 제출물 하나 지우기 (원본과 확인 목록 둘 다) */
export async function deleteSubmission(homeworkId, submissionId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "homework", homeworkId, "submissions", submissionId));
  batch.delete(doc(db, "homework", homeworkId, "roster", submissionId));
  await batch.commit();
}

/** 파일 내려받기 (CSV 등) */
export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 클립보드 복사. 실패하면 false */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
