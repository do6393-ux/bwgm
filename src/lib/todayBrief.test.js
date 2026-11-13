import { describe, expect, it } from "vitest";
import {
  dayLessons,
  isBeyondNextWeek,
  mondayOf,
  parseTeacherCell,
  periodState,
  pickWeekKey,
  targetSchoolDay,
  upcomingHomework,
  withIra,
  workDigest,
} from "./todayBrief";
import { isNoClassDay, mergeScheduleRows } from "./neisSchedule";

// 2026-11-09 는 월요일
const at = (key, hh = 12, mm = 0) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

// 나이스 학사일정 (실제 2026학년도 줄 일부)
const row = (ymd, name, sbtr) => ({ AA_YMD: ymd, EVENT_NM: name, SBTR_DD_SC_NM: sbtr });
const school = mergeScheduleRows([
  row("20261119", "수능시험일", "휴업일"),
  row("20261225", "성탄절", "공휴일"),
  row("20261009", "한글날", "공휴일"),
  row("20261010", "토요휴업일", "휴업일"),
  row("20260910", "학교공개의 날", "해당없음"),
  ...Array.from({ length: 26 }, (_, i) => row(`202701${String(i + 6).padStart(2, "0")}`, "겨울방학", "휴업일")),
  ...Array.from({ length: 28 }, (_, i) => row(`202702${String(i + 1).padStart(2, "0")}`, "겨울방학", "휴업일")),
  row("20270301", "3·1절", "공휴일"),
]);
const noClass = (d) => isNoClassDay(school, d);

describe("targetSchoolDay", () => {
  it("평일은 오늘", () => {
    expect(targetSchoolDay(at("2026-11-11"))).toEqual({ date: "2026-11-11", today: "2026-11-11", isToday: true, dayIdx: 2, daysAhead: 0 });
  });
  it("토·일은 다음 월요일", () => {
    expect(targetSchoolDay(at("2026-11-14"))).toMatchObject({ date: "2026-11-16", isToday: false, dayIdx: 0, daysAhead: 2 });
    expect(targetSchoolDay(at("2026-11-15"))).toMatchObject({ date: "2026-11-16", isToday: false, dayIdx: 0, daysAhead: 1 });
  });
  it("휴업일·공휴일이면 다음 수업일 (수능날 → 금요일, 성탄절 금요일 → 월요일)", () => {
    expect(targetSchoolDay(at("2026-11-19"), noClass)).toMatchObject({ date: "2026-11-20", isToday: false, dayIdx: 4 });
    expect(targetSchoolDay(at("2026-12-25"), noClass)).toMatchObject({ date: "2026-12-28", daysAhead: 3 });
    expect(targetSchoolDay(at("2026-10-09"), noClass).date).toBe("2026-10-12"); // 한글날(금) → 월
  });
  it("수업일의 행사는 건너뛰지 않는다", () => {
    expect(targetSchoolDay(at("2026-09-10"), noClass)).toMatchObject({ date: "2026-09-10", isToday: true });
  });
  it("방학 중이면 개학하는 날까지 건너뛴다 (3·1절 다음 날)", () => {
    expect(targetSchoolDay(at("2027-01-20"), noClass)).toMatchObject({ date: "2027-03-02", daysAhead: 41 });
  });
  it("다음 학년도 학사일정이 아직 없어도 정해진 공휴일(3/1)은 건너뛴다", () => {
    const withoutMarch = school.filter((e) => e.title !== "3·1절");
    expect(targetSchoolDay(at("2027-01-20"), (d) => isNoClassDay(withoutMarch, d)).date).toBe("2027-03-02");
    expect(targetSchoolDay(at("2026-12-25")).date).toBe("2026-12-28"); // 학사일정을 몰라도 성탄절은 쉰다
  });
  it("수업일을 못 찾을 만큼 이상한 학사일정이면 주말만 건너뛴다", () => {
    expect(targetSchoolDay(at("2026-11-14"), () => true)).toMatchObject({ date: "2026-11-16" });
    expect(targetSchoolDay(at("2026-11-11"), () => true)).toMatchObject({ date: "2026-11-11", isToday: true });
  });
});

describe("withIra", () => {
  it("받침에 따라 이라 / 라", () => {
    expect(withIra("주말")).toBe("주말이라");
    expect(withIra("수능시험일")).toBe("수능시험일이라");
    expect(withIra("지방선거")).toBe("지방선거라");
    expect(withIra("3·1절")).toBe("3·1절이라");
    expect(withIra("ABC")).toBe("ABC(이)라");
  });
});

describe("isBeyondNextWeek", () => {
  it("다음 주까지는 시간표가 있고 그 뒤는 없다", () => {
    expect(isBeyondNextWeek("2026-11-20", "2026-11-13")).toBe(false);
    expect(isBeyondNextWeek("2026-11-16", "2026-11-14")).toBe(false);
    expect(isBeyondNextWeek("2026-11-23", "2026-11-13")).toBe(true);
    expect(isBeyondNextWeek("2027-03-02", "2027-01-20")).toBe(true);
  });
});

describe("mondayOf", () => {
  it("그 주 월요일 (일요일은 앞 주)", () => {
    expect(mondayOf("2026-11-13")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
  });
});

describe("pickWeekKey", () => {
  const thu = at("2026-11-12", 7, 30).getTime();
  const fri = at("2026-11-13", 7, 30).getTime();
  const lastFri = at("2026-11-06", 7, 30).getTime();

  it("평일: this 문서가 이번 주에 기록됐으면 this", () => {
    expect(pickWeekKey("2026-11-12", true, thu, thu)).toBe("this");
  });
  it("월요일 동기화 전: this 는 지난주 것이라 지난주에 받은 next 를 쓴다", () => {
    expect(pickWeekKey("2026-11-09", true, lastFri, lastFri)).toBe("next");
  });
  it("주말에 다음 월요일을 볼 때는 금요일에 받은 next", () => {
    expect(pickWeekKey("2026-11-16", false, fri, fri)).toBe("next");
  });
  it("동기화가 오래 멈췄으면 null", () => {
    expect(pickWeekKey("2026-11-23", true, lastFri, lastFri)).toBeNull();
  });
  it("기록 시각을 모르면 평일 this, 주말 next", () => {
    expect(pickWeekKey("2026-11-12", true, null, null)).toBe("this");
    expect(pickWeekKey("2026-11-16", false, null, null)).toBe("next");
  });
});

describe("parseTeacherCell", () => {
  it("학년·반과 과목을 나눈다", () => {
    expect(parseTeacherCell("205정보")).toEqual({ classLabel: "2-5", subject: "정보" });
    expect(parseTeacherCell("110정보")).toEqual({ classLabel: "1-10", subject: "정보" });
  });
  it("학급 번호가 없으면 과목만", () => {
    expect(parseTeacherCell("동아리")).toEqual({ classLabel: "", subject: "동아리" });
    expect(parseTeacherCell("")).toEqual({ classLabel: "", subject: "" });
  });
});

describe("dayLessons", () => {
  const schedule = {
    "2_0": { text: "205정보", type: "normal" },
    "3_0": { text: "206정보", type: "red" },
    "6_0": { text: "동아리", type: "normal" },
    "1_1": { text: "301정보", type: "normal" },
  };
  it("그날 1~7교시를 빈 교시까지 만든다", () => {
    const list = dayLessons(schedule, 0, null);
    expect(list).toHaveLength(7);
    expect(list[0]).toMatchObject({ period: 1, text: "" });
    expect(list[1]).toMatchObject({ period: 2, classLabel: "2-5", subject: "정보", changed: false });
    expect(list[5]).toMatchObject({ period: 6, event: true });
  });
  it("기본 시간표가 있으면 바뀐 칸을 표시한다", () => {
    const base = Array.from({ length: 7 }, () => Array(5).fill(""));
    base[1][0] = "205정보";
    base[2][0] = "206정보";
    const list = dayLessons(schedule, 0, base);
    expect(list[1].changed).toBe(false);
    expect(list[2].changed).toBe(true); // 컴시간이 변경(red)으로 표시
  });
});

describe("periodState", () => {
  const times = ["09:00", "09:55", "10:50"];
  it("수업 중이면 current, 다음 교시는 next", () => {
    expect(periodState(times, at("2026-11-09", 9, 10))).toEqual({ current: 1, next: 2 });
  });
  it("쉬는 시간에는 current 없음", () => {
    expect(periodState(times, at("2026-11-09", 9, 50))).toEqual({ current: null, next: 2 });
  });
  it("수업 전·후", () => {
    expect(periodState(times, at("2026-11-09", 8, 0))).toEqual({ current: null, next: 1 });
    expect(periodState(times, at("2026-11-09", 15, 0))).toEqual({ current: null, next: null });
  });
  it("시각을 모르면 둘 다 없음", () => {
    expect(periodState([], at("2026-11-09", 9, 10))).toEqual({ current: null, next: null });
  });
});

describe("workDigest", () => {
  const ev = (id, start, end, done = false) => ({ id, title: id, start, end, done });
  it("기한 지남 / 오늘 / 이번 주로 나누고 끝난 일정과 먼 일정은 뺀다", () => {
    const d = workDigest(
      [
        ev("late", "2026-11-01", "2026-11-05"),
        ev("today", "2026-11-09", "2026-11-09"),
        ev("week", "2026-11-09", "2026-11-15"),
        ev("far", "2026-11-09", "2026-11-16"),
        ev("done", "2026-11-09", "2026-11-09", true),
      ],
      "2026-11-09"
    );
    expect(d.overdue.map((e) => e.id)).toEqual(["late"]);
    expect(d.overdue[0].dday).toBe("D+4");
    expect(d.dueToday.map((e) => e.id)).toEqual(["today"]);
    expect(d.thisWeek.map((e) => e.id)).toEqual(["week"]);
    expect(d.thisWeek[0].dday).toBe("D-6");
  });
});

describe("upcomingHomework", () => {
  it("공개 중이고 마감 전인 과제를 마감 순으로", () => {
    const list = upcomingHomework(
      [
        { id: "a", open: true, due: "2026-11-20" },
        { id: "b", open: true, due: "2026-11-11" },
        { id: "closed", open: false, due: "2026-11-10" },
        { id: "past", open: true, due: "2026-11-08" },
        { id: "nodue", open: true, due: "" },
        { id: "c", open: true, due: "2026-11-09" },
      ],
      "2026-11-09"
    );
    expect(list.map((h) => h.id)).toEqual(["c", "b"]);
    expect(list[0].dday).toBe("D-DAY");
  });
});
