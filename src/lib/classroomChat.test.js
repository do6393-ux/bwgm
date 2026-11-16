import { describe, expect, it } from "vitest";
import {
  NOTICE_MAX,
  SCREEN_ID_LENGTH,
  cleanText,
  clockLabel,
  drawingToday,
  isScreenId,
  lastStudentRead,
  makeScreenId,
  newReplies,
  noticeToday,
  screenLink,
  todayMessages,
  unreadFromStudents,
} from "./classroomChat";

const at = (d, hh, mm) => new Date(2026, 10, d, hh, mm); // 2026년 11월 d일

describe("교실 화면 주소", () => {
  it("무작위 글자 24자, 규칙과 같은 모양", () => {
    const id = makeScreenId();
    expect(id).toHaveLength(SCREEN_ID_LENGTH);
    expect(isScreenId(id)).toBe(true);
    expect(makeScreenId()).not.toBe(id);
  });

  it("248 이상인 바이트는 버린다 (글자가 고르게 나오도록)", () => {
    let call = 0;
    const fake = (n) => {
      call++;
      // 첫 묶음은 모두 버릴 값, 다음 묶음은 0 → "A"
      return new Uint8Array(n).fill(call === 1 ? 250 : 0);
    };
    expect(makeScreenId(fake)).toBe("A".repeat(SCREEN_ID_LENGTH));
  });

  it("isScreenId", () => {
    expect(isScreenId("abcDEF0123456789xyzQ")).toBe(true); // 20자
    expect(isScreenId("짧은값")).toBe(false);
    expect(isScreenId("abc/../def0123456789xyz")).toBe(false);
    expect(isScreenId(null)).toBe(false);
  });

  it("screenLink", () => {
    expect(screenLink("https://portal.example", "AbC123")).toBe("https://portal.example/?classroom=AbC123");
  });
});

describe("선생님 메시지", () => {
  it("cleanText: 줄바꿈·겹친 빈칸을 한 칸으로, 길이 자르기", () => {
    expect(cleanText("  5교시는\n\n과학실   ", NOTICE_MAX)).toBe("5교시는 과학실");
    expect(cleanText("가".repeat(60), NOTICE_MAX)).toHaveLength(NOTICE_MAX);
    expect(cleanText(undefined, 10)).toBe("");
  });

  it("noticeToday: 띄운 날에만 보인다", () => {
    const screen = { noticeText: "종례 없이 하교", noticeDay: "2026-11-16" };
    expect(noticeToday(screen, "2026-11-16")).toBe("종례 없이 하교");
    expect(noticeToday(screen, "2026-11-17")).toBe("");
    expect(noticeToday({ noticeText: "  ", noticeDay: "2026-11-16" }, "2026-11-16")).toBe("");
    expect(noticeToday(null, "2026-11-16")).toBe("");
  });
});

describe("선생님 그림", () => {
  const drawing = JSON.stringify([{ c: 1, w: 0, p: [10, 10, 40, 40] }]);
  it("drawingToday: 띄운 날에만, 그린 것이 있을 때만", () => {
    expect(drawingToday({ noticeDrawing: drawing, noticeDay: "2026-11-16" }, "2026-11-16")).toEqual([{ c: 1, w: 0, p: [10, 10, 40, 40] }]);
    expect(drawingToday({ noticeDrawing: drawing, noticeDay: "2026-11-16" }, "2026-11-17")).toBe(null);
    expect(drawingToday({ noticeDrawing: "", noticeDay: "2026-11-16" }, "2026-11-16")).toBe(null);
    expect(drawingToday(null, "2026-11-16")).toBe(null);
  });
});

describe("채팅", () => {
  const list = [
    { id: "c", from: "teacher", text: "괜찮아", at: at(16, 10, 7) },
    { id: "old", from: "student", text: "어제 것", at: at(15, 14, 0) },
    { id: "a", from: "student", text: "선생님", at: at(16, 10, 5) },
    { id: "d", from: "student", text: "감사합니다", at: at(16, 10, 8) },
  ];
  const now = at(16, 10, 12);

  it("todayMessages: 오늘 것만, 오래된 것부터", () => {
    expect(todayMessages(list, now).map((m) => m.id)).toEqual(["a", "c", "d"]);
  });

  it("todayMessages: 서버 시각이 아직 없는 메시지는 지금 보낸 것으로 본다", () => {
    const res = todayMessages([...list, { id: "new", from: "student", text: "방금", at: null }], now);
    expect(res.at(-1).id).toBe("new");
    expect(res.at(-1).at).toBe(now);
  });

  it("unreadFromStudents · lastStudentRead", () => {
    const today = todayMessages(list, now);
    expect(unreadFromStudents(today, null).map((m) => m.id)).toEqual(["a", "d"]);
    expect(unreadFromStudents(today, at(16, 10, 6)).map((m) => m.id)).toEqual(["d"]);
    expect(lastStudentRead(today, at(16, 10, 6))).toBe(false);
    expect(lastStudentRead(today, at(16, 10, 8))).toBe(true);
    expect(lastStudentRead(today, null)).toBe(false);
    expect(lastStudentRead([], null)).toBe(null);
  });

  it("newReplies: 본 뒤에 온 선생님 답장만", () => {
    const today = todayMessages(list, now);
    expect(newReplies(today, at(16, 10, 0))).toBe(1);
    expect(newReplies(today, at(16, 10, 7))).toBe(0);
  });

  it("clockLabel", () => {
    expect(clockLabel(at(16, 9, 5))).toBe("09:05");
    expect(clockLabel(null)).toBe("");
  });
});
