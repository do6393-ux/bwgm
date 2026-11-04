// 포털 관리자(다른 교사 계정을 추가/삭제할 수 있는 유일한 계정).
// ⚠️ 화면 표시용 판별일 뿐이고 실제 권한은 firestore.rules 의 isAdmin() 이 강제한다.
//    관리자 이메일을 바꾸려면 firestore.rules 도 같이 바꿔야 한다.
export const ADMIN_EMAIL = "do6393@ice.go.kr";

export function isAdmin(user) {
  return !!user?.email && user.email.toLowerCase() === ADMIN_EMAIL;
}
