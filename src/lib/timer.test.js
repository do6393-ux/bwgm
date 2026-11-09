import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION,
  MAX_DURATION,
  MINUTE,
  SECOND,
  clampDuration,
  describeDuration,
  digits2,
  durationFromInput,
  formatClock,
  parseTimerParam,
  remainingAt,
  remainingRatio,
  timerPhase,
} from "./timer";

describe("formatClock", () => {
  it("분:초 두 자리", () => {
    expect(formatClock(5 * MINUTE)).toBe("05:00");
    expect(formatClock(61 * SECOND)).toBe("01:01");
    expect(formatClock(MAX_DURATION)).toBe("99:59");
  });
  it("남은 조각 시간은 올려서 보여 주고, 0 이하만 00:00", () => {
    expect(formatClock(200)).toBe("00:01");
    expect(formatClock(59_001)).toBe("01:00");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-500)).toBe("00:00");
  });
});

describe("clampDuration", () => {
  it("10초 ~ 99분 59초, 초 단위로 맞춘다", () => {
    expect(clampDuration(3 * SECOND)).toBe(10 * SECOND);
    expect(clampDuration(200 * MINUTE)).toBe(MAX_DURATION);
    expect(clampDuration(90_400)).toBe(90 * SECOND);
  });
  it("숫자가 아니면 기본값", () => {
    expect(clampDuration(NaN)).toBe(DEFAULT_DURATION);
    expect(clampDuration(undefined)).toBe(DEFAULT_DURATION);
  });
});

describe("describeDuration", () => {
  it("말로 읽는 길이", () => {
    expect(describeDuration(5 * MINUTE)).toBe("5분");
    expect(describeDuration(90 * SECOND)).toBe("1분 30초");
    expect(describeDuration(45 * SECOND)).toBe("45초");
  });
});

describe("parseTimerParam", () => {
  it("숫자는 분", () => {
    expect(parseTimerParam("5")).toBe(5 * MINUTE);
    expect(parseTimerParam("1.5")).toBe(90 * SECOND);
  });
  it("s 는 초, 분:초", () => {
    expect(parseTimerParam("90s")).toBe(90 * SECOND);
    expect(parseTimerParam("2:30")).toBe(150 * SECOND);
  });
  it("범위 밖은 잘라 내고, 읽을 수 없으면 null", () => {
    expect(parseTimerParam("500")).toBe(MAX_DURATION);
    expect(parseTimerParam("")).toBeNull();
    expect(parseTimerParam(null)).toBeNull();
    expect(parseTimerParam("abc")).toBeNull();
    expect(parseTimerParam("2:75")).toBeNull();
  });
});

describe("durationFromInput", () => {
  it("분·초를 시간으로", () => {
    expect(durationFromInput("7", "")).toBe(7 * MINUTE);
    expect(durationFromInput("12", "30")).toBe(12 * MINUTE + 30 * SECOND);
    expect(durationFromInput("", "45")).toBe(45 * SECOND);
  });
  it("60초 이상은 분으로 넘기고, 범위 밖은 잘라 낸다", () => {
    expect(durationFromInput("0", "90")).toBe(90 * SECOND);
    expect(durationFromInput("0", "3")).toBe(10 * SECOND);
    expect(durationFromInput("99", "99")).toBe(MAX_DURATION);
  });
  it("숫자가 아닌 글자는 버리고, 둘 다 비면 null", () => {
    expect(durationFromInput("5분", "")).toBe(5 * MINUTE);
    expect(durationFromInput("", "")).toBeNull();
    expect(durationFromInput("ab", "")).toBeNull();
  });
});

describe("digits2", () => {
  it("숫자만 두 자리까지", () => {
    expect(digits2("1a2b3")).toBe("12");
    expect(digits2(null)).toBe("");
  });
});

describe("remainingAt / remainingRatio", () => {
  it("끝나는 시각까지 남은 시간", () => {
    expect(remainingAt(10_000, 4_000)).toBe(6_000);
    expect(remainingAt(10_000, 12_000)).toBe(0);
  });
  it("남은 비율", () => {
    expect(remainingRatio(30 * SECOND, MINUTE)).toBe(0.5);
    expect(remainingRatio(0, MINUTE)).toBe(0);
    expect(remainingRatio(5, 0)).toBe(0);
  });
});

describe("timerPhase", () => {
  it("단계", () => {
    expect(timerPhase(5 * MINUTE, 10 * MINUTE)).toBe("normal");
    expect(timerPhase(50 * SECOND, 10 * MINUTE)).toBe("last-minute");
    expect(timerPhase(9 * SECOND, 10 * MINUTE)).toBe("final");
    expect(timerPhase(0, 10 * MINUTE)).toBe("done");
  });
  it("1분 이하로 맞췄으면 '마지막 1분' 색은 건너뛴다", () => {
    expect(timerPhase(50 * SECOND, MINUTE)).toBe("normal");
  });
});
