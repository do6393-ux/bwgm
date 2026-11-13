// NEIS 급식 조회 (교무실 급식 칸과 "오늘 한눈에" 카드가 같이 쓴다).
import { neisGet, neisRows } from "@/lib/neis";

/** NEIS 의 요리 이름 문자열 → 줄 목록 (알레르기 번호 "(1.5.6)" 은 뺀다) */
export function parseDishes(ddishNm) {
  return String(ddishNm || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\([0-9.\s]+\)/g, "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 하루 중식. date: "YYYY-MM-DD"
 * 반환 { status, list, kcal }
 *   status: "ok" 급식 있음 | "empty" 응답은 받았지만 그날 급식 없음(주말·휴업일) | "error" 응답을 받지 못함
 */
export async function fetchLunch(date) {
  const data = await neisGet("mealServiceDietInfo", { pSize: "10", MLSV_YMD: date.replace(/-/g, "") });
  if (!data) return { status: "error", list: [], kcal: "" };

  const { rows } = neisRows(data, "mealServiceDietInfo");
  const lunch = rows.find((r) => r.MMEAL_SC_NM === "중식" || r.MMEAL_SC_CODE === "2") || rows[0];
  const list = parseDishes(lunch?.DDISH_NM);
  return { status: list.length > 0 ? "ok" : "empty", list, kcal: String(lunch?.CAL_INFO || "").trim() };
}
