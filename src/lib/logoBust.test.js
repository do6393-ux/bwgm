import { describe, it, expect } from "vitest";
import { LOOKS, STORAGE_KEY, nextLook, lookLabel, readSavedLook, saveLook, headAim } from "./logoBust";

const memoryStorage = (init = {}) => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
};
const brokenStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};

describe("조각 모양 순서", () => {
  it("9가지이고 흰색으로 시작해 연한 핑크로 끝난다", () => {
    expect(LOOKS).toHaveLength(9);
    expect(LOOKS[0].id).toBe("white");
    expect(LOOKS.at(-1).id).toBe("pink");
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(9);
  });

  it("누르면 다음 모양, 마지막 다음은 처음", () => {
    expect(nextLook("white")).toBe("marble");
    expect(nextLook("orange")).toBe("pink");
    expect(nextLook("pink")).toBe("white");
  });

  it("모르는 모양에서 누르면 처음 모양", () => {
    expect(nextLook("verde")).toBe("white");
    expect(nextLook(undefined)).toBe("white");
  });

  it("이름과 순서를 붙여 보여 준다", () => {
    expect(lookLabel("gold")).toBe("금 · 5/9");
    expect(lookLabel("white")).toBe("흰색 · 1/9");
  });

  it("9번을 누르면 한 바퀴 돌아 제자리", () => {
    let id = "bronze";
    for (let i = 0; i < LOOKS.length; i++) id = nextLook(id);
    expect(id).toBe("bronze");
  });
});

describe("고른 모양 기억", () => {
  it("기억한 모양을 읽는다", () => {
    expect(readSavedLook(memoryStorage({ [STORAGE_KEY]: "gold" }))).toBe("gold");
  });

  it("없거나 예전 모양(녹색 대리석 등)이면 흰색", () => {
    expect(readSavedLook(memoryStorage())).toBe("white");
    expect(readSavedLook(memoryStorage({ [STORAGE_KEY]: "verde" }))).toBe("white");
  });

  it("저장소를 못 쓰는 브라우저에서도 멈추지 않는다", () => {
    expect(readSavedLook(brokenStorage)).toBe("white");
    expect(() => saveLook("gold", brokenStorage)).not.toThrow();
    expect(readSavedLook(null)).toBe("white");
  });

  it("저장한 모양을 다시 읽으면 그대로", () => {
    const s = memoryStorage();
    saveLook("pink", s);
    expect(s.data[STORAGE_KEY]).toBe("pink");
    expect(readSavedLook(s)).toBe("pink");
  });
});

describe("마우스 쪽으로 고개 돌리기", () => {
  const rect = { left: 100, top: 0, width: 200, height: 200 }; // 가운데 x=200, 눈높이 y=84
  const deg = (r) => (r * 180) / Math.PI;

  it("마우스가 창 밖이면 정면", () => {
    expect(headAim(null, rect)).toEqual({ yaw: 0, pitch: 0 });
  });

  it("눈앞에 있으면 정면", () => {
    const a = headAim({ x: 200, y: 84 }, rect);
    expect(a.yaw).toBeCloseTo(0);
    expect(a.pitch).toBeCloseTo(0);
  });

  it("오른쪽 아래에 있으면 오른쪽으로 돌고 고개를 숙인다", () => {
    const a = headAim({ x: 400, y: 200 }, rect);
    expect(a.yaw).toBeGreaterThan(0);
    expect(a.pitch).toBeGreaterThan(0);
  });

  it("왼쪽 위면 왼쪽으로 돌고 고개를 든다", () => {
    const a = headAim({ x: 0, y: 0 }, rect);
    expect(a.yaw).toBeLessThan(0);
    expect(a.pitch).toBeLessThan(0);
  });

  it("아주 멀어도 정해 둔 각도까지만 돈다", () => {
    const far = headAim({ x: 99999, y: 99999 }, rect);
    expect(deg(far.yaw)).toBeCloseTo(30);
    expect(deg(far.pitch)).toBeCloseTo(18);
    const up = headAim({ x: -99999, y: -99999 }, rect);
    expect(deg(up.yaw)).toBeCloseTo(-30);
    expect(deg(up.pitch)).toBeCloseTo(-14);
  });
});
