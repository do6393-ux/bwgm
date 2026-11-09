import { describe, expect, it } from "vitest";
import {
  buildClassGrid,
  classRange,
  cumulativeTable,
  dueInfo,
  isLate,
  maskName,
  missingText,
  normalizeClassSettings,
  openHomework,
  parseStudentNum,
  sortSubmissions,
  targetClasses,
  toCsv,
  validateSubmission,
} from "./homework";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("학번·이름", () => {
  it("5자리 학번을 학년·반·번호로 나눈다", () => {
    expect(parseStudentNum("10307")).toEqual({ grade: 1, cls: 3, num: 7, classId: "1-3" });
    expect(parseStudentNum(" 2 1 2 1 5 ")).toEqual({ grade: 2, cls: 12, num: 15, classId: "2-12" });
    expect(parseStudentNum("１０３０７")?.classId).toBe("1-3"); // 전각 숫자
    for (const bad of ["1037", "103070", "00307", "10007", "10300", "abcde", ""]) expect(parseStudentNum(bad)).toBeNull();
  });

  it("이름 가운데를 가린다", () => {
    expect(maskName("홍길동")).toBe("홍*동");
    expect(maskName("김철")).toBe("김*");
    expect(maskName("남궁민수")).toBe("남**수");
    expect(maskName("이")).toBe("*");
    expect(maskName("  박서준 ")).toBe("박*준");
  });

  it("제출 입력을 점검한다", () => {
    expect(validateSubmission({ studentNum: "10307", studentName: "홍길동", text: "답" })).toBeNull();
    expect(validateSubmission({ studentNum: "1037", studentName: "홍길동", text: "답" })).toMatch("5자리");
    expect(validateSubmission({ studentNum: "10307", studentName: " ", text: "답" })).toMatch("이름");
    expect(validateSubmission({ studentNum: "10307", studentName: "홍길동", text: "  " })).toMatch("내용");
  });
});

describe("반 설정", () => {
  it("잘못된 반·중복을 빼고 순서대로 정리한다", () => {
    expect(
      normalizeClassSettings([
        { id: "1-10", size: 28 },
        { id: "1-2", size: 27.4 },
        { id: "x", size: 3 },
        { id: "1-2", size: 30 },
        { id: "2-1", size: 0 },
        { id: "1-1", size: 99 },
      ])
    ).toEqual([
      { id: "1-1", size: 60 },
      { id: "1-2", size: 30 },
      { id: "1-10", size: 28 },
    ]);
  });

  it("범위로 여러 반을 만든다", () => {
    expect(classRange(1, 3, 1, 25).map((c) => c.id)).toEqual(["1-1", "1-2", "1-3"]);
    expect(classRange(0, 1, 2, 25)).toEqual([]);
  });

  it("대상 반이 없으면 제출이 들어온 반을 쓴다", () => {
    const settings = [{ id: "1-3", size: 5 }];
    expect(targetClasses({ classes: ["1-3"] }, settings)).toEqual([{ id: "1-3", size: 5 }]);
    expect(targetClasses({ classes: [] }, settings, [{ studentNum: "20101" }, { studentNum: "10302" }])).toEqual([
      { id: "1-3", size: 5 },
      { id: "2-1", size: 0 },
    ]);
  });
});

describe("마감·지각", () => {
  it("마감일 다음 날부터 지각", () => {
    expect(isLate(at(2026, 11, 20, 23), "2026-11-20")).toBe(false);
    expect(isLate(at(2026, 11, 21, 0), "2026-11-20")).toBe(true);
    expect(isLate(at(2026, 11, 21), "")).toBe(false);
  });

  it("D-day 표시", () => {
    const now = new Date(2026, 10, 6);
    expect(dueInfo("2026-11-09", now)).toEqual({ date: "11.9", days: 3, label: "D-3" });
    expect(dueInfo("2026-11-06", now).label).toBe("D-DAY");
    expect(dueInfo("2026-11-01", now).label).toBe("기한 지남");
    expect(dueInfo("", now)).toBeNull();
  });
});

describe("제출 현황 칸", () => {
  const subs = [
    { id: "a", studentNum: "10301", at: at(2026, 11, 10) },
    { id: "b", studentNum: "10303", at: at(2026, 11, 25) }, // 지각
    { id: "c", studentNum: "10303", at: at(2026, 11, 26) }, // 지각 재제출
    { id: "d", studentNum: "10305", at: at(2026, 11, 25) }, // 지각 후
    { id: "e", studentNum: "10305", at: at(2026, 11, 12) }, //   기한 안에도 냄 → 제출
    { id: "f", studentNum: "10309", at: at(2026, 11, 10) }, // 인원(5명)보다 큰 번호
    { id: "g", studentNum: "20101", at: at(2026, 11, 10) }, // 대상 반이 아님
  ];
  const grid = buildClassGrid([{ id: "1-3", size: 5 }], subs, "2026-11-20");

  it("번호마다 제출·지각·미제출을 표시한다", () => {
    const [c] = grid.classes;
    expect(c.cells.map((x) => x.state)).toEqual(["ok", "none", "late", "none", "ok"]);
    expect(c.cells[2].subs.map((s) => s.id)).toEqual(["b", "c"]);
    expect(c).toMatchObject({ label: "1학년 3반", size: 5, done: 3, late: 1, lackingNums: [], missing: [2, 4] });
  });

  it("칸에 들어가지 않는 제출물은 따로 모은다", () => {
    expect(grid.extras.map((s) => s.id)).toEqual(["f", "g"]);
    expect(grid.totals).toEqual({ size: 5, done: 3, late: 1, lacking: 0, missing: 2 });
  });

  it("인원을 모르면 제출한 가장 큰 번호까지 보여 준다", () => {
    const g = buildClassGrid([{ id: "1-3", size: 0 }], subs);
    expect(g.classes[0].size).toBe(9);
    expect(g.extras.map((s) => s.id)).toEqual(["g"]);
  });

  it("미제출 안내 문구", () => {
    expect(missingText(grid, "1차 과제")).toBe("[1차 과제]\n1학년 3반 미제출(2명): 2, 4번");
  });

  it("내용 부족: 낸 학생만 주황 칸이 되고, 제출 수에는 들어간다", () => {
    // 10301(제출)·10303(지각)을 내용 부족으로, 10302(미제출)에 붙은 표시는 무시
    const g = buildClassGrid([{ id: "1-3", size: 5 }], subs, "2026-11-20", { 10301: true, 10303: true, 10302: true });
    const [c] = g.classes;
    expect(c.cells.map((x) => x.state)).toEqual(["lacking", "none", "lacking", "none", "ok"]);
    expect(c).toMatchObject({ done: 3, late: 0, lackingNums: [1, 3], missing: [2, 4] });
    expect(g.totals).toEqual({ size: 5, done: 3, late: 0, lacking: 2, missing: 2 });
    expect(missingText(g)).toBe("1학년 3반 미제출(2명): 2, 4번 / 내용 부족(2명): 1, 3번");
  });

  it("정렬", () => {
    expect(sortSubmissions(subs, "num").map((s) => s.id)).toEqual(["a", "b", "c", "e", "d", "f", "g"]);
    expect(sortSubmissions(subs, "new")[0].id).toBe("c");
    expect(sortSubmissions([...subs, { id: "p", studentNum: "10302" }], "new")[0].id).toBe("p"); // 방금 낸 것
    expect(sortSubmissions(subs, "old").at(-1).id).toBe("c");
  });
});

describe("받는 중인 과제 (정보 수업 홈)", () => {
  it("마감 남은 것(가까운 순) → 마감 없음 → 마감 지남, 닫힌 과제는 뺀다", () => {
    const list = [
      { id: "past", open: true, due: "2026-11-01" },
      { id: "nodue", open: true, due: "" },
      { id: "later", open: true, due: "2026-11-20" },
      { id: "closed", open: false, due: "2026-11-12" },
      { id: "soon", open: true, due: "2026-11-10" },
    ];
    expect(openHomework(list, "2026-11-09").map((h) => h.id)).toEqual(["soon", "later", "nodue", "past"]);
  });
});

describe("누적 현황표", () => {
  it("학생 × 그 반 대상 과제", () => {
    const homeworks = [
      { id: "h1", title: "1차", due: "2026-11-10", classes: ["1-3"] },
      { id: "h2", title: "다른 반", due: "", classes: ["1-4"] },
      { id: "h3", title: "2차", due: "", classes: ["1-3", "1-4"] },
    ];
    const rosters = {
      h1: [{ studentNum: "10301", at: at(2026, 11, 9) }, { studentNum: "10302", at: at(2026, 11, 11) }],
      h3: [{ studentNum: "10301", at: at(2026, 11, 20) }],
    };
    const t = cumulativeTable("1-3", 3, homeworks, rosters);
    expect(t.columns.map((h) => h.id)).toEqual(["h1", "h3"]);
    expect(cumulativeTable("1-3", 3, homeworks, rosters, { h3: { 10301: true } }).rows[0].cells).toEqual(["ok", "lacking"]);
    expect(t.rows).toEqual([
      { num: 1, studentNum: "10301", cells: ["ok", "ok"], done: 2, missing: 0 },
      { num: 2, studentNum: "10302", cells: ["late", "none"], done: 1, missing: 1 },
      { num: 3, studentNum: "10303", cells: ["none", "none"], done: 0, missing: 2 },
    ]);
  });
});

describe("CSV", () => {
  it("따옴표·쉼표·줄바꿈과 수식 시작 글자를 안전하게 쓴다", () => {
    expect(toCsv([["a", 'b"c', "d,e"], ["줄\n바꿈", "=SUM(A1)", 3]])).toBe('﻿a,"b""c","d,e"\r\n"줄\n바꿈",\'=SUM(A1),3');
  });
});
