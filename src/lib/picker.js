// 발표자 뽑기의 계산 (화면과 분리해서 테스트한다).
// 명단은 쓰지 않는다: 반(학년-반)과 인원만 정하면 1번 ~ 인원번 중에서 번호로 뽑는다.
//
// 이 브라우저(localStorage "class_picker")에만 기억한다 (Firestore 안 씀)
//   { current: "1-3", style: "hop" | "slot", count: 1~4, noRepeat, sound,
//     classes: { "1-3": { size: 28, picked: [17, 3], absent: [5], absentDay: "2026-11-10" } } }
//   - picked: 뽑힌 순서. "처음부터"를 누를 때까지 남는다 (다음 시간에 이어서 뽑을 수 있다)
//   - absent: 결석으로 뺀 번호. 그날만 쓴다 (absentDay 가 오늘이 아니면 지운다)

export const SIZE_MIN = 1;
export const SIZE_MAX = 60;
export const SIZE_DEFAULT = 28;
export const GRADES = [1, 2, 3];
export const CLASS_MAX = 12;
export const PICK_COUNTS = [1, 2, 3, 4];
export const STYLES = [
  { id: "hop", label: "번호판 반짝" },
  { id: "slot", label: "슬롯머신" },
];

export const classKey = (grade, cls) => `${grade}-${cls}`;

/** "1-3" → { grade: 1, cls: 3 }. 형식이 틀리면 null */
export function parseClassKey(key) {
  const m = /^([1-3])-(\d{1,2})$/.exec(String(key ?? ""));
  if (!m) return null;
  const cls = Number(m[2]);
  return cls >= 1 && cls <= CLASS_MAX ? { grade: Number(m[1]), cls } : null;
}

/** 인원을 1~60 으로. 빈 칸이나 숫자가 아니면 fallback */
export function clampSize(value, fallback = SIZE_DEFAULT) {
  if (value === "" || value == null) return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, n));
}

const numbersIn = (list, size) => [
  ...new Set((Array.isArray(list) ? list : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= size)),
];

export const emptyClass = (size = SIZE_DEFAULT) => ({ size, picked: [], absent: [], absentDay: "" });

export const DEFAULT_PICKER = { current: "1-1", style: "hop", count: 1, noRepeat: true, sound: true, classes: {} };

/** 저장된 값(JSON 글자 또는 객체) → 쓸 수 있는 모양. 망가졌으면 기본값. 결석은 오늘 표시한 것만 남긴다 */
export function restorePicker(raw, today) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  if (!data || typeof data !== "object") return { ...DEFAULT_PICKER, classes: {} };
  const classes = {};
  const saved = data.classes && typeof data.classes === "object" ? data.classes : {};
  for (const [key, c] of Object.entries(saved)) {
    if (!parseClassKey(key) || !c || typeof c !== "object") continue;
    const size = clampSize(c.size);
    const sameDay = c.absentDay === today;
    classes[key] = {
      size,
      picked: numbersIn(c.picked, size),
      absent: sameDay ? numbersIn(c.absent, size) : [],
      absentDay: sameDay ? today : "",
    };
  }
  return {
    current: parseClassKey(data.current) ? data.current : DEFAULT_PICKER.current,
    style: STYLES.some((s) => s.id === data.style) ? data.style : DEFAULT_PICKER.style,
    count: PICK_COUNTS.includes(data.count) ? data.count : DEFAULT_PICKER.count,
    noRepeat: data.noRepeat !== false,
    sound: data.sound !== false,
    classes,
  };
}

/** 그 반의 상태 (처음 고른 반이면 빈 상태) */
export const classOf = (picker, key = picker.current) => picker.classes[key] ?? emptyClass();

/** 한 반의 상태만 바꾼 새 picker */
export const updateClass = (picker, key, fn) => ({ ...picker, classes: { ...picker.classes, [key]: fn(classOf(picker, key)) } });

/** 뽑을 수 있는 번호: 결석은 빼고, noRepeat 이면 이미 뽑힌 번호도 뺀다 */
export function availableNumbers(cls, noRepeat = true) {
  const out = [];
  for (let n = 1; n <= cls.size; n++) {
    if (!cls.absent.includes(n) && !(noRepeat && cls.picked.includes(n))) out.push(n);
  }
  return out;
}

/** 0 ~ k-1 무작위 정수. 가능하면 crypto 로 (치우침 없이) */
export function randomInt(k) {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const limit = Math.floor(2 ** 32 / k) * k;
    const buf = new Uint32Array(1);
    do c.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % k;
  }
  return Math.floor(Math.random() * k);
}

/** pool 에서 서로 다른 번호 n 개 (pool 이 모자라면 있는 만큼) */
export function pickNumbers(pool, n, rand = randomInt) {
  const a = [...pool];
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + rand(a.length - i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

/** 뽑힌 번호 기록에 더한다. 이미 있으면(중복 허용으로 다시 뽑힘) 맨 뒤로 옮긴다 */
export const addPicked = (cls, n) => ({ ...cls, picked: [...cls.picked.filter((x) => x !== n), n] });

/** 번호판의 번호를 눌렀을 때: 뽑힌 번호면 뽑기 취소, 결석이면 출석, 아니면 결석(오늘) */
export function toggleNumber(cls, n, today) {
  if (cls.picked.includes(n)) return { ...cls, picked: cls.picked.filter((x) => x !== n) };
  if (cls.absent.includes(n)) return { ...cls, absent: cls.absent.filter((x) => x !== n) };
  return { ...cls, absent: [...cls.absent, n].sort((a, b) => a - b), absentDay: today };
}

/** 인원을 바꾼다. 줄이면 그보다 큰 번호는 뽑힌·결석 목록에서 뺀다 */
export function resizeClass(cls, size) {
  const s = clampSize(size, cls.size);
  return { ...cls, size: s, picked: cls.picked.filter((n) => n <= s), absent: cls.absent.filter((n) => n <= s) };
}

/**
 * "번호판 반짝"의 기다리는 시간(ms) 목록: 빠르게 시작해서 점점 느려진다.
 * 첫 번째 뽑기는 2.5초쯤, 여러 명일 때 두 번째부터는 1초쯤.
 */
export function hopDelays(first = true) {
  const [start, end, grow] = first ? [45, 330, 1.11] : [38, 180, 1.13];
  const out = [];
  for (let d = start; d < end; d *= grow) out.push(Math.round(d));
  return out;
}

/**
 * 불빛이 지나갈 번호 length 개. 바로 앞과 같은 번호는 피하고,
 * 마지막은 뽑힐 번호(target)가 아니게 한다 (그래야 마지막에 옮겨 가서 멈추는 게 보인다).
 * 고를 번호가 하나뿐이면 지나갈 곳이 없으니 빈 목록.
 */
export function hopSequence(pool, target, length, rand = randomInt) {
  if (pool.length < 2) return [];
  const others = pool.filter((n) => n !== target);
  const seq = [];
  let prev = null;
  for (let i = 0; i < length; i++) {
    const base = i === length - 1 ? others : pool;
    const choices = base.filter((n) => n !== prev);
    const list = choices.length ? choices : others;
    const x = list[rand(list.length)];
    seq.push(x);
    prev = x;
  }
  return seq;
}

/** "슬롯머신" 릴에 늘어놓을 번호: 무작위 length-1 개(바로 앞과 겹치지 않게) + 마지막에 뽑힐 번호 */
export function reelSequence(pool, target, length, rand = randomInt) {
  const seq = [];
  let prev = null;
  for (let i = 0; i < length - 1; i++) {
    const list = pool.length > 1 ? pool.filter((n) => n !== prev) : pool;
    const x = list.length ? list[rand(list.length)] : target;
    seq.push(x);
    prev = x;
  }
  seq.push(target);
  return seq;
}
