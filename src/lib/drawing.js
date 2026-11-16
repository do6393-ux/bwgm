// 선생님 그림 메시지(교실 화면): 획 저장·읽기·그리기 계산 (화면·Firebase 와 분리해서 테스트한다).
// 그림 좌표는 1600×900 (16:9) 정수. 교실 TV 바탕색 위에 그대로 그리고, SVG 라 TV 크기에 맞게 선명하게 늘어난다.
// 저장 모양: JSON 문자열 [{ c: 색 번호(지우개는 -1), w: 굵기 번호, p: [x, y, x, y, ...] }]
//   (Firestore 는 배열 안에 배열을 못 넣어서 통째로 문자열로 둔다)

export const DRAW_W = 1600;
export const DRAW_H = 900;
export const DRAW_BG = "#2b2b2b"; // 교실 화면 바탕색과 같게

export const PEN_COLORS = [
  { name: "흰색", hex: "#f5f5f5" },
  { name: "노란색", hex: "#fbbf24" },
  { name: "초록색", hex: "#34d399" },
  { name: "빨간색", hex: "#f87171" },
];
export const PEN_WIDTHS = [
  { name: "가늘게", px: 8 },
  { name: "굵게", px: 18 },
];
export const ERASER = -1; // 지우개 획은 바탕색으로 굵게 칠한다
export const ERASER_WIDTH = 56;

export const DRAWING_MAX_CHARS = 200000; // firestore.rules 의 noticeDrawing 길이와 같게 둘 것
const MIN_STEP = 4; // 바로 앞 점과 이만큼(그림 좌표)보다 가까우면 점을 더하지 않는다

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function strokeColor(c) {
  return c === ERASER ? DRAW_BG : PEN_COLORS[c]?.hex || PEN_COLORS[0].hex;
}

export function strokeWidth(stroke) {
  return stroke.c === ERASER ? ERASER_WIDTH : PEN_WIDTHS[stroke.w]?.px || PEN_WIDTHS[0].px;
}

/** 화면 좌표 → 그림 좌표 (칸 밖으로 나가면 가장자리로) */
export function toDrawPoint(clientX, clientY, rect) {
  const x = Math.round(((clientX - rect.left) / rect.width) * DRAW_W);
  const y = Math.round(((clientY - rect.top) / rect.height) * DRAW_H);
  return [clamp(x, 0, DRAW_W), clamp(y, 0, DRAW_H)];
}

/** 획에 점을 더한 새 배열. 바로 앞 점과 너무 가까우면 그대로 돌려준다 */
export function addPoint(points, x, y) {
  const n = points.length;
  if (n >= 2) {
    const dx = x - points[n - 2];
    const dy = y - points[n - 1];
    if (dx * dx + dy * dy < MIN_STEP * MIN_STEP) return points;
  }
  return [...points, x, y];
}

/** 점 목록 → SVG path. 점 사이를 곡선으로 부드럽게 잇는다. 점 하나면 동그란 점 */
export function strokePath(p) {
  if (!p || p.length < 2) return "";
  if (p.length === 2) return `M${p[0]} ${p[1]}L${p[0]} ${p[1]}`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    d += `Q${p[i]} ${p[i + 1]} ${mx} ${my}`;
  }
  d += `L${p[p.length - 2]} ${p[p.length - 1]}`;
  return d;
}

/** 지우개 말고 그린 것이 있는지 */
export function hasInk(strokes) {
  return Array.isArray(strokes) && strokes.some((s) => s.c !== ERASER);
}

/** 획 목록 → 저장할 문자열 (그린 것이 없으면 "") */
export function encodeDrawing(strokes) {
  if (!hasInk(strokes)) return "";
  return JSON.stringify(strokes.map((s) => ({ c: s.c, w: s.w, p: s.p })));
}

/** 저장된 문자열 → 획 목록. 모양이 이상한 획은 버린다. 그린 것이 없으면 null */
export function parseDrawing(text) {
  if (typeof text !== "string" || !text) return null;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const strokes = [];
  for (const s of raw) {
    if (!s || !Array.isArray(s.p)) continue;
    const c = s.c === ERASER ? ERASER : Number.isInteger(s.c) && PEN_COLORS[s.c] ? s.c : null;
    if (c === null) continue;
    const w = Number.isInteger(s.w) && PEN_WIDTHS[s.w] ? s.w : 0;
    const p = [];
    for (let i = 0; i + 1 < s.p.length; i += 2) {
      const x = Number(s.p[i]);
      const y = Number(s.p[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) p.push(clamp(Math.round(x), 0, DRAW_W), clamp(Math.round(y), 0, DRAW_H));
    }
    if (p.length >= 2) strokes.push({ c, w, p });
  }
  return hasInk(strokes) ? strokes : null;
}
