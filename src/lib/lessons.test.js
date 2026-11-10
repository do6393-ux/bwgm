import { describe, expect, it } from "vitest";
import {
  filterLessons,
  highlightParts,
  htmlToText,
  makeSnippet,
  matchLesson,
  recentLessons,
  searchLessons,
  searchTerms,
  titleMatches,
  unitLabel,
} from "./lessons";

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

describe("htmlToText", () => {
  it("태그·그림은 빼고 글자만, 띄어쓰기는 하나로", () => {
    expect(htmlToText('<h2>학습 목표</h2><p>함수를 <strong>정의</strong>할 수 있다.</p><p><img src="data:image/png;base64,AAAA"></p><p>끝</p>')).toBe(
      "학습 목표 함수를 정의할 수 있다. 끝"
    );
  });
  it("글자 꾸밈 태그는 단어를 끊지 않는다", () => {
    expect(htmlToText("<p><b>디</b>버깅</p>")).toBe("디버깅");
    expect(htmlToText("<p>줄1<br>줄2</p>")).toBe("줄1 줄2");
  });
  it("&nbsp; &lt; &amp; 같은 기호를 글자로", () => {
    expect(htmlToText("<p>a&nbsp;&lt;&nbsp;b &amp;&amp; c &#65;&#x42;</p>")).toBe("a < b && c AB");
    expect(htmlToText("&amp;lt;")).toBe("&lt;");
  });
  it("빈 본문", () => {
    expect(htmlToText(undefined)).toBe("");
  });
});

describe("makeSnippet", () => {
  const text = "함수의 개념과 장점을 설명할 수 있다. 오류의 유형을 구분하고 디버깅 과정을 설명할 수 있다. 함수 프로그램에서 특정 기능";
  it("찾은 단어 앞뒤를 띄어쓰기에 맞춰 자른다", () => {
    const s = makeSnippet(text, ["디버깅"], { before: 12, after: 12 });
    expect(s).toBe("…유형을 구분하고 디버깅 과정을 설명할…");
  });
  it("처음부터 끝까지 들어가면 … 을 붙이지 않는다", () => {
    expect(makeSnippet("짧은 디버깅 글", ["디버깅"])).toBe("짧은 디버깅 글");
  });
  it("여러 단어 중 가장 먼저 나온 곳 기준", () => {
    expect(makeSnippet("가나 다라 마바", ["마바", "가나"], { before: 0, after: 2 })).toBe("가나…");
  });
});

describe("내용 검색", () => {
  const withBody = [
    { id: "t", title: "함수와 디버깅", summary: "함수를 배운다", content: "<p>디버깅 과정</p>", unit: "unit3" },
    { id: "s", title: "3단원 핵심 정리", summary: "", content: "<p>매개 변수</p><p><b>디버깅</b> : 오류를 찾아 수정. 디버깅 끝</p>", unit: "unit3" },
    { id: "p", title: "문제 해결과 프로그래밍", summary: "실행 및 디버깅을 설명", content: "<p>프로그래밍</p>", unit: "unit3" },
    { id: "h", title: "숨긴 자료", content: "<p>디버깅</p>", unit: "unit3", isVisible: false },
    { id: "x", title: "학습 데이터", content: "<p>데이터 수집</p>", unit: "unit4" },
  ];
  it("제목에서 찾은 자료가 먼저, 내용에서만 찾은 자료가 뒤에", () => {
    expect(searchLessons(withBody, { query: "디버깅" }).map((r) => [r.lesson.id, r.match.where])).toEqual([
      ["t", "title"],
      ["s", "content"],
      ["p", "content"],
    ]);
  });
  it("내용 결과에는 나온 횟수와 찾은 부분이 있다 (요약도 내용으로 본다)", () => {
    const s = matchLesson(withBody[1], ["디버깅"]);
    expect(s.hits).toBe(2);
    expect(s.snippet).toContain("디버깅 : 오류를 찾아 수정");
    expect(matchLesson(withBody[2], ["디버깅"])).toMatchObject({ where: "content", hits: 1 });
  });
  it("여러 단어는 제목·내용을 합쳐 모두 있어야 한다", () => {
    expect(matchLesson(withBody[0], ["함수", "과정"])).toMatchObject({ where: "content" });
    expect(matchLesson(withBody[0], ["함수", "알고리즘"])).toBeNull();
  });
  it("비공개 자료는 교사에게만", () => {
    expect(searchLessons(withBody, { query: "디버깅", showHidden: true }).map((r) => r.lesson.id)).toContain("h");
  });
  it("검색어가 없으면 순서 그대로", () => {
    expect(searchLessons(withBody).map((r) => r.lesson.id)).toEqual(["t", "s", "p", "x"]);
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
