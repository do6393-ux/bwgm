import { initializeApp } from "firebase/app";
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