// 교무실 시간표 공용 함수 (교무실 표와 "오늘 한눈에" 카드가 같이 쓴다).
//
// 데이터 (Firestore, GitHub Actions 동기화가 기록 — README "컴시간 시간표 동기화")
//   timetable_schedules/tt_teacher_{this|next}_{키}   { schedule: { "교시_요일": { text, type } }, updatedAt }
//   timetable_schedules/tt_class_{this|next}_{학년-반}  같은 모양
//   timetable_schedules/meta_periods                  { times: ["09:00", ...] }  교시 시작 시각 (1교시부터)
// 요일은 0(월)~4(금), 교시는 1부터. text 는 교사 문서면 "205정보"(2학년 5반 정보), 학급 문서면 "정보홍길".
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const EVENT_KEYWORDS = ["자치", "동아", "봉사", "진로"];
export const PERIODS = 7;

export function parseMatrixData(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return parseMatrixData(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) {
    if (Array.isArray(raw[0])) return raw;
    if (raw.length === 35) {
      const res = [];
      for (let i = 0; i < 7; i++) res.push(raw.slice(i * 5, (i + 1) * 5));
      return res;
    }
  }
  return null;
}

export function isBaseMatrixEmpty(baseMatrix) {
  if (!baseMatrix) return true;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (baseMatrix[r]?.[c]?.trim() !== "") return false;
    }
  }
  return true;
}

/** 시간표 칸 하나의 글자 (없으면 "") */
export function cellText(scheduleMap, r, c) {
  const item = scheduleMap ? scheduleMap[`${r + 1}_${c}`] : null;
  if (!item) return "";
  return typeof item === "object" ? item.text || "" : String(item);
}

/** 창체(자치·동아리·봉사·진로) 칸인지 */
export function isEventText(text) {
  const clean = String(text || "").trim().replace(/\s+/g, "");
  return EVENT_KEYWORDS.some((k) => clean.includes(k));
}

/** 기본 시간표와 비교해 바뀐 칸인지. 기본 시간표를 등록하지 않았으면 언제나 false */
export function isCellChanged(r, c, scheduleMap, baseMatrix, isClass = false) {
  if (isBaseMatrixEmpty(baseMatrix)) return false;

  const item = scheduleMap ? scheduleMap[`${r + 1}_${c}`] : null;
  const text = cellText(scheduleMap, r, c);
  const isRed = !!item && typeof item === "object" && item.type === "red";

  const cleanBase = (baseMatrix?.[r]?.[c] || "").trim().replace(/\s+/g, "");
  const cleanText = text.trim().replace(/\s+/g, "");

  if (isEventText(cleanText)) return false;
  if (!cleanBase && !cleanText) return false;

  if (isClass && cleanBase !== "" && cleanText !== "") {
    const isMatch = cleanBase.slice(0, 2) === cleanText.slice(0, 2) || cleanText.startsWith(cleanBase);
    return !isMatch || isRed;
  }
  return cleanBase !== cleanText || isRed;
}

const toMillis = (ts) => (ts && typeof ts.toMillis === "function" ? ts.toMillis() : null);

/** 교사 문서 ID 후보: 이름 앞 2글자, 전체 이름, (설정한 경우) 컴시간 교사 번호 */
export function teacherDocKeys(teacherName, teacherCode) {
  const name = String(teacherName || "");
  return [...new Set([name.substring(0, 2), name, String(teacherCode || "")].filter(Boolean))];
}

/**
 * 교사 시간표 한 주치를 읽는다. weekKey: "this" | "next"
 * 반환 { schedule: 지도 | null, updatedAt: ms | null, failed: 읽기 자체가 실패했는지 }
 */
export async function fetchTeacherSchedule(weekKey, teacherName, teacherCode) {
  let failed = false;
  for (const k of teacherDocKeys(teacherName, teacherCode)) {
    try {
      const snap = await getDoc(doc(db, "timetable_schedules", `tt_teacher_${weekKey}_${k}`));
      if (snap.exists() && snap.data().schedule) {
        return { schedule: snap.data().schedule, updatedAt: toMillis(snap.data().updatedAt), failed: false };
      }
    } catch {
      failed = true;
    }
  }
  return { schedule: null, updatedAt: null, failed };
}

/** 학급 시간표 한 주치. classKey: "2-5" */
export async function fetchClassSchedule(weekKey, classKey) {
  try {
    const snap = await getDoc(doc(db, "timetable_schedules", `tt_class_${weekKey}_${classKey}`));
    if (snap.exists() && snap.data().schedule) {
      return { schedule: snap.data().schedule, updatedAt: toMillis(snap.data().updatedAt), failed: false };
    }
    return { schedule: null, updatedAt: null, failed: false };
  } catch {
    return { schedule: null, updatedAt: null, failed: true };
  }
}

/** 교시 시작 시각 ["09:00", ...]. 아직 동기화되지 않았으면 [] */
export async function fetchPeriodTimes() {
  try {
    const snap = await getDoc(doc(db, "timetable_schedules", "meta_periods"));
    const times = snap.exists() ? snap.data().times : null;
    return Array.isArray(times) ? times.filter((t) => /^\d{1,2}:\d{2}$/.test(t)) : [];
  } catch {
    return [];
  }
}
