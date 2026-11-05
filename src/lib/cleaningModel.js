import { encodeGrid, decodeGrid } from "./gridCodec";

// 청소구역 표의 데이터와 편집 규칙 (화면과 분리해 두어 테스트하기 쉽게 한다).
//
// 모양: { areas: ["교실 쓸기 - 창", ...], grid: [[학생|null × 조 수] × 구역 수] }
//  - areas[r] 는 grid[r] 줄의 이름이고, 이름은 제자리에 있다. 사람이 옮기는 것은 "그 줄의 배정"이다.
//  - 조 이름은 따로 두지 않고 번호(01조, 02조…)로만 보여 준다.
//  - 예전에는 표(grid)만 저장했고 구역 이름은 코드에 고정돼 있었다. 그 모양도 읽을 수 있어야 한다.

export const DEFAULT_AREAS = [
  "교실 쓸기 - 창", "교실 쓸기 - 중앙", "교실 쓸기 - 복도",
  "컴퓨터실 - 창문쪽", "컴퓨터실 - 복도쪽", "교탁 및 칠판",
];
export const DEFAULT_GROUPS = 5;
export const MAX_AREAS = 20;
export const MAX_GROUPS = 10;
export const MAX_AREA_NAME = 30;

const blankRow = (n) => Array(n).fill(null);

/** 학생 칸은 { num, name } 만 남긴다 (undefined 는 Firestore 가 거부하므로 null 로) */
function cleanCell(cell) {
  return cell && typeof cell === "object" && cell.num != null ? { num: cell.num, name: cell.name ?? "" } : null;
}

export function emptyCleaning(areas = DEFAULT_AREAS, groups = DEFAULT_GROUPS) {
  return { areas: [...areas], grid: areas.map(() => blankRow(groups)) };
}

/** 조 수 */
export function groupCount(c) {
  return c.grid[0]?.length ?? DEFAULT_GROUPS;
}

/**
 * 저장돼 있던 값(없음 / 예전 표 / 새 모양 / 이상한 값)을 항상 줄·칸 수가 맞는 새 모양으로 바꾼다.
 * 구역 이름이 모자라면 "구역 N" 으로 채우고, 줄이 더 많으면 줄을 버리지 않고 이름을 만들어 붙인다.
 */
export function normalizeCleaning(raw) {
  let names = null;
  let grid = null;
  if (Array.isArray(raw)) {
    grid = raw;
  } else if (raw && typeof raw === "object") {
    if (Array.isArray(raw.grid)) grid = raw.grid;
    if (Array.isArray(raw.areas)) names = raw.areas;
  }
  if (!grid && !names) return emptyCleaning();

  const rows = (grid ?? []).map((row) => (Array.isArray(row) ? row : []));
  const labels = (names ?? DEFAULT_AREAS).map((n) => (typeof n === "string" && n.trim() ? n.trim().slice(0, MAX_AREA_NAME) : null));
  const rowCount = Math.max(rows.length, labels.length);
  if (rowCount === 0) return emptyCleaning();
  const groups = Math.max(0, ...rows.map((r) => r.length)) || DEFAULT_GROUPS;

  return {
    areas: Array.from({ length: rowCount }, (_, i) => labels[i] ?? `구역 ${i + 1}`),
    grid: Array.from({ length: rowCount }, (_, r) => Array.from({ length: groups }, (_, c) => cleanCell(rows[r]?.[c]))),
  };
}

/**
 * from 줄의 배정(모든 조)을 to 줄로 옮긴다. 사이에 있던 줄은 지워지지 않고 한 칸씩 밀린다.
 * 구역 이름은 그대로다. 예) 줄 내용이 [A, B, C] 일 때
 *   0→1: [B, A, C]    0→2: [B, C, A] (맨 위를 맨 아래로 = 전체가 한 칸씩 위로 회전)    2→0: [C, A, B]
 */
export function moveAssignments(c, from, to) {
  const n = c.grid.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return c;
  const grid = [...c.grid];
  const [row] = grid.splice(from, 1);
  grid.splice(to, 0, row);
  return { ...c, grid };
}

export function addArea(c, name) {
  if (c.areas.length >= MAX_AREAS) return c;
  const label = String(name ?? "").trim().slice(0, MAX_AREA_NAME) || `구역 ${c.areas.length + 1}`;
  return { areas: [...c.areas, label], grid: [...c.grid, blankRow(groupCount(c))] };
}

export function removeArea(c, r) {
  if (c.areas.length <= 1 || r < 0 || r >= c.areas.length) return c;
  return { areas: c.areas.filter((_, i) => i !== r), grid: c.grid.filter((_, i) => i !== r) };
}

/** 이름이 비어 있으면 바꾸지 않는다 */
export function renameArea(c, r, name) {
  const label = String(name ?? "").trim().slice(0, MAX_AREA_NAME);
  if (!label || r < 0 || r >= c.areas.length) return c;
  return { ...c, areas: c.areas.map((a, i) => (i === r ? label : a)) };
}

/** 맨 뒤에 새 조를 붙인다 */
export function addGroup(c) {
  if (groupCount(c) >= MAX_GROUPS) return c;
  return { ...c, grid: c.grid.map((row) => [...row, null]) };
}

/** col 번째 조를 지운다 (뒤의 조는 번호가 하나씩 당겨진다) */
export function removeGroup(c, col) {
  if (groupCount(c) <= 1 || col < 0 || col >= groupCount(c)) return c;
  return { ...c, grid: c.grid.map((row) => row.filter((_, i) => i !== col)) };
}

/** 배정된 학생 수 — row / col 을 주면 그 줄 / 그 조만 센다 */
export function countAssigned(c, { row, col } = {}) {
  let n = 0;
  c.grid.forEach((cells, r) => cells.forEach((cell, k) => {
    if (cell && (row == null || row === r) && (col == null || col === k)) n++;
  }));
  return n;
}

/** 화면 모양 → Firestore 문서 필드 (표는 한 겹 풀어서: gridCodec 참고) */
export function toCleaningDoc(c) {
  return { areas: c.areas, grid: encodeGrid(c.grid) };
}

/** Firestore 문서(또는 예전 문서) → 화면 모양. 표가 없으면 null */
export function fromCleaningDoc(data) {
  const grid = decodeGrid(data?.grid);
  return grid ? normalizeCleaning({ areas: data.areas, grid }) : null;
}
