// 나이스(NEIS) 교육정보 개방 포털 공통 호출. 급식(neisMeal.js)과 학사일정(neisSchedule.js)이 같이 쓴다.
export const NEIS_OFFICE_CODE = "E10"; // 인천광역시교육청
export const NEIS_SCHOOL_CODE = "7331057"; // 부원여자중학교

/**
 * service: "mealServiceDietInfo" · "SchoolSchedule" 같은 나이스 서비스 이름
 * params: 학교 코드 말고 더 붙일 검색 조건
 * 반환: 응답 JSON (자료가 없을 때는 RESULT.CODE "INFO-200"), 받지 못하면 null
 *
 * 인증키는 소스에 두지 않고 환경변수(VITE_NEIS_KEY)로 넣는다.
 * 키가 없거나 거절되면 키 없는 샘플 호출로 다시 부른다. 단, 키가 없으면 나이스가 5줄까지만 준다.
 */
export async function neisGet(service, params) {
  const query = new URLSearchParams({
    Type: "json",
    pIndex: "1",
    ATPT_OFCDC_SC_CODE: NEIS_OFFICE_CODE,
    SD_SCHUL_CODE: NEIS_SCHOOL_CODE,
    ...params,
  });
  const baseUrl = `https://open.neis.go.kr/hub/${service}?${query}`;
  const neisKey = import.meta.env.VITE_NEIS_KEY;
  const urls = neisKey ? [`${baseUrl}&KEY=${neisKey}`, baseUrl] : [baseUrl];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json[service] || json.RESULT?.CODE === "INFO-200") return json;
    } catch {
      // 네트워크 오류나 JSON 이 아닌 응답이면 다음 주소를 시도한다
    }
  }
  return null;
}

/** 나이스 응답에서 줄 목록과 전체 줄 수 */
export function neisRows(json, service) {
  const block = json?.[service];
  const rows = block?.[1]?.row || [];
  const total = Number(block?.[0]?.head?.[0]?.list_total_count) || rows.length;
  return { rows, total };
}
