import { describe, expect, it } from "vitest";
import {
  DEFAULT_AREAS, DEFAULT_GROUPS, MAX_AREAS, MAX_GROUPS,
  addArea, addGroup, countAssigned, emptyCleaning, fromCleaningDoc, groupCount,
  moveAssignments, normalizeCleaning, removeArea, removeGroup, renameArea, toCleaningDoc,
} from "./cleaningModel";

const s = (num) => ({ num, name: `학생${num}` });
// 줄마다 첫 칸에 학생을 하나씩 두어 어느 줄이 어디로 갔는지 알아보기 쉽게 한다
function sample(n = 3, groups = 2) {
  const c = emptyCleaning(Array.from({ length: n }, (_, i) => `구역${i + 1}`), groups);
  c.grid.forEach((row, r) => { row[0] = s(r + 1); });
  return c;
}
const firsts = (c) => c.grid.map((row) => row[0]?.num ?? null);

function hasNestedArray(v) {
  if (Array.isArray(v)) return v.some((x) => Array.isArray(x) || hasNestedArray(x));
  if (v && typeof v === "object") return Object.values(v).some(hasNestedArray);
  return false;
}
function hasUndefined(v) {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(hasUndefined);
  if (v && typeof v === "object") return Object.values(v).some(hasUndefined);
  return false;
}

describe("기본값", () => {
  it("기본은 6구역 × 5조, 모두 비어 있다", () => {
    const c = emptyCleaning();
    expect(c.areas).toEqual(DEFAULT_AREAS);
    expect(c.grid).toHaveLength(6);
    expect(groupCount(c)).toBe(DEFAULT_GROUPS);
    expect(countAssigned(c)).toBe(0);
  });
});

describe("배정 옮기기 (끌어다 놓기)", () => {
  it("아래 줄에 놓으면 그 줄이 한 칸 위로 밀린다 (0→1: [A,B,C] → [B,A,C])", () => {
    expect(firsts(moveAssignments(sample(), 0, 1))).toEqual([2, 1, 3]);
  });

  it("맨 위를 맨 아래에 놓으면 나머지가 모두 한 칸씩 위로 (회전), 아무것도 사라지지 않는다", () => {
    const moved = moveAssignments(sample(), 0, 2);
    expect(firsts(moved)).toEqual([2, 3, 1]);
    expect(countAssigned(moved)).toBe(3);
  });

  it("위쪽으로 옮기면 사이의 줄이 한 칸씩 아래로 밀린다 (2→0)", () => {
    expect(firsts(moveAssignments(sample(), 2, 0))).toEqual([3, 1, 2]);
  });

  it("줄 전체(모든 조)가 함께 움직인다", () => {
    const c = sample(3, 3);
    c.grid[0][1] = s(11); c.grid[0][2] = s(12);
    const moved = moveAssignments(c, 0, 2);
    expect(moved.grid[2]).toEqual([s(1), s(11), s(12)]);
  });

  it("구역 이름은 제자리에 있고, 원본은 바뀌지 않는다", () => {
    const c = sample();
    const moved = moveAssignments(c, 0, 2);
    expect(moved.areas).toEqual(["구역1", "구역2", "구역3"]);
    expect(firsts(c)).toEqual([1, 2, 3]);
  });

  it("같은 자리이거나 범위 밖이면 그대로", () => {
    const c = sample();
    expect(moveAssignments(c, 1, 1)).toBe(c);
    expect(moveAssignments(c, -1, 1)).toBe(c);
    expect(moveAssignments(c, 0, 3)).toBe(c);
  });
});

describe("구역 추가·삭제·이름 바꾸기", () => {
  it("추가하면 맨 아래에 빈 줄이 생기고, 조 수는 그대로", () => {
    const c = addArea(sample(3, 4), "급식실");
    expect(c.areas).toEqual(["구역1", "구역2", "구역3", "급식실"]);
    expect(c.grid[3]).toEqual([null, null, null, null]);
  });

  it("이름을 비워 두면 '구역 N' 으로", () => {
    expect(addArea(sample(), "  ").areas[3]).toBe("구역 4");
  });

  it("삭제하면 그 줄의 배정도 함께 사라지고 나머지는 그대로", () => {
    const c = removeArea(sample(), 1);
    expect(c.areas).toEqual(["구역1", "구역3"]);
    expect(firsts(c)).toEqual([1, 3]);
  });

  it("마지막 하나는 지우지 못한다", () => {
    const one = emptyCleaning(["하나"], 2);
    expect(removeArea(one, 0)).toBe(one);
  });

  it("이름 바꾸기: 앞뒤 공백은 지우고, 빈 이름은 무시한다", () => {
    const c = sample();
    expect(renameArea(c, 0, "  칠판  ").areas[0]).toBe("칠판");
    expect(renameArea(c, 0, "   ")).toBe(c);
    expect(renameArea(c, 9, "x")).toBe(c);
  });

  it("개수 상한", () => {
    let c = emptyCleaning(["a"], 1);
    for (let i = 0; i < MAX_AREAS + 5; i++) c = addArea(c, `n${i}`);
    expect(c.areas).toHaveLength(MAX_AREAS);
  });
});

describe("조 추가·삭제", () => {
  it("추가하면 모든 줄 끝에 빈 칸이 생긴다", () => {
    const c = addGroup(sample(3, 2));
    expect(groupCount(c)).toBe(3);
    expect(c.grid.every((row) => row.length === 3 && row[2] === null)).toBe(true);
  });

  it("삭제하면 그 조의 학생이 빠지고 뒤의 조가 당겨진다", () => {
    const c = sample(2, 3);
    c.grid[0][1] = s(21); c.grid[0][2] = s(22); c.grid[1][1] = s(23);
    const cut = removeGroup(c, 1);
    expect(cut.grid[0]).toEqual([s(1), s(22)]);
    expect(cut.grid[1]).toEqual([s(2), null]);
    expect(countAssigned(cut)).toBe(3);
  });

  it("마지막 하나는 지우지 못하고, 개수 상한이 있다", () => {
    const one = emptyCleaning(["a"], 1);
    expect(removeGroup(one, 0)).toBe(one);
    let c = emptyCleaning(["a"], 1);
    for (let i = 0; i < MAX_GROUPS + 5; i++) c = addGroup(c);
    expect(groupCount(c)).toBe(MAX_GROUPS);
  });
});

describe("배정 수 세기", () => {
  it("전체 / 줄 / 조 별로 센다 (지우기 전에 안내하는 데 쓴다)", () => {
    const c = sample(3, 2);
    c.grid[0][1] = s(9);
    expect(countAssigned(c)).toBe(4);
    expect(countAssigned(c, { row: 0 })).toBe(2);
    expect(countAssigned(c, { col: 1 })).toBe(1);
  });
});

describe("저장된 값 읽기 (예전 모양 포함)", () => {
  it("아무것도 없으면 기본값", () => {
    expect(normalizeCleaning(null)).toEqual(emptyCleaning());
    expect(normalizeCleaning(undefined)).toEqual(emptyCleaning());
    expect(normalizeCleaning("이상한 값")).toEqual(emptyCleaning());
  });

  it("예전 모양(표만 저장)은 기본 구역 이름을 붙이고 배정을 그대로 살린다", () => {
    const legacy = Array.from({ length: 6 }, () => Array(5).fill(null));
    legacy[2][4] = s(7);
    const c = normalizeCleaning(legacy);
    expect(c.areas).toEqual(DEFAULT_AREAS);
    expect(c.grid[2][4]).toEqual(s(7));
  });

  it("새 모양은 그대로", () => {
    const c = sample(4, 3);
    expect(normalizeCleaning(c)).toEqual(c);
  });

  it("줄·칸 수가 어긋나면 맞춘다 (이름이 모자라면 '구역 N')", () => {
    const c = normalizeCleaning({ areas: ["가"], grid: [[s(1)], [s(2), s(3)], []] });
    expect(c.areas).toEqual(["가", "구역 2", "구역 3"]);
    expect(c.grid.every((row) => row.length === 2)).toBe(true);
    expect(c.grid[2]).toEqual([null, null]);
  });

  it("표 없이 이름만 있으면 빈 표를 만든다", () => {
    const c = normalizeCleaning({ areas: ["가", "나"] });
    expect(c.grid).toEqual([Array(DEFAULT_GROUPS).fill(null), Array(DEFAULT_GROUPS).fill(null)]);
  });

  it("undefined 나 이상한 칸은 null 로 (Firestore 는 undefined 를 거부)", () => {
    const c = normalizeCleaning({ areas: ["가"], grid: [[undefined, "x", { name: "번호 없음" }, s(1)]] });
    expect(c.grid[0]).toEqual([null, null, null, s(1)]);
    expect(hasUndefined(c)).toBe(false);
  });
});

describe("서버(Firestore) 문서 변환", () => {
  it("배열 안의 배열이 없고 undefined 도 없다", () => {
    const doc = toCleaningDoc(sample(3, 2));
    expect(hasNestedArray(doc)).toBe(false);
    expect(hasUndefined(doc)).toBe(false);
  });

  it("올렸다가 다시 읽으면 원래대로", () => {
    let c = sample(4, 3);
    c = renameArea(c, 1, "급식실");
    c = moveAssignments(c, 0, 3);
    expect(fromCleaningDoc(toCleaningDoc(c))).toEqual(c);
  });

  it("예전 문서(구역 이름 없이 grid 만)도 읽는다", () => {
    const legacy = { grid: Array.from({ length: 6 }, (_, r) => ({ cells: Array.from({ length: 5 }, (_, k) => (r === 0 && k === 0 ? s(5) : null)) })) };
    const c = fromCleaningDoc(legacy);
    expect(c.areas).toEqual(DEFAULT_AREAS);
    expect(c.grid[0][0]).toEqual(s(5));
  });

  it("표가 없는 문서는 null (불러오기가 이 기기 사본으로 넘어가도록)", () => {
    expect(fromCleaningDoc({})).toBeNull();
    expect(fromCleaningDoc(undefined)).toBeNull();
  });
});
