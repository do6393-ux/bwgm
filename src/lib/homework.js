// 정보 수업 "과제" 기능의 계산 로직 (화면·Firebase 와 분리해서 테스트한다).
//
// 데이터 (Firestore)
//   homework/{id}                      과제. 누구나 읽기, 교사만 쓰기
//       { title, body, classes: ["1-3", ...], due: "YYYY-MM-DD" | "", open, createdAt }
//   homework/{id}/submissions/{sid}    제출물 원본. 학생은 쓰기만, 읽기는 교사만
//       { studentNum, studentName, text, createdAt }
//   homework/{id}/roster/{sid}         제출 확인용 공개 목록 (같은 sid). 내용 없이 학번과 가린 이름만
//       { studentNum, maskedName, createdAt }
//   homework_settings/classes          교사만. { classes: [{ id: "1-3", size: 28 }, ...] }
//
// 학번은 5자리 "학년(1) 반(2) 번호(2)". 예) 10307 = 1학년 3반 7번.
// 길이 제한은 firestore.rules 의 homework 규칙과 같게 둘 것.

import { dateKey, dDay, isDateKey } from "./workCalendar";

export const TITLE_MAX = 120;
export const BODY_MAX = 5000;
export const NAME_MAX = 20;
export const TEXT_MAX = 5000;
export const CLASS_SIZE_MAX = 60;

const STUDENT_NUM_RE = /^[1-9][0-9]{4}$/;

/** 입력한 학번에서 공백을 빼고, 전각 숫자(１２３)는 보통 숫자로 바꾼다 */
export function normalizeStudentNum(value) {
  return String(value ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "");
}

/** "10307" → { grade: 1, cls: 3, num: 7, classId: "1-3" }. 형식이 틀리면 null */
export function parseStudentNum(value) {
  const s = normalizeStudentNum(value);
  if (!STUDENT_NUM_RE.test(s)) return null;
  const grade = Number(s[0]);
  const cls = Number(s.slice(1, 3));
  const num = Number(s.slice(3, 5));
  if (cls < 1 || num < 1) return null;
  return { grade, cls, num, classId: `${grade}-${cls}` };
}

/** 홍길동 → 홍*동, 김철 → 김*, 남궁민수 → 남**수, 이 → * */
export function maskName(name) {
  const chars = Array.from(String(name ?? "").trim());
  if (chars.length <= 1) return "*";
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

/** "1-3" → "1학년 3반" */
export function classLabel(classId) {
  const [g, c] = String(classId).split("-");
  return c ? `${g}학년 ${c}반` : String(classId);
}

/** "1-3" → "103" (학번 앞 세 자리) */
export function classPrefix(classId) {
  const [g, c] = String(classId).split("-").map(Number);
  return `${g}${String(c).padStart(2, "0")}`;
}

export function isClassId(value) {
  return typeof value === "string" && /^[1-9]-[1-9][0-9]?$/.test(value);
}

/** 반 ID 를 학년·반 순서로 */
export function sortClassIds(ids) {
  const key = (id) => id.split("-").map(Number);
  return [...new Set(ids)].sort((a, b) => {
    const [ga, ca] = key(a);
    const [gb, cb] = key(b);
    return ga - gb || ca - cb;
  });
}

/** 반 설정을 정리한다: 형식이 틀린 것·중복은 빼고, 인원은 1~60 */
export function normalizeClassSettings(classes) {
  const map = new Map();
  for (const c of Array.isArray(classes) ? classes : []) {
    if (!c || !isClassId(c.id)) continue;
    const size = Math.round(Number(c.size));
    if (!Number.isFinite(size) || size < 1) continue;
    map.set(c.id, Math.min(size, CLASS_SIZE_MAX));
  }
  return sortClassIds([...map.keys()]).map((id) => ({ id, size: map.get(id) }));
}

/** 학년·반 범위로 반 여러 개를 한꺼번에 만든다 (1학년 1~9반, 28명) */
export function classRange(grade, from, to, size) {
  const g = Number(grade);
  const a = Math.min(Number(from), Number(to));
  const b = Math.max(Number(from), Number(to));
  if (!(g >= 1 && g <= 9 && a >= 1 && b <= 99)) return [];
  const out = [];
  for (let c = a; c <= b; c++) out.push({ id: `${g}-${c}`, size: Number(size) });
  return normalizeClassSettings(out);
}

/** 제출 시각(ms)이 마감일(그날 끝까지)보다 늦은지. 마감일이 없으면 지각 없음 */
export function isLate(at, due) {
  if (!isDateKey(due) || !Number.isFinite(at)) return false;
  return dateKey(new Date(at)) > due;
}

/** 마감 표시. due 가 없으면 null */
export function dueInfo(due, now = new Date()) {
  if (!isDateKey(due)) return null;
  const { days, label } = dDay(due, dateKey(now));
  const date = `${Number(due.slice(5, 7))}.${Number(due.slice(8, 10))}`;
  return { date, days, label: days < 0 ? "기한 지남" : label };
}

/** "11.06 14:32" */
export function formatTime(at) {
  if (!Number.isFinite(at)) return "방금";
  const d = new Date(at);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 제출 목록을 학번별로 묶는다. 같은 학생이 여러 번 내면 모두 남기고, 마지막 것을 대표로 쓴다 */
export function groupByStudent(subs) {
  const map = new Map();
  for (const s of [...subs].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))) {
    const list = map.get(s.studentNum) || [];
    list.push(s);
    map.set(s.studentNum, list);
  }
  return map;
}

/**
 * 반별 제출 현황 칸.
 *   classes: [{ id, size }]  대상 반과 인원 (인원을 모르면 size 0 → 제출한 가장 큰 번호까지 보여 준다)
 *   subs:    [{ studentNum, at, ... }]
 * 결과: { classes: [{ id, label, size, cells, done, late, missing }], extras, totals }
 *   cells[i] = { num, studentNum, state: "none"|"ok"|"late", subs }
 *   extras   = 대상 반이 아니거나 번호가 인원보다 큰 제출물 (학번을 잘못 쓴 경우를 찾기 쉽게)
 */
export function buildClassGrid(classes, subs, due = "") {
  const byStudent = groupByStudent(subs);
  const used = new Set();
  const result = classes.map(({ id, size }) => {
    const prefix = classPrefix(id);
    let maxNum = 0;
    for (const sn of byStudent.keys()) {
      if (sn.startsWith(prefix)) maxNum = Math.max(maxNum, Number(sn.slice(3, 5)));
    }
    const n = size > 0 ? size : maxNum;
    const cells = [];
    for (let num = 1; num <= n; num++) {
      const studentNum = `${prefix}${String(num).padStart(2, "0")}`;
      const list = byStudent.get(studentNum) || [];
      if (list.length) used.add(studentNum);
      // 한 번이라도 기한 안에 냈으면 "제출". 기한 뒤에만 냈으면 "지각"
      const state = list.length === 0 ? "none" : list.some((s) => !isLate(s.at, due)) ? "ok" : "late";
      cells.push({ num, studentNum, state, subs: list });
    }
    return {
      id,
      label: classLabel(id),
      size: n,
      cells,
      done: cells.filter((c) => c.state !== "none").length,
      late: cells.filter((c) => c.state === "late").length,
      missing: cells.filter((c) => c.state === "none").map((c) => c.num),
    };
  });
  const extras = subs.filter((s) => !used.has(s.studentNum));
  const totals = result.reduce(
    (t, c) => ({ size: t.size + c.size, done: t.done + c.done, late: t.late + c.late, missing: t.missing + c.missing.length }),
    { size: 0, done: 0, late: 0, missing: 0 }
  );
  return { classes: result, extras, totals };
}

/** 과제의 대상 반에 인원을 붙인다. 대상 반이 없는 과제는 제출이 들어온 반으로 대신한다 */
export function targetClasses(homework, settings, subs = []) {
  const sizes = new Map(normalizeClassSettings(settings).map((c) => [c.id, c.size]));
  let ids = (homework?.classes || []).filter(isClassId);
  if (ids.length === 0) {
    ids = subs.map((s) => parseStudentNum(s.studentNum)?.classId).filter(Boolean);
  }
  return sortClassIds(ids).map((id) => ({ id, size: sizes.get(id) || 0 }));
}

/** "1학년 3반 미제출(3명): 2, 7, 15번" 줄들. 메신저에 붙여 넣기 좋게 */
export function missingText(grid, title = "") {
  const lines = grid.classes.map((c) =>
    c.missing.length === 0 ? `${c.label} 모두 제출` : `${c.label} 미제출(${c.missing.length}명): ${c.missing.join(", ")}번`
  );
  return [title && `[${title}]`, ...lines].filter(Boolean).join("\n");
}

/** 정렬: "num"(학번 오름차순) | "new"(최근 제출 먼저) | "old"(먼저 낸 순) */
export function sortSubmissions(subs, mode = "num") {
  const at = (s) => s.at ?? Infinity; // 아직 서버 시각이 없는 방금 낸 것은 가장 최근으로 본다
  const list = [...subs];
  if (mode === "new") return list.sort((a, b) => at(b) - at(a));
  if (mode === "old") return list.sort((a, b) => at(a) - at(b));
  return list.sort((a, b) => a.studentNum.localeCompare(b.studentNum) || at(a) - at(b));
}

/**
 * 누적 현황표: 한 반의 학생 × 그 반이 대상인 과제들.
 *   homeworks: [{ id, title, due, classes }] (오래된 과제부터)
 *   rosters:   { [homeworkId]: [{ studentNum, at }] }
 */
export function cumulativeTable(classId, size, homeworks, rosters) {
  const prefix = classPrefix(classId);
  const columns = homeworks.filter((h) => (h.classes || []).includes(classId));
  let n = size;
  if (!(n > 0)) {
    for (const h of columns) {
      for (const s of rosters[h.id] || []) {
        if (s.studentNum.startsWith(prefix)) n = Math.max(n, Number(s.studentNum.slice(3, 5)));
      }
    }
  }
  const grids = columns.map((h) => {
    const byStudent = groupByStudent((rosters[h.id] || []).filter((s) => s.studentNum.startsWith(prefix)));
    return { h, byStudent };
  });
  const rows = [];
  for (let num = 1; num <= n; num++) {
    const studentNum = `${prefix}${String(num).padStart(2, "0")}`;
    const cells = grids.map(({ h, byStudent }) => {
      const list = byStudent.get(studentNum) || [];
      return list.length === 0 ? "none" : list.some((s) => !isLate(s.at, h.due)) ? "ok" : "late";
    });
    const missing = cells.filter((c) => c === "none").length;
    rows.push({ num, studentNum, cells, done: cells.length - missing, missing });
  }
  return { columns, rows };
}

/** CSV 한 칸. 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다. 수식으로 해석될 수 있는 첫 글자는 막는다 */
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인 CSV 문자열 */
export function toCsv(rows) {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** 제출물 원본 → 제출 확인용 공개 목록 한 줄 */
export function rosterEntry(studentNum, studentName) {
  return { studentNum: normalizeStudentNum(studentNum), maskedName: maskName(studentName) };
}

/** 학생 제출 입력 점검. 문제가 없으면 null, 있으면 안내 문구 */
export function validateSubmission({ studentNum, studentName, text }) {
  if (!parseStudentNum(studentNum)) return "학번은 5자리 숫자로 적어 주세요. 예) 1학년 3반 7번 → 10307";
  const name = String(studentName ?? "").trim();
  if (!name) return "이름을 적어 주세요.";
  if (name.length > NAME_MAX) return `이름은 ${NAME_MAX}자까지 적을 수 있어요.`;
  const body = String(text ?? "").trim();
  if (!body) return "과제 내용을 적어 주세요.";
  if (body.length > TEXT_MAX) return `내용은 ${TEXT_MAX}자까지 적을 수 있어요. (지금 ${body.length}자)`;
  return null;
}

/** 교사 과제 입력 점검 */
export function validateHomework({ title, body, due }) {
  const t = String(title ?? "").trim();
  if (!t) return "과제 제목을 적어 주세요.";
  if (t.length > TITLE_MAX) return `제목은 ${TITLE_MAX}자까지예요.`;
  if (String(body ?? "").length > BODY_MAX) return `과제 내용은 ${BODY_MAX}자까지예요.`;
  if (due && !isDateKey(due)) return "마감일 형식이 올바르지 않아요.";
  return null;
}
