import { describe, expect, it } from "vitest";
import { DEFAULT_PART, PARTS, findPart } from "./workParts";

describe("workParts", () => {
  it("파트 id 는 서로 겹치지 않고, 기본 파트는 목록 안에 있다", () => {
    const ids = PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_PART);
  });

  it("달력 색(bar, dot)이 파트마다 있다", () => {
    for (const p of PARTS) {
      expect(p.bar).toMatch(/^bg-/);
      expect(p.dot).toMatch(/^bg-/);
    }
  });

  it("id 로 파트를 찾는다", () => {
    expect(findPart("nais").label).toBe("나이스·정보공시");
  });

  it("비어 있거나 모르는 값은 공통으로 본다", () => {
    expect(findPart(undefined).id).toBe(DEFAULT_PART);
    expect(findPart("").id).toBe(DEFAULT_PART);
    expect(findPart("devices").id).toBe(DEFAULT_PART); // 예전 분류 값
  });
});
