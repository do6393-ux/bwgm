import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin";

// 정보 업무 접근(열람·수정) 권한 확인.
//  - 관리자: 항상 허용
//  - 일반 교사: teachers/{이메일} 문서에 canWork === true 일 때 허용
//    (관리자가 헤더의 "teachers" 화면에서 교사별로 켜고 끈다)
// ⚠️ 화면 표시용 판별일 뿐이고 실제 접근 통제는 firestore.rules 의 hasWorkAccess() 가 한다.
//
// 반환값
//  - canWork: 정보 업무를 볼 수 있는지
//  - ready  : 판별이 끝났는지 (false 인 동안에는 "권한 없음" 안내를 띄우지 말 것)
export function useWorkAccess(user) {
  const email = user?.email?.toLowerCase() ?? null;
  const admin = isAdmin(user);
  const [result, setResult] = useState({ email: null, canWork: false });

  useEffect(() => {
    if (!email || admin) return;
    return onSnapshot(
      doc(db, "teachers", email),
      (snap) => setResult({ email, canWork: snap.exists() && snap.data().canWork === true }),
      () => setResult({ email, canWork: false })
    );
  }, [email, admin]);

  if (!email) return { canWork: false, ready: true };
  if (admin) return { canWork: true, ready: true };
  // 이전 사용자의 결과가 남아 있을 수 있으므로 이메일이 일치할 때만 신뢰한다.
  const loaded = result.email === email;
  return { canWork: loaded && result.canWork, ready: loaded };
}
