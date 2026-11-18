import { describe, it, expect } from "vitest";
import { spinStep, SPIN_MAX, LINGER_S } from "./iconSpin";

const FRAME = 1 / 60;
// from 초부터 to 초까지 화면마다 돌린 상태들
function run(s, from, to) {
  const out = [];
  for (let now = from + FRAME; now <= to + 1e-9; now += FRAME) {
    s = spinStep(s, now, FRAME);
    out.push({ now, ...s });
  }
  return out;
}
const still = { angle: 0, omega: 0, leaveAt: null, w0: null };

describe("정보 수업 바람개비 속도", () => {
  it("마우스를 올리면 1초 동안 점점 빨라져 최고 속도가 된다", () => {
    const frames = run(still, 0, 1.5);
    const at = (t) => frames.find((f) => f.now >= t - 1e-9).omega;
    expect(at(0.25)).toBeLessThan(at(0.5));
    expect(at(0.5)).toBeCloseTo(SPIN_MAX / 2, -1);
    expect(at(0.5)).toBeLessThan(at(0.9));
    expect(at(1.01)).toBe(SPIN_MAX);
    expect(at(1.5)).toBe(SPIN_MAX);
  });

  it("올려 둔 동안에는 최고 속도(2초에 한 바퀴)로 계속 돈다", () => {
    const frames = run({ ...still, omega: SPIN_MAX }, 0, 10);
    expect(frames.every((f) => f.omega === SPIN_MAX && !f.done)).toBe(true);
  });

  it("떼면 2초는 그대로, 마지막 1초에 점점 느려져 3초에 멈춘다", () => {
    const frames = run({ ...still, omega: SPIN_MAX, leaveAt: 0 }, 0, 3.2);
    const at = (t) => frames.find((f) => f.now >= t - 1e-9);
    expect(at(1.9).omega).toBe(SPIN_MAX);
    expect(at(2.25).omega).toBeLessThan(SPIN_MAX);
    expect(at(2.5).omega).toBeCloseTo(SPIN_MAX / 2, -1);
    expect(at(2.75).omega).toBeLessThan(at(2.5).omega);
    expect(at(2.99).omega).toBeLessThan(10);
    expect(at(LINGER_S + 0.01).omega).toBe(0);
    expect(at(LINGER_S + 0.01).done).toBe(true);
    expect(at(2.9).done).toBe(false);
  });

  it("휴대폰처럼 누르자마자 떼면: 1초 빨라지고, 1초 최고 속도, 1초 느려져 3초에 멈춘다", () => {
    const frames = run({ ...still, leaveAt: 0 }, 0, 3.1);
    const at = (t) => frames.find((f) => f.now >= t - 1e-9);
    expect(at(0.5).omega).toBeLessThan(SPIN_MAX);
    expect(at(1.5).omega).toBe(SPIN_MAX);
    expect(at(2.5).omega).toBeLessThan(SPIN_MAX);
    expect(at(3.05).done).toBe(true);
  });

  it("느려지는 중에 다시 올리면 멈추지 않고 다시 빨라진다", () => {
    let s = run({ ...still, omega: SPIN_MAX, leaveAt: 0 }, 0, 2.6).at(-1);
    const slowed = s.omega;
    s = { ...s, leaveAt: null };
    const frames = run(s, 2.6, 4);
    expect(frames[0].omega).toBeGreaterThan(slowed);
    expect(frames.at(-1).omega).toBe(SPIN_MAX);
    expect(frames.some((f) => f.done)).toBe(false);
  });

  it("시곗바늘: 분침(1초 한 바퀴)과 시침(12초 한 바퀴)이 같은 비율로 빨라지고 느려져 12:1 을 지킨다", () => {
    const frames = (max) => run({ ...still, max, leaveAt: 1.5 }, 0, 4.6);
    const minute = frames(360), hour = frames(30);
    const at = (fs, t) => fs.find((f) => f.now >= t - 1e-9);
    expect(at(minute, 0.5).omega).toBeCloseTo(180, -1);
    expect(at(minute, 2).omega).toBe(360);
    expect(at(hour, 2).omega).toBe(30);
    for (const t of [0.3, 1, 2, 4, 4.4]) {
      expect(at(minute, t).omega).toBeCloseTo(at(hour, t).omega * 12, 6);
    }
    expect(at(minute, 4.55).done).toBe(true);
    expect(at(hour, 4.55).done).toBe(true);
    // 분침이 돈 각도의 1/12 만큼 시침이 돈다 (멈춘 뒤에도 시각이 맞는다)
    const turned = (fs) => fs.reduce((sum, f) => sum + f.omega * FRAME, 0);
    expect(turned(minute)).toBeCloseTo(turned(hour) * 12, 6);
  });

  it("각도는 0~360 안에서 돈다", () => {
    const frames = run({ ...still, omega: SPIN_MAX }, 0, 5);
    expect(frames.every((f) => f.angle >= 0 && f.angle < 360)).toBe(true);
  });
});
