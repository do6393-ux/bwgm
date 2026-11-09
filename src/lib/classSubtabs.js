// 정보 수업 탭의 작은 탭. 홈이 아닌 탭을 열면 주소 끝에 붙는다 (예: https://…/#homework).
// 새로고침해도 그 탭이 열리고, 학생에게 링크로 바로 줄 수 있다.
// App 이 로그인 직후 첫 탭을 고를 때도 쓴다 (이 주소로 들어온 교사는 교무실 대신 정보 수업을 본다).
export const CLASS_SUBTABS = [
  { id: "home", label: "홈", hash: "" },
  { id: "lessons", label: "단원별 수업 자료실", shortLabel: "자료실", hash: "#lessons" },
  { id: "homework", label: "과제", hash: "#homework" },
  { id: "timer", label: "수업 타이머", shortLabel: "타이머", hash: "#timer", teacherOnly: true }, // 학생에게는 안 보인다
];

/** 이 사람이 볼 수 있는 작은 탭 (로그인하지 않은 학생에게는 teacherOnly 탭을 뺀다) */
export function visibleSubtabs(isTeacher) {
  return CLASS_SUBTABS.filter((t) => isTeacher || !t.teacherOnly);
}

/** 주소의 #… → 작은 탭 id (모르는 값이면 홈) */
export function subtabFromHash(hash) {
  return CLASS_SUBTABS.find((t) => t.hash && t.hash === hash)?.id ?? "home";
}

/** 정보 수업 작은 탭 주소인지 */
export function isClassSubtabHash(hash) {
  return CLASS_SUBTABS.some((t) => t.hash && t.hash === hash);
}

export function hashOfSubtab(id) {
  return CLASS_SUBTABS.find((t) => t.id === id)?.hash ?? "";
}
