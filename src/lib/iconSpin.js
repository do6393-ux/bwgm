// 머리글 "정보 수업" 바람개비·"교무실" 시곗바늘의 속도 계산 (src/components/layout/useIconMotion.js 가 화면마다 부른다).
// 사용자 요청(2026-11-18): 예전 속도를 최고로 두고, 마우스를 올리면 1초 동안 점점 빨라지고,
// 마우스를 떼도(휴대폰은 누른 뒤) 3초 동안 돌되 그 3초의 마지막 1초에 점점 느려지며 멈춘다.
// 최고 속도는 s.max(도/초)로 바늘마다 다르게 줄 수 있다. 없으면 SPIN_MAX.

export const SPIN_MAX = 180; // 도/초 = 2초에 한 바퀴 (바람개비)
export const SPIN_UP_S = 1; // 0 → 최고 속도까지
export const LINGER_S = 3; // 떼고 나서 더 도는 시간
export const SPIN_DOWN_S = 1; // 그중 마지막 이만큼 동안 0 까지 느려진다

/**
 * 한 화면만큼 돌린다.
 *  - s: { angle(도), omega(도/초), leaveAt(뗀 때, 초. 올려 둔 동안은 null), w0(느려지기 시작할 때 속도, 없으면 null),
 *         max(최고 속도 도/초, 없으면 SPIN_MAX) }
 *  - now: 지금(초), dt: 지난 화면부터 흐른 시간(초)
 *  - 반환: 다음 상태 + done(다 멈춤)
 */
export function spinStep(s, now, dt) {
  let { omega, w0 } = s;
  const max = s.max ?? SPIN_MAX;
  let done = false;
  const since = s.leaveAt == null ? -Infinity : now - s.leaveAt;
  if (since >= LINGER_S) {
    omega = 0;
    done = true;
  } else if (since >= LINGER_S - SPIN_DOWN_S) {
    if (w0 == null) w0 = omega;
    omega = w0 * ((LINGER_S - since) / SPIN_DOWN_S);
  } else {
    omega = Math.min(max, omega + (max * dt) / SPIN_UP_S);
    w0 = null;
  }
  const angle = (s.angle + omega * dt) % 360;
  return { ...s, angle, omega, w0, done };
}
