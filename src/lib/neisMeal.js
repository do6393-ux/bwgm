// NEIS 급식 조회 (교무실 급식 칸과 "오늘 한눈에" 카드가 같이 쓴다).
const OFFICE_CODE = "E10"; // 인천광역시교육청
const SCHOOL_CODE = "7331057"; // 부원여자중학교

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
  const dateStr = date.replace(/-/g, "");
  // NEIS 인증키는 소스에 두지 않고 환경변수(VITE_NEIS_KEY)로 주입. 없으면 키 없는 샘플 호출로 대체.
  const baseUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=10&ATPT_OFCDC_SC_CODE=${OFFICE_CODE}&SD_SCHUL_CODE=${SCHOOL_CODE}&MLSV_YMD=${dateStr}`;
  const neisKey = import.meta.env.VITE_NEIS_KEY;
  const urls = neisKey ? [`${baseUrl}&KEY=${neisKey}`, baseUrl] : [baseUrl];

  let data = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.mealServiceDietInfo || json.RESULT?.CODE === "INFO-200") {
        data = json;
        break;
      }
    } catch {
      // 네트워크 오류나 JSON 이 아닌 응답이면 다음 주소를 시도한다
    }
  }
  if (!data) return { status: "error", list: [], kcal: "" };

  const rows = data.mealServiceDietInfo?.[1]?.row;
  const lunch = rows?.find((r) => r.MMEAL_SC_NM === "중식" || r.MMEAL_SC_CODE === "2") || rows?.[0];
  const list = parseDishes(lunch?.DDISH_NM);
  return { status: list.length > 0 ? "ok" : "empty", list, kcal: String(lunch?.CAL_INFO || "").trim() };
}
