// 수업 타이머의 계산 (화면과 분리해서 테스트한다).
// 남은 시간은 "끝나는 시각(endAt)"에서 매번 계산한다. 1초씩 빼는 방식은 탭이 뒤로 가거나
// 컴퓨터가 바쁘면 느려지지만, 이렇게 하면 언제 다시 봐도 정확하다.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const MIN_DURATION = 10 * SECOND;
export const MAX_DURATION = 99 * MINUTE + 59 * SECOND;
export const DEFAULT_DURATION = 5 * MINUTE;
export const PRESET_MINUTES = [1, 3, 5, 10, 15, 20];

/** 맞출 수 있는 범위(10초 ~ 99분 59초)로 자른다. 숫자가 아니면 기본 5분 */
export function clampDuration(ms) {
  if (!Number.isFinite(ms)) return DEFAULT_DURATION;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(ms / SECOND) * SECOND));
}

/** 남은 시간 → "05:00". 남은 0.2초도 1초로 보여 준다 (00:00 은 정말 끝났을 때만) */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / SECOND));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 시간 길이를 말로: 90초 → "1분 30초", 5분 → "5분" */
export function describeDuration(ms) {
  const total = Math.round(ms / SECOND);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m && s) return `${m}분 ${s}초`;
  return m ? `${m}분` : `${s}초`;
}

/**
 * 주소의 ?timer= 값 → 시간(ms). 숫자는 분("5", "1.5"), "90s" 는 초, "2:30" 은 분:초.
 * 값이 없거나 읽을 수 없으면 null (그때는 마지막에 쓴 시간이나 기본값을 쓴다)
 */
export function parseTimerParam(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  let ms = null;
  let m;
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(v))) ms = Number(m[1]) * MINUTE + Number(m[2]) * SECOND;
  else if ((m = /^(\d+)\s*s$/.exec(v))) ms = Number(m[1]) * SECOND;
  else if (/^\d+(\.\d+)?$/.test(v)) ms = Number(v) * MINUTE;
  return ms === null ? null : clampDuration(ms);
}

/** 칸에 친 글자에서 숫자만 두 자리까지 */
export function digits2(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 2);
}

/**
 * 직접 입력한 분·초 → 시간(ms). 둘 다 비었으면 null (입력 취소).
 * 초가 60 이상이면 분으로 넘긴다 (0분 90초 → 1분 30초). 범위는 clampDuration 과 같다.
 */
export function durationFromInput(minutes, seconds) {
  const m = digits2(minutes);
  const s = digits2(seconds);
  if (!m && !s) return null;
  return clampDuration((Number(m || 0) * 60 + Number(s || 0)) * SECOND);
}

/** 끝나는 시각까지 남은 시간 (지났으면 0) */
export function remainingAt(endAt, now) {
  return Math.max(0, endAt - now);
}

/**
 * 남은 시간에 따른 단계 (글자 색·깜빡임을 정한다)
 *   done: 끝남 / final: 마지막 10초 / last-minute: 마지막 1분 (1분 넘게 맞췄을 때만) / normal
 */
export function timerPhase(remainingMs, totalMs) {
  if (remainingMs <= 0) return "done";
  if (remainingMs <= 10 * SECOND) return "final";
  if (totalMs > MINUTE && remainingMs <= MINUTE) return "last-minute";
  return "normal";
}

/** 진행 막대의 남은 비율 0~1 */
export function remainingRatio(remainingMs, totalMs) {
  if (!(totalMs > 0)) return 0;
  return Math.min(1, Math.max(0, remainingMs / totalMs));
}
