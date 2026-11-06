import { describe, expect, it } from "vitest";
import {
  addDays,
  dDay,
  dateKey,
  defaultStart,
  diffDays,
  eventsInMonth,
  formatPeriod,
  isDateKey,
  layoutWeek,
  monthWeeks,
  pendingEvents,
  shiftMonth,
  validateEvent,
  weekdayOf,
} from "./workCalendar";

const ev = (id, start, end, extra = {}) => ({ id, title: id, start, end, done: false, ...extra });

describe("날짜 계산", () => {
  it("실제로 있는 날짜만 통과시킨다", () => {
    expect(isDateKey("2026-11-06")).toBe(true);
    expect(isDateKey("2024-02-29")).toBe(true); // 윤년
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-1-6")).toBe(false);
    expect(isDateKey("")).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it("dateKey 는 현지 날짜를 그대로 쓴다", () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("날짜 더하기·빼기는 달·해를 넘는다", () => {
    expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-11-06", "2026-11-27")).toBe(21);
    expect(diffDays("2026-11-27", "2026-11-06")).toBe(-21);
    // 서머타임이 있는 지역에서도 하루는 하루
    expect(diffDays("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("요일을 구한다 (0=일)", () => {
    expect(weekdayOf("2026-11-06")).toBe(5); // 금요일
    expect(weekdayOf("2026-11-08")).toBe(0);
  });

  it("달 이동은 해를 넘는다", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 3 }, 0)).toEqual({ year: 2026, month: 3 });
  });
});

describe("monthWeeks", () => {
  it("일요일부터 시작하는 주 단위로 그 달을 덮는다", () => {
    const weeks = monthWeeks(2026, 11); // 11/1 은 일요일
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks.at(-1)).toContain("2026-11-30");
    expect(weeks).toHaveLength(5);
    for (const w of weeks) expect(w).toHaveLength(7);
  });

  it("달의 첫날이 주 중간이면 앞 달 날짜가 채워진다", () => {
    const weeks = monthWeeks(2026, 10); // 10/1 은 목요일
    expect(weeks[0][0]).toBe("2026-09-27");
    expect(weeks[0][4]).toBe("2026-10-01");
  });

  it("6주가 필요한 달도 있다", () => {
    expect(monthWeeks(2026, 8)).toHaveLength(6); // 8/1 토요일, 8/31 월요일
  });
});

describe("layoutWeek", () => {
  const week = monthWeeks(2026, 11)[1]; // 11/8(일) ~ 11/14(토)

  it("하루짜리와 기간 일정을 칸에 맞춘다", () => {
    const { bars, laneCount } = layoutWeek(week, [ev("a", "2026-11-10", "2026-11-10"), ev("b", "2026-11-09", "2026-11-12")]);
    const b = bars.find((x) => x.event.id === "b");
    expect([b.startCol, b.endCol]).toEqual([1, 4]);
    const a = bars.find((x) => x.event.id === "a");
    expect([a.startCol, a.endCol]).toEqual([2, 2]);
    expect(laneCount).toBe(2); // 겹치니까 두 줄
    expect(a.lane).not.toBe(b.lane);
  });

  it("겹치지 않는 일정은 같은 줄에 놓는다", () => {
    const { bars, laneCount } = layoutWeek(week, [ev("a", "2026-11-08", "2026-11-09"), ev("b", "2026-11-11", "2026-11-12")]);
    expect(laneCount).toBe(1);
    expect(bars.every((x) => x.lane === 0)).toBe(true);
  });

  it("주를 넘는 일정은 잘려서 이어진다", () => {
    const { bars } = layoutWeek(week, [ev("long", "2026-11-05", "2026-11-20")]);
    expect(bars).toHaveLength(1);
    expect([bars[0].startCol, bars[0].endCol]).toEqual([0, 6]);
    expect(bars[0].clippedStart).toBe(true);
    expect(bars[0].clippedEnd).toBe(true);
  });

  it("이 주와 상관없는 일정과 깨진 일정은 건너뛴다", () => {
    const { bars, laneCount } = layoutWeek(week, [
      ev("before", "2026-11-01", "2026-11-07"),
      ev("after", "2026-11-15", "2026-11-16"),
      { id: "broken", start: "oops", end: "2026-11-10" },
      ev("reversed", "2026-11-12", "2026-11-10"),
    ]);
    expect(bars).toHaveLength(0);
    expect(laneCount).toBe(0);
  });

  it("주의 첫날·마지막 날에 걸친 일정이 칸 안에 들어간다", () => {
    const { bars } = layoutWeek(week, [ev("edge", "2026-11-14", "2026-11-14"), ev("first", "2026-11-08", "2026-11-08")]);
    expect(bars.find((x) => x.event.id === "edge").startCol).toBe(6);
    expect(bars.find((x) => x.event.id === "first").startCol).toBe(0);
  });
});

describe("목록 뽑기", () => {
  const events = [
    ev("late", "2026-11-20", "2026-11-27"),
    ev("done", "2026-11-01", "2026-11-03", { done: true }),
    ev("overdue", "2026-10-25", "2026-10-30"),
    ev("soon", "2026-11-05", "2026-11-07"),
    ev("dec", "2026-12-01", "2026-12-02"),
  ];

  it("그 달과 겹치는 일정만 시작일 순으로", () => {
    expect(eventsInMonth(events, 2026, 11).map((e) => e.id)).toEqual(["done", "soon", "late"]);
    expect(eventsInMonth(events, 2026, 10).map((e) => e.id)).toEqual(["overdue"]);
  });

  it("월 경계를 넘는 일정은 양쪽 달에 나온다", () => {
    const list = [ev("cross", "2026-10-28", "2026-11-03")];
    expect(eventsInMonth(list, 2026, 10)).toHaveLength(1);
    expect(eventsInMonth(list, 2026, 11)).toHaveLength(1);
    expect(eventsInMonth(list, 2026, 12)).toHaveLength(0);
  });

  it("끝나지 않은 일정은 마감일 순이고 지난 것이 맨 앞", () => {
    expect(pendingEvents(events).map((e) => e.id)).toEqual(["overdue", "soon", "late", "dec"]);
  });
});

describe("D-day와 기간 표시", () => {
  it("남은 날, 당일, 지난 날을 구분한다", () => {
    expect(dDay("2026-11-09", "2026-11-06")).toEqual({ days: 3, label: "D-3" });
    expect(dDay("2026-11-06", "2026-11-06")).toEqual({ days: 0, label: "D-DAY" });
    expect(dDay("2026-11-04", "2026-11-06")).toEqual({ days: -2, label: "D+2" });
  });

  it("기간을 읽기 좋게 쓴다", () => {
    expect(formatPeriod("2026-11-20", "2026-11-20")).toBe("11/20(금)");
    expect(formatPeriod("2026-11-20", "2026-11-27")).toBe("11/20(금) ~ 11/27(금)");
  });
});

describe("시작일 기본값과 저장 전 점검", () => {
  it("시작일은 오늘, 마감이 이미 지났으면 마감 당일", () => {
    expect(defaultStart("2026-11-20", "2026-11-06")).toBe("2026-11-06");
    expect(defaultStart("2026-11-06", "2026-11-06")).toBe("2026-11-06");
    expect(defaultStart("2026-11-01", "2026-11-06")).toBe("2026-11-01");
    expect(defaultStart("", "2026-11-06")).toBe("2026-11-06");
  });

  const ok = { title: "개인정보 파일 파기", start: "2026-11-06", end: "2026-11-27", note: "" };

  it("정상 입력은 통과", () => {
    expect(validateEvent(ok)).toBeNull();
    expect(validateEvent({ ...ok, start: "2026-11-27" })).toBeNull(); // 하루짜리
  });

  it("빠졌거나 어긋난 입력은 이유를 알려 준다", () => {
    expect(validateEvent({ ...ok, title: "  " })).toMatch(/이름/);
    expect(validateEvent({ ...ok, end: "" })).toMatch(/마감일/);
    expect(validateEvent({ ...ok, start: "" })).toMatch(/시작일/);
    expect(validateEvent({ ...ok, start: "2026-12-01" })).toMatch(/늦을 수 없/);
    expect(validateEvent({ ...ok, title: "가".repeat(121) })).toMatch(/120/);
    expect(validateEvent({ ...ok, note: "가".repeat(1001) })).toMatch(/1000/);
  });
});
