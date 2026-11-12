// 정보부 업무분장(업무분장(정보부).hwp, 2026-11)의 세부 업무와 "해야 할 일" 도우미.
// 정보 업무 탭의 보직 탭(부장·정보기획·기기·소모품·나이스·공시)이 이 목록으로 업무분장 카드를 그린다.
//
// 카드 한 장 = work_tasks 문서 하나. 처음 열 때 work_tasks/duty_<key> 로 만들어지고,
// duty 필드에 key 가 들어간다. 예전 카드도 "업무분장 항목"을 고르면 duty 필드가 생겨 그 자리에 들어간다.
// ⚠️ key 는 바꾸지 않는다 (문서 ID 와 duty 필드가 이 값을 가리킨다). title 은 고쳐도 된다.
//
// 아래 DUTIES 는 처음 목록(2026-11 파일)이다. 관리자 · 부장이 "업무분장 고치기" 창에서 고치면
// work_config/duties 문서에 저장되고, 그 뒤로는 그 문서가 목록이 된다 (문서가 없을 때만 DUTIES).
// 그래서 목록을 쓰는 함수는 목록(duties)을 마지막 인자로 받는다 (안 주면 DUTIES).
//
// 해야 할 일(todos): [{ id, when: "3월"…"2월" | "수시", text, done }]
// Firebase 를 부르지 않는 순수 함수만 둔다 (저장은 workDutiesApi.js).

import { findPart } from "./workParts";

export const ROLE_PARTS = ["head", "plan", "device", "nais"];

// 탭 이름(짧게)과 머리 카드의 영문 표시
export const ROLE_META = {
  head: { tab: "부장", eyebrow: "HEAD OF DEPARTMENT" },
  plan: { tab: "정보기획", eyebrow: "INFO PLANNING" },
  device: { tab: "기기·소모품", eyebrow: "DEVICE & SUPPLIES" },
  nais: { tab: "나이스·공시", eyebrow: "NEIS & DISCLOSURE" },
};

// 보직 안의 작은 탭(도구). 업무분장 탭은 늘 맨 앞에 있다.
export const TOOLS = {
  equipment: { label: "기자재 대여" },
};
export const ROLE_TOOLS = {
  head: ["equipment"],
  plan: [],
  device: ["equipment"],
  nais: [],
};

const d = (key, title, tool) => (tool ? { key, title, tool } : { key, title });

export const DUTIES = {
  head: [
    d("head-plan", "교육정보부 계획 수립 · 업무 총괄"),
    d("head-privacy", "개인정보보호 총괄 및 정보보호 추진계획"),
    d("head-nac", "네트워크 제어시스템(NAC) 관리"),
    d("head-server", "서버실 관리"),
    d("head-icetalk", "icetalk 관리"),
    d("head-digital", "디지털 역량교육 총괄 (교사 · 학생 · 학부모)"),
    d("head-laptop", "학생 노트북 보급 및 관리 총괄"),
    d("head-repair", "정보화기기 유지보수(일지) 관리"),
    d("head-lend", "교사 정보화기기 대여", "equipment"),
    d("head-edutech", "에듀테크 구입 관리"),
  ],
  plan: [
    d("plan-homepage", "홈페이지 관리"),
    d("plan-account", "AIEP 및 MS 계정 관리"),
    d("plan-safenum", "교원안심번호 서비스"),
    d("plan-addiction", "인터넷 · 스마트폰 중독(이용습관진단) 조사"),
    d("plan-lab", "컴퓨터실 및 서버실 관리"),
    d("plan-board", "전자칠판 관리"),
    d("plan-contest", "교내외 정보 관련 대회 및 행사"),
    d("plan-ethics", "정보통신윤리교육 및 저작권 연수 (교사 · 학생 · 학부모)"),
  ],
  device: [
    d("device-purchase", "정보화기기 및 소모품 구입 관리"),
    d("device-laptop", "학생 노트북 보급 및 관리"),
    d("device-ip", "IP 주소 관리 및 내PC지킴이 실행 통계"),
    d("device-lend", "학생 정보화기기 대여", "equipment"),
    d("device-pad", "스마트패드 관리 및 Wi-Fi 관련 업무"),
    d("device-helper", "정보도우미 봉사활동 학생 조직 및 관리"),
    d("device-stats", "통계 및 교육 (교사 · 학생 · 학부모)"),
  ],
  nais: [
    d("nais-portal", "업무포털 지원 (기관 나이스 ID 및 권한 관리)"),
    d("nais-disclosure", "정보공시 및 정보공개 연수"),
    d("nais-privacy", "개인정보 보호 업무"),
    d("nais-support", "저소득층 PC 및 인터넷 통신비 지원"),
    d("nais-class", "반편성 업무 일괄 (신입생 · 재학생) 및 진급 처리"),
  ],
};

/** key 로 업무분장 항목을 찾는다 → { key, title, tool?, part } | null */
export function findDuty(key, duties = DUTIES) {
  if (!key) return null;
  for (const part of ROLE_PARTS) {
    const duty = (duties[part] || []).find((x) => x.key === key);
    if (duty) return { ...duty, part };
  }
  return null;
}

/** 보직 탭 안의 작은 탭(도구): 기본 도구 + 그 보직으로 옮겨 온 업무에 딸린 도구 */
export function panelTools(part, duties = DUTIES) {
  const fromDuties = (duties[part] || []).map((x) => x.tool).filter((t) => t && TOOLS[t]);
  return [...new Set([...(ROLE_TOOLS[part] || []), ...fromDuties])];
}

export const dutyDocId = (key) => `duty_${key}`;

/**
 * 이 사람에게 보일 보직 탭.
 * 관리자 · 부장 · 보직을 아직 안 정한 사람은 4개 다, 나머지는 자기 보직 하나.
 */
export function visibleParts({ admin, workRole }) {
  if (admin || workRole === "head" || !ROLE_PARTS.includes(workRole)) return [...ROLE_PARTS];
  return [workRole];
}

// ---------- 해야 할 일 ----------

export const TODO_TEXT_MAX = 200;
export const TODOS_MAX = 60;

// 학년도 순서: 3월 … 12월, 1월, 2월, 그리고 시기 없는 "수시"
const SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
export const WHEN_OPTIONS = [...SCHOOL_MONTHS.map((m) => `${m}월`), "수시"];
const ANYTIME = WHEN_OPTIONS.length - 1;

/** "3월" → 0, "2월" → 11, "수시"·모르는 값 → 12 */
export function whenIndex(when) {
  const i = WHEN_OPTIONS.indexOf(when);
  return i === -1 ? ANYTIME : i;
}

/** 달(1~12) → 학년도 순서 번호 */
export const monthIndex = (month) => SCHOOL_MONTHS.indexOf(month);

/** 학년도 순서대로 (같은 시기 안에서는 적은 순서 그대로) */
export function sortTodos(todos = []) {
  return todos
    .map((t, i) => ({ t, i }))
    .sort((a, b) => whenIndex(a.t.when) - whenIndex(b.t.when) || a.i - b.i)
    .map(({ t }) => t);
}

export function todoProgress(todos = []) {
  return { done: todos.filter((t) => t.done).length, total: todos.length };
}

/** 이번 달보다 앞선 달인데 아직 안 한 일인가 (수시는 지나는 일이 없다) */
export function isLate(todo, month) {
  const i = whenIndex(todo.when);
  return !todo.done && i !== ANYTIME && i < monthIndex(month);
}

/**
 * 카드에 보여 줄 "다음 할 일": 지난 일 → 이번 달 → 다음 달들 → 수시 순으로 첫 번째 안 한 일.
 * → { todo, late } | null
 */
export function nextTodo(todos = [], month) {
  const open = sortTodos(todos).filter((t) => !t.done);
  if (!open.length) return null;
  const late = open.find((t) => isLate(t, month));
  if (late) return { todo: late, late: true };
  return { todo: open[0], late: false };
}

/**
 * 머리 카드의 "이번 달에 할 일": 여러 카드의 할 일 중 지난 일 + 이번 달 일 (안 한 것만).
 * cards: [{ task, title, ...그 밖의 값 }] → [{ task, title, ...그 밖의 값, todo, late }]
 */
export function monthTodos(cards, month) {
  const here = `${month}월`;
  const rows = [];
  for (const card of cards) {
    for (const todo of sortTodos(card.task?.todos || [])) {
      if (todo.done) continue;
      const late = isLate(todo, month);
      if (late || todo.when === here) rows.push({ ...card, todo, late });
    }
  }
  return rows.sort((a, b) => Number(b.late) - Number(a.late) || whenIndex(a.todo.when) - whenIndex(b.todo.when));
}

/** 할 일 하나를 고쳐서 새 배열로 */
export function patchTodo(todos = [], id, patch) {
  return todos.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function newTodoId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 할 일 입력 점검 → 문제 문구 | null */
export function validateTodo({ when, text }, count = 0) {
  if (!WHEN_OPTIONS.includes(when)) return "시기를 골라 주세요.";
  if (!text.trim()) return "할 일을 적어 주세요.";
  if (text.trim().length > TODO_TEXT_MAX) return `할 일은 ${TODO_TEXT_MAX}자까지 적을 수 있어요.`;
  if (count >= TODOS_MAX) return `카드 하나에 할 일은 ${TODOS_MAX}개까지예요.`;
  return null;
}

// ---------- 카드 나누기 ----------

/**
 * 보직 탭 하나에 보일 카드를 나눈다. duties = 지금 업무분장 목록.
 *  - duties: 업무분장 항목마다 { ...duty, part, task|null }  (task 가 없으면 아직 한 번도 안 연 카드)
 *  - others: 이 보직 카드 중 업무분장 항목이 아닌 것 (예전 카드, 새로 등록한 카드)
 *  - common: "공통" 카드 (모든 보직 탭에 보인다)
 * 한 항목을 두 카드가 가리키면: 내용이 있는 카드 → duty_<key> 문서 → 먼저 만든 카드 순으로 하나를 쓰고
 * 나머지는 others 로 간다. 다만 열어 보기만 해서 비어 있는 duty_<key> 문서는 자리를 못 받으면 늘 숨긴다
 * (예전 카드에 그 항목을 골라 넣었을 때, 목록에서 그 항목을 뺐을 때 빈 카드가 "그 밖의 카드"에 생기지 않게).
 * 자리는 카드에 적힌 part 가 아니라 목록의 보직으로 정한다 (업무를 다른 보직으로 옮기면 카드가 따라간다).
 * tasks 는 createdAt 내림차순(최근 것이 앞)으로 들어온다.
 */
export function groupCards(tasks, part, duties = DUTIES) {
  const byKey = new Map();
  [...tasks].reverse().forEach((t, age) => {
    const duty = findDuty(t.duty, duties);
    if (!duty) return;
    if (!byKey.has(duty.key)) byKey.set(duty.key, []);
    byKey.get(duty.key).push({ t, age });
  });
  const claimed = new Map();
  for (const [key, list] of byKey) {
    const rank = ({ t, age }) => [isBlankDutyDoc(t) ? 1 : 0, t.id === dutyDocId(key) ? 0 : 1, age];
    list.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    });
    claimed.set(key, list[0].t);
  }
  const used = new Set([...claimed.values()].map((t) => t.id));
  const rest = tasks.filter((t) => !used.has(t.id) && !isBlankDutyDoc(t));
  return {
    duties: (duties[part] || []).map((duty) => ({ ...duty, part, task: claimed.get(duty.key) || null })),
    others: rest.filter((t) => findPart(t.part).id === part),
    common: rest.filter((t) => findPart(t.part).id === "common"),
  };
}

/** 열어 보기만 해서 아무것도 안 적힌 duty_<key> 문서인가 */
export function isBlankDutyDoc(t) {
  return (
    !!t?.id?.startsWith("duty_") &&
    !(t.todos?.length) &&
    !(t.attachments?.length) &&
    !(t.summary || "").trim() &&
    !(t.content || "").replace(/<[^>]*>/g, "").trim() &&
    !/<img/i.test(t.content || "")
  );
}

/**
 * 업무분장 항목을 이미 다른 카드가 쓰고 있나 (예전 카드에 항목을 고를 때 겹치지 않게).
 * 비어 있는 duty_<key> 문서만 있는 항목은 비어 있는 것으로 본다.
 */
export function takenDutyKeys(tasks, exceptId, duties = DUTIES) {
  const keys = new Set();
  for (const part of ROLE_PARTS) {
    for (const { key, task } of groupCards(tasks, part, duties).duties) {
      if (task && task.id !== exceptId && !isBlankDutyDoc(task)) keys.add(key);
    }
  }
  return keys;
}

/** 검색어가 카드(제목·요약·본문·첨부 이름·할 일)에 들어 있나 */
export function matchesQuery(task, title, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const plain = (task?.content || "").replace(/<[^>]*>/g, " ");
  const hay = [
    title,
    task?.title,
    task?.summary,
    plain,
    ...(task?.attachments || []).map((a) => a.name),
    ...(task?.todos || []).map((t) => t.text),
  ];
  return hay.some((s) => (s || "").toLowerCase().includes(q));
}

// ---------- 업무분장 고치기 (work_config/duties) ----------

export const DUTIES_PER_PART_MAX = 40; // firestore.rules 의 dutyListOk 와 같게
export const DUTY_TITLE_MAX = 100;
const KEY_RE = /^[a-z0-9-]+$/;

/**
 * work_config/duties 문서의 parts 를 점검해서 쓸 수 있는 목록으로 만든다.
 * 이상한 줄(key · 이름이 없거나 key 가 겹침)은 빼고, 모르는 도구 이름은 버린다. parts 가 아예 없으면 null.
 */
export function normalizeDuties(parts) {
  if (!parts || typeof parts !== "object") return null;
  const seen = new Set();
  const out = {};
  for (const part of ROLE_PARTS) {
    out[part] = [];
    for (const x of Array.isArray(parts[part]) ? parts[part] : []) {
      const key = typeof x?.key === "string" ? x.key : "";
      const title = typeof x?.title === "string" ? x.title.trim() : "";
      if (!KEY_RE.test(key) || !title || seen.has(key)) continue;
      seen.add(key);
      out[part].push(x.tool && TOOLS[x.tool] ? { key, title, tool: x.tool } : { key, title });
    }
  }
  return out;
}

/** 새로 넣는 업무의 key (문서 ID 에 쓸 수 있는 글자만) */
export function newDutyKey() {
  return `x-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 붙여 넣은 글 → 업무 이름 목록. 한 줄에 하나, 앞의 점 · 번호는 떼고 빈 줄 · 같은 이름은 뺀다.
 * (한글 표에서 칸을 여러 개 복사하면 탭이 섞여 들어와서 띄어쓰기로 바꾼다)
 */
export function parsePastedDuties(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const title = line
      .replace(/\t/g, " ")
      .replace(/^[\s•·∙◦○●▪■□◆◇※*\-–—]+/, "")
      .replace(/^\(?\d{1,2}[.)]\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, DUTY_TITLE_MAX);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

const CHANGE_ORDER = { moved: 0, added: 1, renamed: 2, removed: 3, reordered: 4 };

/**
 * 고치기 전 목록과 고친 목록을 비교한다 → 바뀐 것 목록 (저장 전에 확인 창에 보여 준다).
 *  moved {key, title, from, to} · added {key, title, part} · renamed {key, title, oldTitle, part}
 *  removed {key, title, part} · reordered {part} (그 보직에 원래 있던 업무끼리 순서만 바뀜)
 */
export function diffDuties(before, after) {
  const index = (duties) => {
    const m = new Map();
    for (const part of ROLE_PARTS) (duties[part] || []).forEach((x) => m.set(x.key, { ...x, part }));
    return m;
  };
  const prev = index(before);
  const next = index(after);
  const changes = [];
  for (const [key, x] of next) {
    const p = prev.get(key);
    if (!p) {
      changes.push({ type: "added", key, title: x.title, part: x.part });
      continue;
    }
    if (p.part !== x.part) changes.push({ type: "moved", key, title: x.title, from: p.part, to: x.part });
    if (p.title !== x.title) changes.push({ type: "renamed", key, title: x.title, oldTitle: p.title, part: x.part });
  }
  for (const [key, p] of prev) if (!next.has(key)) changes.push({ type: "removed", key, title: p.title, part: p.part });
  for (const part of ROLE_PARTS) {
    const stay = (duties, other) => (duties[part] || []).map((x) => x.key).filter((k) => other.get(k)?.part === part);
    if (stay(before, next).join() !== stay(after, prev).join()) changes.push({ type: "reordered", part });
  }
  return changes.sort((a, b) => CHANGE_ORDER[a.type] - CHANGE_ORDER[b.type]);
}

/**
 * 업무를 다른 보직으로 옮기면 그 카드 문서의 part 도 맞춘다 (?task= 상세 창 · 일정 창의 보직 표시가 맞게).
 * → [{ id, part }]
 */
export function partFixes(tasks, duties) {
  const fixes = [];
  for (const t of tasks) {
    const duty = findDuty(t.duty, duties);
    if (duty && t.part !== duty.part) fixes.push({ id: t.id, part: duty.part });
  }
  return fixes;
}

/** 카드에 적힌 것 한 줄 요약 ("할 일 3 · 매뉴얼 · 서식 1") → 적힌 게 없으면 "" */
export function cardSummary(task) {
  if (!task || isBlankDutyDoc(task)) return "";
  const bits = [];
  if (task.todos?.length) bits.push(`할 일 ${task.todos.length}`);
  if ((task.content || "").replace(/<[^>]*>/g, "").trim() || /<img/i.test(task.content || "")) bits.push("매뉴얼");
  if (task.attachments?.length) bits.push(`서식 ${task.attachments.length}`);
  return bits.join(" · ");
}
