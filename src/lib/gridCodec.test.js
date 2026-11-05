import { describe, expect, it } from "vitest";
import { decodeGrid, decodePairs, encodeGrid, encodePairs, fromSeatingDoc, toSeatingDoc } from "./gridCodec";

// Firestore 가 거부하는 모양(배열 안의 배열) 이 있는지 찾는다 — 진짜 SDK 의 규칙과 같다
function findNestedArray(v, path = "") {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (Array.isArray(v[i])) return `${path}[${i}]`;
      const hit = findNestedArray(v[i], `${path}[${i}]`);
      if (hit) return hit;
    }
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      const hit = findNestedArray(x, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

const seat = (num) => (num ? { student: { num, name: `학생${num}` }, isLocked: false, isDisabled: false } : { student: null, isLocked: false, isDisabled: false });
const grid = [[seat(1), seat(2), seat(0)], [seat(3), seat(0), seat(4)]];

describe("서버(Firestore)에 올릴 수 있는 모양", () => {
  it("2차원 자리 표를 그대로 올리면 거부되는 모양이다 (이게 예전 버그의 원인)", () => {
    expect(findNestedArray({ grid })).toBe("grid[0]");
  });

  it("자리배치 문서는 풀어서 올리므로 배열 안의 배열이 없다", () => {
    const doc = toSeatingDoc({ userId: "u", rows: 2, cols: 3, grid, avoidPairs: [[1, 2], [3, 4]], excluded: [5], updatedAt: "t" });
    expect(findNestedArray(doc)).toBeNull();
    expect(doc.grid).toHaveLength(2);
    expect(doc.avoidPairs).toEqual([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  });

  it("청소구역처럼 칸이 null 인 표도 풀어서 올릴 수 있다", () => {
    const cleaning = [[{ num: 1, name: "가" }, null], [null, null]];
    expect(findNestedArray({ grid: cleaning })).toBe("grid[0]");
    expect(findNestedArray({ grid: encodeGrid(cleaning) })).toBeNull();
  });
});

describe("올렸다가 다시 읽으면 원래대로", () => {
  it("표", () => {
    expect(decodeGrid(encodeGrid(grid))).toEqual(grid);
  });

  it("null 칸이 있는 표", () => {
    const cleaning = [[{ num: 1, name: "가" }, null], [null, { num: 2, name: "나" }]];
    expect(decodeGrid(encodeGrid(cleaning))).toEqual(cleaning);
  });

  it("기피 짝", () => {
    expect(decodePairs(encodePairs([[1, 2], [3, 4]]))).toEqual([[1, 2], [3, 4]]);
  });

  it("자리배치 문서 전체", () => {
    const data = { userId: "u", grade: 1, classNum: 7, rows: 2, cols: 3, grid, avoidPairs: [[1, 2]], excluded: [5], updatedAt: "2026-11-05T00:00:00.000Z" };
    expect(fromSeatingDoc(toSeatingDoc(data))).toEqual(data);
  });
});

describe("예전 모양·이상한 값도 안전하게 읽는다", () => {
  it("2차원 배열 그대로 저장돼 있던 예전 모양도 읽는다", () => {
    expect(decodeGrid(grid)).toEqual(grid);
    expect(decodePairs([[1, 2]])).toEqual([[1, 2]]);
  });

  it("표가 없거나 알 수 없는 모양이면 null, 짝은 빈 목록", () => {
    expect(decodeGrid(undefined)).toBeNull();
    expect(decodeGrid({ 0: "x" })).toBeNull();
    expect(decodePairs(undefined)).toEqual([]);
  });

  it("값이 빠진 기피 짝은 버린다", () => {
    expect(decodePairs([{ a: 1 }, { a: 2, b: 3 }])).toEqual([[2, 3]]);
  });

  it("표가 아닌 값을 encodeGrid 에 줘도 그대로 돌려준다", () => {
    expect(encodeGrid(undefined)).toBeUndefined();
  });
});
