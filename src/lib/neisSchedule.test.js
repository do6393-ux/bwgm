import { describe, expect, it } from "vitest";
import {
  eventsOn,
  isOffDay,
  mergeScheduleRows,
  scheduleRangeFor,
  scheduleTag,
  scheduleWhen,
  upcomingSchool,
  ymdToKey,
} from "./neisSchedule";
import { monthWeeks } from "./workCalendar";

// 나이스가 실제로 주는 모양 (2026학년도 부원여중에서 받은 줄을 줄여서)
const row = (ymd, name, sbtr = "해당없음", content = "") => ({ AA_YMD: ymd, EVENT_NM: name, SBTR_DD_SC_NM: sbtr, EVENT_CNTNT: content });

describe("ymdToKey", () => {
  it("20261119 → 2026-11-19, 이상한 값은 빈 문자열", () => {
    expect(ymdToKey("20261119")).toBe("2026-11-19");
    expect(ymdToKey("20260230")).toBe("");
    expect(ymdToKey("")).toBe("");
    expect(ymdToKey(undefined)).toBe("");
  });
});

describe("mergeScheduleRows", () => {
  it("토요휴업일은 빼고, 날마다 오는 방학은 하나로 묶는다 (하루 빠진 곳도 잇는다)", () => {
    const rows = [
      row("20270102", "토요휴업일", "휴업일"),
      row("20270106", "겨울방학", "휴업일", "겨울방학"),
      row("20270107", "겨울방학", "휴업일", "겨울방학"),
      row("20270207", "겨울방학", "휴업일", "겨울방학"),
      row("20270207", "설날", "공휴일"),
      row("20270209", "겨울방학", "휴업일", "겨울방학"), // 2/8 이 비어 있다
      row("20270228", "겨울방학", "휴업일", "겨울방학"),
    ];
    // 1/8 ~ 2/6 도 실제로는 매일 있다. 여기서는 사이를 채워 넣는다
    for (let d = 8; d <= 31; d++) rows.push(row(`202701${String(d).padStart(2, "0")}`, "겨울방학", "휴업일", "겨울방학"));
    for (let d = 1; d <= 6; d++) rows.push(row(`2027020${d}`, "겨울방학", "휴업일", "겨울방학"));
    for (let d = 10; d <= 27; d++) rows.push(row(`202702${d}`, "겨울방학", "휴업일", "겨울방학"));

    const events = mergeScheduleRows(rows);
    expect(events.map((e) => [e.title, e.start, e.end])).toEqual([
      ["겨울방학", "2027-01-06", "2027-02-28"],
      ["설날", "2027-02-07", "2027-02-07"],
    ]);
    const vacation = events[0];
    expect(vacation.note).toBe(""); // 내용이 이름과 같으면 버린다
    expect(vacation.off).toBe(false); // 방학은 빨갛게 칠하지 않는다
    expect(events[1].off).toBe(true);
    expect(vacation.id).toBe("2027-01-06|겨울방학");
  });

  it("같은 이름이라도 멀리 떨어져 있으면 따로, 휴업일·공휴일·행사를 구분한다", () => {
    const events = mergeScheduleRows([
      row("20260302", "대체공휴일", "공휴일"),
      row("20260525", "대체공휴일", "공휴일"),
      row("20260910", "학교공개의 날", "해당없음", "학부모공개수업(5-6교시)"),
      row("20261119", "수능시험일", "휴업일"),
    ]);
    expect(events.map((e) => [e.title, e.start, e.kind, e.off, scheduleTag(e)])).toEqual([
      ["대체공휴일", "2026-03-02", "공휴일", true, "공휴일"],
      ["대체공휴일", "2026-05-25", "공휴일", true, "공휴일"],
      ["학교공개의 날", "2026-09-10", "", false, ""],
      ["수능시험일", "2026-11-19", "휴업일", true, "휴업"],
    ]);
    expect(events[2].note).toBe("학부모공개수업(5-6교시)");
  });

  it("빈 응답이나 깨진 줄은 건너뛴다", () => {
    expect(mergeScheduleRows(undefined)).toEqual([]);
    expect(mergeScheduleRows([{}, row("2026", "이상한 날짜"), row("20261119", "  ")])).toEqual([]);
  });
});

describe("오늘 기준 계산", () => {
  const events = mergeScheduleRows([
    row("20261119", "수능시험일", "휴업일"),
    row("20261225", "성탄절", "공휴일"),
    row("20270101", "신정", "공휴일"),
    row("20270106", "겨울방학", "휴업일"),
    row("20270107", "겨울방학", "휴업일"),
  ]);

  it("다가오는 일정은 가까운 순으로 limit 개, 진행 중인 것도 들어간다", () => {
    expect(upcomingSchool(events, "2026-11-13").map((e) => e.title)).toEqual(["수능시험일", "성탄절", "신정"]);
    expect(upcomingSchool(events, "2027-01-07", 3).map((e) => e.title)).toEqual(["겨울방학"]);
    expect(upcomingSchool(events, "2027-02-01")).toEqual([]);
  });

  it("D-day 표시: 앞으로 · 당일 · 진행 중 · 지남", () => {
    const [suneung, , , vacation] = events;
    expect(scheduleWhen(suneung, "2026-11-13")).toEqual({ label: "D-6", days: 6 });
    expect(scheduleWhen(suneung, "2026-11-19").label).toBe("D-DAY");
    expect(scheduleWhen(suneung, "2026-11-20").label).toBe("");
    expect(scheduleWhen(vacation, "2027-01-07").label).toBe("진행 중");
  });

  it("그날의 일정과 빨간 날", () => {
    expect(eventsOn(events, "2027-01-07").map((e) => e.title)).toEqual(["겨울방학"]);
    expect(isOffDay(events, "2026-11-19")).toBe(true);
    expect(isOffDay(events, "2027-01-07")).toBe(false); // 방학은 칠하지 않는다
    expect(isOffDay(events, "2026-11-20")).toBe(false);
  });
});

describe("scheduleRangeFor", () => {
  it("달력에 보이는 주보다 앞뒤로 62일 더 받는다", () => {
    const weeks = monthWeeks(2026, 11); // 11/1(일) ~ 12/5(토)
    expect(scheduleRangeFor(weeks)).toEqual({ from: "2026-08-31", to: "2027-02-05" });
  });
});
