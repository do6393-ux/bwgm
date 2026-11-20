import { describe, expect, it, vi } from "vitest";
import { createRaiser, isEscToLower, noticeKey } from "./classroomApp";

describe("isEscToLower", () => {
  it("Esc 를 누르면 내린다", () => {
    expect(isEscToLower({ key: "Escape", target: { tagName: "DIV" } })).toBe(true);
    expect(isEscToLower({ key: "Escape", target: null })).toBe(true);
  });
  it("채팅 입력칸에서 쓰는 중이거나, 다른 키·누르고 있는 키면 내리지 않는다", () => {
    expect(isEscToLower({ key: "Escape", target: { tagName: "INPUT" } })).toBe(false);
    expect(isEscToLower({ key: "Escape", target: { tagName: "TEXTAREA" } })).toBe(false);
    expect(isEscToLower({ key: "Escape", target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
    expect(isEscToLower({ key: "Escape", repeat: true, target: { tagName: "DIV" } })).toBe(false);
    expect(isEscToLower({ key: "Enter", target: { tagName: "DIV" } })).toBe(false);
  });
  it("학교 지도처럼 다른 곳이 먼저 쓴 Esc 면 내리지 않는다", () => {
    expect(isEscToLower({ key: "Escape", defaultPrevented: true, target: { tagName: "DIV" } })).toBe(false);
  });
});

const at = new Date(2026, 10, 16, 10, 0);

describe("noticeKey", () => {
  it("글이나 그림이 있으면 띄운 시각", () => {
    expect(noticeKey({ noticeText: "과학실로", noticeAt: at })).toBe(at.getTime());
    expect(noticeKey({ noticeText: "", noticeDrawing: "[]", noticeAt: at })).toBe(at.getTime());
  });
  it("메시지가 없거나 시각이 없으면 null", () => {
    expect(noticeKey({ noticeText: "  ", noticeAt: at })).toBe(null);
    expect(noticeKey({ noticeText: "", noticeAt: null })).toBe(null);
    expect(noticeKey({ noticeText: "과학실로", noticeAt: null })).toBe(null);
    expect(noticeKey(null)).toBe(null);
  });
});

function setup(wasDown = true) {
  const app = { raise: vi.fn(() => wasDown), lower: vi.fn() };
  const timers = [];
  const raiser = createRaiser(app, {
    delay: 1000,
    setTimer: (fn) => timers.push(fn) - 1,
    clearTimer: (id) => {
      timers[id] = null;
    },
  });
  const fire = () => timers.forEach((fn, i) => fn && (timers[i] = null, fn()));
  return { app, raiser, fire };
}

describe("createRaiser", () => {
  it("처음 알게 된 메시지로는 올리지 않는다", async () => {
    const { app, raiser } = setup();
    await raiser.update(undefined);
    await raiser.update(1);
    await raiser.update(1);
    expect(app.raise).not.toHaveBeenCalled();
  });

  it("새 메시지가 오면 올리고, 아무도 안 누르면 다시 내린다", async () => {
    const { app, raiser, fire } = setup();
    await raiser.update(null);
    await raiser.update(5);
    expect(app.raise).toHaveBeenCalledTimes(1);
    fire();
    await Promise.resolve();
    expect(app.lower).toHaveBeenCalledTimes(1);
  });

  it("메시지를 지우면(null) 올리지 않는다", async () => {
    const { app, raiser } = setup();
    await raiser.update(5);
    await raiser.update(null);
    expect(app.raise).not.toHaveBeenCalled();
  });

  it("누가 화면을 누르면 내리지 않는다", async () => {
    const { app, raiser, fire } = setup();
    await raiser.update(null);
    await raiser.update(5);
    raiser.touched();
    fire();
    await Promise.resolve();
    expect(app.lower).not.toHaveBeenCalled();
  });

  it("이미 떠 있던 화면이면 내리지 않는다", async () => {
    const { app, raiser, fire } = setup(false);
    await raiser.update(null);
    await raiser.update(5);
    expect(app.raise).toHaveBeenCalledTimes(1);
    fire();
    await Promise.resolve();
    expect(app.lower).not.toHaveBeenCalled();
  });

  it("raise 가 실패해도 멈추지 않는다", async () => {
    const app = { raise: vi.fn(() => Promise.reject(new Error("x"))), lower: vi.fn() };
    const raiser = createRaiser(app, { setTimer: () => 0, clearTimer: () => {} });
    await raiser.update(null);
    await expect(raiser.update(5)).resolves.toBeUndefined();
  });
});
