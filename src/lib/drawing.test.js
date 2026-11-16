import { describe, expect, it } from "vitest";
import {
  DRAW_BG,
  DRAW_H,
  DRAW_W,
  ERASER,
  ERASER_WIDTH,
  PEN_COLORS,
  PEN_WIDTHS,
  addPoint,
  encodeDrawing,
  hasInk,
  parseDrawing,
  strokeColor,
  strokePath,
  strokeWidth,
  toDrawPoint,
} from "./drawing";

describe("그림 좌표", () => {
  const rect = { left: 100, top: 50, width: 800, height: 450 };

  it("toDrawPoint: 화면 좌표를 1600×900 으로", () => {
    expect(toDrawPoint(100, 50, rect)).toEqual([0, 0]);
    expect(toDrawPoint(500, 275, rect)).toEqual([800, 450]);
    expect(toDrawPoint(900, 500, rect)).toEqual([DRAW_W, DRAW_H]);
  });

  it("toDrawPoint: 칸 밖은 가장자리로", () => {
    expect(toDrawPoint(0, 0, rect)).toEqual([0, 0]);
    expect(toDrawPoint(2000, 2000, rect)).toEqual([DRAW_W, DRAW_H]);
  });

  it("addPoint: 너무 가까운 점은 더하지 않는다", () => {
    const p = [10, 10];
    expect(addPoint(p, 11, 12)).toBe(p);
    expect(addPoint(p, 20, 10)).toEqual([10, 10, 20, 10]);
    expect(addPoint([], 5, 5)).toEqual([5, 5]);
  });
});

describe("그리기", () => {
  it("strokePath: 점 하나는 동그란 점, 두 점은 직선, 여러 점은 곡선", () => {
    expect(strokePath([5, 6])).toBe("M5 6L5 6");
    expect(strokePath([0, 0, 10, 10])).toBe("M0 0L10 10");
    const d = strokePath([0, 0, 10, 0, 20, 10, 30, 10]);
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d).toContain("Q10 0 15 5");
    expect(d.endsWith("L30 10")).toBe(true);
    expect(strokePath([])).toBe("");
  });

  it("색·굵기: 지우개는 바탕색으로 굵게", () => {
    expect(strokeColor(1)).toBe(PEN_COLORS[1].hex);
    expect(strokeColor(ERASER)).toBe(DRAW_BG);
    expect(strokeColor(99)).toBe(PEN_COLORS[0].hex);
    expect(strokeWidth({ c: 0, w: 1 })).toBe(PEN_WIDTHS[1].px);
    expect(strokeWidth({ c: ERASER, w: 0 })).toBe(ERASER_WIDTH);
  });
});

describe("저장·읽기", () => {
  const strokes = [
    { c: 1, w: 0, p: [10, 20, 30, 40] },
    { c: ERASER, w: 0, p: [15, 25] },
  ];

  it("encode → parse 하면 같은 그림", () => {
    expect(parseDrawing(encodeDrawing(strokes))).toEqual(strokes);
  });

  it("그린 것이 없으면 빈 문자열 / null", () => {
    expect(encodeDrawing([])).toBe("");
    expect(encodeDrawing([{ c: ERASER, w: 0, p: [1, 1] }])).toBe("");
    expect(hasInk(null)).toBe(false);
    expect(parseDrawing("")).toBe(null);
    expect(parseDrawing("이상한 글")).toBe(null);
    expect(parseDrawing("{}")).toBe(null);
  });

  it("parseDrawing: 이상한 획은 버리고 좌표는 칸 안으로", () => {
    const text = JSON.stringify([
      { c: 7, w: 0, p: [1, 1] }, // 없는 색
      { c: 2, w: 9, p: [-5, 2000, 3.6, "x", 4] }, // 굵기 이상 → 0, 좌표 다듬기, 짝이 안 맞는 끝은 버림
      { c: 0, w: 0, p: [] }, // 점 없음
      null,
    ]);
    expect(parseDrawing(text)).toEqual([{ c: 2, w: 0, p: [0, DRAW_H] }]);
  });
});
