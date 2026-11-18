// 머리글 "buwon informatics" 자리에 서 있는 3D 조각 (src/components/layout/LogoBust.jsx) 의 계산.
// three 를 부르지 않는 부분만 여기에 두어 머리글이 가볍게 쓰고, 테스트도 한다.
//
// - 조각을 누를 때마다 LOOKS 순서대로 다음 모양으로 바뀌고, 마지막 다음은 처음으로 돌아간다.
// - 고른 모양은 이 브라우저(localStorage "logo_bust_look")에만 기억한다 (Firestore 안 씀).
// - 조각은 화면 어디에 있든 마우스 쪽으로 고개를 돌린다 (headAim).

export const LOOKS = [
  { id: "white", name: "흰색" },
  { id: "marble", name: "흰 대리석" },
  { id: "black", name: "검은 대리석" },
  { id: "bronze", name: "청동" },
  { id: "gold", name: "금" },
  { id: "chrome", name: "은색 거울" },
  { id: "clay", name: "테라코타" },
  { id: "orange", name: "포털 주황" },
  { id: "pink", name: "연한 핑크" },
];

export const STORAGE_KEY = "logo_bust_look";
const DEFAULT_LOOK = LOOKS[0].id;
const indexOf = (id) => LOOKS.findIndex((l) => l.id === id);

/** 누르면 나올 다음 모양. 모르는 값이면 처음 모양 */
export function nextLook(id) {
  const i = indexOf(id);
  return LOOKS[(i + 1) % LOOKS.length].id;
}

/** "금 · 5/9" 처럼 이름과 순서 */
export function lookLabel(id) {
  const i = Math.max(0, indexOf(id));
  return `${LOOKS[i].name} · ${i + 1}/${LOOKS.length}`;
}

/** 이 브라우저에 기억한 모양. 없거나 이상하거나 저장소를 못 쓰면 흰색 */
export function readSavedLook(storage = globalThis.localStorage) {
  try {
    const v = storage?.getItem(STORAGE_KEY);
    return indexOf(v) >= 0 ? v : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

export function saveLook(id, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, id);
  } catch {
    // 저장소를 못 쓰는 브라우저(사생활 보호 창 등): 이번에만 그 모양으로 보인다
  }
}

const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 마우스 쪽으로 돌릴 각도(라디안). yaw 는 + 가 오른쪽, pitch 는 + 가 아래(고개 숙임).
 *  - pointer: { x, y } 화면 좌표, 마우스가 창 밖이면 null → 정면
 *  - rect: 조각 상자의 getBoundingClientRect(). 눈높이는 상자 위에서 42% 쯤
 *  - reach: 조각이 화면 앞으로 얼마나 떨어져 서 있다고 칠지(px). 클수록 덜 돌아간다
 */
export function headAim(pointer, rect, { reach = 520, maxYaw = 30, maxUp = 14, maxDown = 18 } = {}) {
  if (!pointer || !rect) return { yaw: 0, pitch: 0 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height * 0.42;
  return {
    yaw: clamp(Math.atan2(pointer.x - cx, reach), -maxYaw * RAD, maxYaw * RAD),
    pitch: clamp(Math.atan2(pointer.y - cy, reach), -maxUp * RAD, maxDown * RAD),
  };
}
