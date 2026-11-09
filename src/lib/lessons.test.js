import { describe, expect, it } from "vitest";
import { filterLessons, highlightParts, recentLessons, searchTerms, titleMatches, unitLabel } from "./lessons";

const lessons = [
  { id: "a", title: "인공지능의 윤리적 문제", unit: "unit4" },
  { id: "b", title: "인공지능 시스템", unit: "unit4", isVisible: false },
  { id: "c", title: "알고리즘 표현과 분석", unit: "unit3" },
  { id: "d", title: "Python 기초", unit: "unit3" },
];

describe("검색어", () => {
  it("띄어쓰기로 단어를 나누고 소문자로", () => {
    expect(searchTerms("  인공지능   윤리 ")).toEqual(["인공지능", "윤리"]);
    expect(searchTerms("")).toEqual([]);
  });
  it("모든 단어가 제목에 있어야 한다 (순서·붙어 있음은 상관없음)", () => {
    expect(titleMatches("인공지능의 윤리적 문제", ["윤리", "인공지능"])).toBe(true);
    expect(titleMatches("인공지능 시스템", ["인공지능", "윤리"])).toBe(false);
    expect(titleMatches("Python 기초", ["python"])).toBe(true);
  });
});

describe("filterLessons", () => {
  it("검색어 + 단원", () => {
    expect(filterLessons(lessons, { query: "인공지능" }).map((l) => l.id)).toEqual(["a"]);
    expect(filterLessons(lessons, { query: "인공지능", showHidden: true }).map((l) => l.id)).toEqual(["a", "b"]);
    expect(filterLessons(lessons, { unit: "unit3", query: "기초" }).map((l) => l.id)).toEqual(["d"]);
    expect(filterLessons(lessons, { unit: "unit4", query: "기초" })).toEqual([]);
  });
  it("검색어가 없으면 단원만", () => {
    expect(filterLessons(lessons, { unit: "unit3" }).map((l) => l.id)).toEqual(["c", "d"]);
    expect(filterLessons(lessons).map((l) => l.id)).toEqual(["a", "c", "d"]);
  });
});

describe("highlightParts", () => {
  it("검색어가 들어간 부분을 나눈다", () => {
    expect(highlightParts("인공지능의 윤리적 문제", ["윤리"])).toEqual([
      { text: "인공지능의 ", hit: false },
      { text: "윤리", hit: true },
      { text: "적 문제", hit: false },
    ]);
    expect(highlightParts("Python 기초", ["python"])).toEqual([
      { text: "Python", hit: true },
      { text: " 기초", hit: false },
    ]);
    expect(highlightParts("제목", [])).toEqual([{ text: "제목", hit: false }]);
  });
});

describe("recentLessons / unitLabel", () => {
  it("공개된 최근 자료", () => {
    expect(recentLessons(lessons, 2).map((l) => l.id)).toEqual(["a", "c"]);
  });
  it("단원 이름", () => {
    expect(unitLabel("unit3")).toBe("3단원 알고리즘");
    expect(unitLabel("x")).toBe("");
  });
});
