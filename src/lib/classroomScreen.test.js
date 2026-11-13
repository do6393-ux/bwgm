import { describe, expect, it } from "vitest";
import { addMinutes, classroomRows, classroomStatus, longDate, splitClassCell } from "./classroomScreen";

const TIMES = ["09:00", "09:55", "10:50", "11:45", "13:30", "14:25", "15:20"];
const at = (hh, mm) => new Date(2026, 10, 13, hh, mm); // 11/13(금)

// 금요일(요일 4) 시간표: 6교시까지, 4교시는 바뀐 교시, 6교시는 동아리
const schedule = {
  "1_4": { text: "국어김철", type: "normal", subject: "국어", teacher: "김철" },
  "2_4": { text: "수학이영", type: "normal", subject: "수학", teacher: "이영" },
  "3_4": { text: "정보홍길", type: "normal" }, // 예전 문서 (과목·선생님이 따로 없음)
  "4_4": { text: "영어박민", type: "red", subject: "영어", teacher: "박민" },
  "5_4": { text: "과학최수", type: "normal", subject: "과학", teacher: "최수" },
  "6_4": { text: "동아리", type: "red", subject: "동아리", teacher: "" },
};

describe("작은 도우미", () => {
  it("addMinutes · longDate", () => {
    expect(addMinutes("09:55", 45)).toBe("10:40");
    expect(addMinutes("11:45", 45)).toBe("12:30");
    expect(addMinutes("?", 45)).toBe("");
    expect(longDate("2026-11-13")).toBe("11월 13일 금요일");
  });
  it("splitClassCell: 과목·선생님이 따로 있으면 나누고, 없으면 글자 통째로", () => {
    expect(splitClassCell(schedule["1_4"])).toEqual({ subject: "국어", teacher: "김철" });
    expect(splitClassCell(schedule["3_4"])).toEqual({ subject: "정보홍길", teacher: "" });
    expect(splitClassCell("과학")).toEqual({ subject: "과학", teacher: "" });
    expect(splitClassCell(null)).toEqual({ subject: "", teacher: "" });
  });
});

describe("classroomRows", () => {
  it("뒤쪽 빈 교시는 빼고, 시작·끝 시각과 변동·창체를 표시한다", () => {
    const rows = classroomRows(schedule, 4, TIMES, at(8, 0), true);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toMatchObject({ period: 2, start: "09:55", end: "10:40", subject: "수학", teacher: "이영" });
    expect(rows[3].changed).toBe(true);
    expect(rows[5]).toMatchObject({ event: true, changed: false }); // 창체는 변동으로 보지 않는다
  });

  it("수업 중이면 지금·다음·끝난 교시", () => {
    const rows = classroomRows(schedule, 4, TIMES, at(10, 12), true);
    expect(rows.map((r) => r.state)).toEqual(["past", "now", "next", "", "", ""]);
    expect(classroomStatus(rows, true)).toBe("2교시 수업 중 · 10:40 끝");
  });

  it("쉬는 시간 · 점심시간 · 수업 전 · 수업 끝", () => {
    expect(classroomStatus(classroomRows(schedule, 4, TIMES, at(10, 45), true), true)).toBe("쉬는 시간 · 3교시 10:50 시작");
    expect(classroomStatus(classroomRows(schedule, 4, TIMES, at(12, 40), true), true)).toBe("점심시간 · 5교시 13:30 시작");
    expect(classroomStatus(classroomRows(schedule, 4, TIMES, at(8, 20), true), true)).toBe("수업 전 · 1교시 09:00 시작");
    expect(classroomStatus(classroomRows(schedule, 4, TIMES, at(16, 0), true), true)).toBe("오늘 수업 끝");
  });

  it("오늘이 아니면(다음 수업일) 지금·다음 표시가 없다", () => {
    const rows = classroomRows(schedule, 4, TIMES, at(10, 12), false);
    expect(rows.every((r) => r.state === "")).toBe(true);
    expect(classroomStatus(rows, false)).toBe("");
  });

  it("교시 시각을 모르면 시각 칸이 비고 지금 표시도 없다", () => {
    const rows = classroomRows(schedule, 4, [], at(10, 12), true);
    expect(rows[0]).toMatchObject({ start: "", end: "", state: "" });
  });

  it("시간표가 없으면 빈 목록", () => {
    expect(classroomRows(null, 4, TIMES, at(10, 12), true)).toEqual([]);
  });
});
