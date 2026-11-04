import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBvT2aTTuFfu6tQ-PqE4_nkuo9sotAp1cs",
  authDomain: "class-208a0.firebaseapp.com",
  projectId: "class-208a0",
  storageBucket: "class-208a0.firebasestorage.app"
};

// Firebase 초기화 및 내보내기
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 관리자가 다른 교사 계정을 만들 때 쓰는 보조 인증 인스턴스.
// 기본 auth 로 createUserWithEmailAndPassword 를 부르면 관리자가 로그아웃되고
// 새 계정으로 로그인돼 버리기 때문에, 별도 앱 이름으로 분리해서 사용한다.
export function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === "secondary");
  return getAuth(existing ?? initializeApp(firebaseConfig, "secondary"));
}