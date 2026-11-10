import { describe, expect, it } from "vitest";
import {
  addPicked,
  availableNumbers,
  clampSize,
  emptyClass,
  hopDelays,
  hopSequence,
  parseClassKey,
  pickNumbers,
  randomInt,
  reelSequence,
  resizeClass,
  restorePicker,
  toggleNumber,
  updateClass,
} from "./picker";

const TODAY = "2026-11-10";

// 정해진 순서대로 값을 내는 가짜 난수 (rand(k) 는 0..k-1)
const seqRand = (values) => {
  let i = 0;
  return (k) => values[i++ % values.length] % k;
};

describe("반·인원", () => {
  it("반 이름 읽기", () => {
    expect(parseClassKey("1-3")).toEqual({ grade: 1, cls: 3 });
    expect(parseClassKey("3-12")).toEqual({ grade: 3, cls: 12 });
    expect(parseClassKey("4-1")).toBeNull();
    expect(parseClassKey("1-13")).toBeNull();
    expect(parseClassKey("1-0")).toBeNull();
    expect(parseClassKey(undefined)).toBeNull();
  });
  it("인원은 1~60, 빈 칸이면 원래 값", () => {
    expect(clampSize("25")).toBe(25);
    expect(clampSize(0)).toBe(1);
    expect(clampSize(99)).toBe(60);
    expect(clampSize("", 30)).toBe(30);
    expect(clampSize("abc", 30)).toBe(30);
    expect(clampSize(27.6)).toBe(28);
  });
  it("인원을 줄이면 큰 번호는 기록에서 빠진다", () => {
    const c = { size: 30, picked: [3, 29], absent: [28, 5], absentDay: TODAY };
    expect(resizeClass(c, 27)).toEqual({ size: 27, picked: [3], absent: [5], absentDay: TODAY });
    expect(resizeClass(c, "").size).toBe(30);
  });
});

describe("뽑을 수 있는 번호", () => {
  const c = { size: 6, picked: [2], absent: [5], absentDay: TODAY };
  it("결석은 빼고, 중복 없이면 뽑힌 번호도 뺀다", () => {
    expect(availableNumbers(c)).toEqual([1, 3, 4, 6]);
    expect(availableNumbers(c, false)).toEqual([1, 2, 3, 4, 6]);
  });
  it("서로 다른 번호를 필요한 만큼 (모자라면 있는 만큼)", () => {
    const got = pickNumbers([1, 3, 4, 6], 3);
    expect(got).toHaveLength(3);
    expect(new Set(got).size).toBe(3);
    got.forEach((n) => expect([1, 3, 4, 6]).toContain(n));
    expect(pickNumbers([7], 4)).toEqual([7]);
    expect(pickNumbers([], 2)).toEqual([]);
  });
  it("모든 번호가 고르게 나온다 (치우침 없음)", () => {
    const counts = new Array(5).fill(0);
    for (let i = 0; i < 5000; i++) counts[pickNumbers([0, 1, 2, 3, 4], 1)[0]]++;
    counts.forEach((c) => expect(c).toBeGreaterThan(800)); // 기대값 1000
  });
  it("randomInt 는 0 ~ k-1", () => {
    for (let i = 0; i < 200; i++) {
      const v = randomInt(3);
      expect(v >= 0 && v < 3 && Number.isInteger(v)).toBe(true);
    }
  });
});

describe("번호판 누르기", () => {
  const c = { size: 10, picked: [4], absent: [], absentDay: "" };
  it("보통 번호 → 결석 (오늘 날짜로)", () => {
    expect(toggleNumber(c, 7, TODAY)).toMatchObject({ absent: [7], absentDay: TODAY });
  });
  it("결석 → 출석", () => {
    expect(toggleNumber({ ...c, absent: [7] }, 7, TODAY).absent).toEqual([]);
  });
  it("뽑힌 번호 → 뽑기 취소", () => {
    expect(toggleNumber(c, 4, TODAY)).toMatchObject({ picked: [], absent: [] });
  });
  it("다시 뽑힌 번호는 기록의 맨 뒤로", () => {
    expect(addPicked({ ...c, picked: [4, 2] }, 4).picked).toEqual([2, 4]);
    expect(addPicked(c, 9).picked).toEqual([4, 9]);
  });
});

describe("저장값 되살리기", () => {
  it("망가졌거나 없으면 기본값", () => {
    expect(restorePicker(null, TODAY)).toMatchObject({ current: "1-1", style: "hop", count: 1, noRepeat: true, sound: true, classes: {} });
    expect(restorePicker("{not json", TODAY).current).toBe("1-1");
  });
  it("모르는 값은 기본값으로, 반 기록은 다듬어서", () => {
    const raw = JSON.stringify({
      current: "2-4",
      style: "slot",
      count: 9,
      noRepeat: false,
      sound: false,
      classes: {
        "2-4": { size: 25, picked: [3, 3, 30, "x", 7], absent: [5], absentDay: TODAY },
        "9-9": { size: 20 },
        "1-1": { size: 500, picked: [1], absent: [2], absentDay: "2026-11-09" },
      },
    });
    const p = restorePicker(raw, TODAY);
    expect(p).toMatchObject({ current: "2-4", style: "slot", count: 1, noRepeat: false, sound: false });
    expect(p.classes["2-4"]).toEqual({ size: 25, picked: [3, 7], absent: [5], absentDay: TODAY });
    expect(p.classes["9-9"]).toBeUndefined();
    // 어제 표시한 결석은 지운다. 뽑힌 기록은 남는다
    expect(p.classes["1-1"]).toEqual({ size: 60, picked: [1], absent: [], absentDay: "" });
  });
  it("한 반만 바꾸기", () => {
    const p = restorePicker(null, TODAY);
    const next = updateClass(p, "1-2", (c) => resizeClass(c, 22));
    expect(next.classes["1-2"]).toEqual({ ...emptyClass(), size: 22 });
    expect(p.classes["1-2"]).toBeUndefined(); // 원래 것은 그대로
  });
});

describe("애니메이션 순서", () => {
  it("번호판 반짝: 점점 느려진다, 첫 번째가 더 길다", () => {
    const first = hopDelays(true);
    const next = hopDelays(false);
    for (let i = 1; i < first.length; i++) expect(first[i]).toBeGreaterThanOrEqual(first[i - 1]);
    const sum = (a) => a.reduce((s, d) => s + d, 0);
    expect(sum(first)).toBeGreaterThan(2000);
    expect(sum(first)).toBeLessThan(3200);
    expect(sum(next)).toBeLessThan(sum(first));
  });
  it("지나가는 번호: 같은 번호 연속 없음, 마지막은 뽑힐 번호가 아님", () => {
    for (let t = 0; t < 50; t++) {
      const seq = hopSequence([1, 2, 3, 4, 5], 3, 18);
      expect(seq).toHaveLength(18);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
      expect(seq.at(-1)).not.toBe(3);
    }
  });
  it("번호가 둘뿐이어도 멈추지 않고, 하나뿐이면 지나갈 곳이 없다", () => {
    const seq = hopSequence([1, 2], 2, 10, seqRand([0, 1, 0, 0, 1]));
    expect(seq).toHaveLength(10);
    expect(seq.at(-1)).toBe(1);
    expect(hopSequence([4], 4, 10)).toEqual([]);
  });
  it("슬롯머신 릴: 마지막이 뽑힐 번호, 같은 번호 연속 없음", () => {
    const reel = reelSequence([1, 2, 3, 4], 2, 24);
    expect(reel).toHaveLength(24);
    expect(reel.at(-1)).toBe(2);
    for (let i = 1; i < reel.length - 1; i++) expect(reel[i]).not.toBe(reel[i - 1]);
    expect(reelSequence([9], 9, 5)).toEqual([9, 9, 9, 9, 9]);
  });
});
