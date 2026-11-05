// Firestore 는 "배열 안의 배열"(2차원 배열)을 저장하지 못한다.
// setDoc 이 "Nested arrays are not supported" 로 실패하는데, 예전에는 이 오류를 콘솔에만 남겨서
// 자리배치·청소구역이 서버에 올라가지 않고 그 기기에만 남았다 (그래서 다른 기기에서는 항상 빈 자리).
//
// 자리 표(줄 × 칸)와 기피 짝([[1,2]])은 화면에서 2차원 배열로 쓰고,
// 서버에 올릴 때만 한 겹 풀어서( {cells:[…]} , {a, b} ) 저장한 뒤 읽을 때 되돌린다.
// 되돌릴 때는 예전 모양(2차원 그대로)도 받아 준다.

/** [[칸, 칸], [칸, 칸]] → [{cells:[칸, 칸]}, {cells:[칸, 칸]}] */
export function encodeGrid(grid) {
  return Array.isArray(grid) ? grid.map((cells) => ({ cells: Array.isArray(cells) ? cells : [] })) : grid;
}

/** 서버(또는 예전) 모양 → 화면에서 쓰는 2차원 배열. 알 수 없는 모양이면 null */
export function decodeGrid(stored) {
  if (!Array.isArray(stored)) return null;
  return stored.map((row) => (Array.isArray(row) ? row : Array.isArray(row?.cells) ? row.cells : []));
}

/** [[1,2],[3,4]] → [{a:1,b:2},{a:3,b:4}] */
export function encodePairs(pairs) {
  return (Array.isArray(pairs) ? pairs : []).map((p) => ({ a: p?.[0], b: p?.[1] }));
}

/** 서버(또는 예전) 모양 → [[1,2],[3,4]] */
export function decodePairs(stored) {
  if (!Array.isArray(stored)) return [];
  return stored.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p?.a, p?.b])).filter(([a, b]) => a != null && b != null);
}

/** 자리배치 문서: 화면 모양 → 서버에 올릴 모양 */
export function toSeatingDoc(data) {
  return { ...data, grid: encodeGrid(data.grid), avoidPairs: encodePairs(data.avoidPairs) };
}

/** 자리배치 문서: 서버(또는 이 기기에 저장된) 모양 → 화면 모양 */
export function fromSeatingDoc(data) {
  return { ...data, grid: decodeGrid(data.grid), avoidPairs: decodePairs(data.avoidPairs) };
}
