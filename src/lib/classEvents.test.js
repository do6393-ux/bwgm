import { describe, expect, it } from "vitest";
import {
  CLASS_EVENT_MAX,
  checkClassEvent,
  cleanClassEvents,
  dropPastEvents,
  makeEventId,
  mergeUpcoming,
  removeClassEvent,
  upsertClassEvent,
} from "./classEvents";

const TODAY = "2026-11-24";
const ev = (id, start, end = start, title = `일정${id}`) => ({ id, title, start, end });

describe("cleanClassEvents", () => {
  it("저장된 값이 이상하면 빈 목록", () => {
    expect(cleanClassEvents(undefined)).toEqual([]);
    expect(cleanClassEvents("x")).toEqual([]);
  });

  it("올바른 것만 남기고 시작일 순으로", () => {
    const got = cleanClassEvents([
      ev("b", "2026-11-27"),
      { id: "c", title: "  체육복   챙기기 ", start: "2026-11-25" },
      { id: "d", title: "", start: "2026-11-25" }, // 이름 없음
      { id: "e", title: "날짜 틀림", start: "2026-02-30" },
      { id: "BAD ID", title: "id 틀림", start: "2026-11-25" },
      ev("b", "2026-11-28"), // 같은 id
      null,
    ]);
    expect(got).toEqual([
      { id: "c", title: "체육복 챙기기", start: "2026-11-25", end: "2026-11-25" },
      ev("b", "2026-11-27"),
    ]);
  });

  it("끝나는 날이 앞이거나 이상하면 하루짜리로", () => {
    expect(cleanClassEvents([ev("a", "2026-11-27", "2026-11-20")])[0].end).toBe("2026-11-27");
    expect(cleanClassEvents([ev("a", "2026-11-27", "x")])[0].end).toBe("2026-11-27");
  });

  it("이름은 20자까지", () => {
    expect(cleanClassEvents([ev("a", "2026-11-27", undefined, "가".repeat(30))])[0].title).toHaveLength(20);
  });
});

describe("checkClassEvent", () => {
  it("이름·날짜가 있어야 한다", () => {
    expect(checkClassEvent({ title: " ", start: "2026-11-27", end: "" }, TODAY).error).toMatch("이름");
    expect(checkClassEvent({ title: "수행평가", start: "", end: "" }, TODAY).error).toMatch("날짜");
  });

  it("끝나는 날을 비우면 하루짜리", () => {
    expect(checkClassEvent({ title: "수행평가", start: "2026-11-27", end: "" }, TODAY)).toEqual({
      event: { title: "수행평가", start: "2026-11-27", end: "2026-11-27" },
    });
  });

  it("끝나는 날이 앞이면 안 된다", () => {
    expect(checkClassEvent({ title: "시험", start: "2026-12-14", end: "2026-12-10" }, TODAY).error).toMatch("앞");
  });

  it("이미 끝난 날짜는 안 되지만, 진행 중인 것은 된다", () => {
    expect(checkClassEvent({ title: "지난 것", start: "2026-11-20", end: "" }, TODAY).error).toMatch("지난");
    expect(checkClassEvent({ title: "진행 중", start: "2026-11-20", end: "2026-11-26" }, TODAY).event).toBeTruthy();
    expect(checkClassEvent({ title: "오늘", start: TODAY, end: "" }, TODAY).event).toBeTruthy();
  });
});

describe("upsertClassEvent · removeClassEvent", () => {
  const list = [ev("old", "2026-11-20"), ev("a", "2026-11-27"), ev("b", "2026-12-01")];
  const ids = ["new1", "new2"];
  const nextId = () => ids.shift();

  it("새로 넣으면 날짜 순 자리에 들어가고, 지난 일정은 빠진다", () => {
    const { list: got } = upsertClassEvent(list, { title: "체육복", start: "2026-11-25", end: "2026-11-25" }, TODAY, null, nextId);
    expect(got.map((e) => e.id)).toEqual(["new1", "a", "b"]);
  });

  it("고치면 같은 id 로 바뀐다", () => {
    const { list: got } = upsertClassEvent(list, { title: "바뀜", start: "2026-12-05", end: "2026-12-05" }, TODAY, "a");
    expect(got).toEqual([ev("b", "2026-12-01"), { id: "a", title: "바뀜", start: "2026-12-05", end: "2026-12-05" }]);
  });

  it("고칠 일정이 없으면 알려 준다", () => {
    expect(upsertClassEvent(list, ev("x", "2026-12-05"), TODAY, "old").error).toBeTruthy();
  });

  it(`${CLASS_EVENT_MAX}개가 차면 더 못 넣는다`, () => {
    const full = Array.from({ length: CLASS_EVENT_MAX }, (_, i) => ev(`e${i}`, "2026-12-01"));
    expect(upsertClassEvent(full, ev("x", "2026-12-05"), TODAY).error).toMatch(String(CLASS_EVENT_MAX));
  });

  it("지우기", () => {
    expect(removeClassEvent(list, "a", TODAY).map((e) => e.id)).toEqual(["b"]);
  });

  it("오늘 끝나는 일정은 남긴다", () => {
    expect(dropPastEvents([ev("t", "2026-11-23", TODAY)], TODAY)).toHaveLength(1);
  });
});

describe("makeEventId", () => {
  it("소문자·숫자 10자", () => {
    expect(makeEventId()).toMatch(/^[a-z0-9]{10}$/);
  });
});

describe("mergeUpcoming", () => {
  const school = [
    { id: "s1", title: "겨울방학", start: "2026-11-01", end: "2026-11-30", kind: "휴업일", off: false },
    { id: "s2", title: "학교공개의 날", start: "2026-11-27", end: "2026-11-27", kind: "", off: false },
    { id: "s3", title: "기독탄신일", start: "2026-12-25", end: "2026-12-25", kind: "공휴일", off: true },
    { id: "s0", title: "지난 것", start: "2026-11-02", end: "2026-11-02", kind: "", off: false },
  ];
  const mine = [ev("a", "2026-11-25", undefined, "체육복"), ev("b", "2026-11-27", undefined, "수행평가")];

  it("날짜 순으로 섞고, 같은 날이면 우리 반 일정 먼저", () => {
    const got = mergeUpcoming(school, mine, TODAY, 5);
    expect(got.map((e) => e.title)).toEqual(["겨울방학", "체육복", "수행평가", "학교공개의 날", "기독탄신일"]);
    expect(got[1]).toMatchObject({ id: "class|a", mine: true, kind: "" });
    expect(got[0].mine).toBeUndefined();
  });

  it("limit 개만", () => {
    expect(mergeUpcoming(school, mine, TODAY, 3)).toHaveLength(3);
  });

  it("한쪽이 없어도 된다", () => {
    expect(mergeUpcoming([], mine, TODAY).map((e) => e.title)).toEqual(["체육복", "수행평가"]);
    expect(mergeUpcoming(school, undefined, TODAY, 2).map((e) => e.title)).toEqual(["겨울방학", "학교공개의 날"]);
  });
});
