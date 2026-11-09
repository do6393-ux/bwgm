// 수업 자료(lessons) 읽기. 자료실 탭과 홈의 "최근 올라온 자료"가 같이 쓴다.
import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** 수업 자료 전체 (최근 것 먼저). 읽기에 실패해도 loaded 는 올려서 스켈레톤이 남지 않게 한다 */
export function useLessons() {
  const [state, setState] = useState({ lessons: [], loaded: false });
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "lessons"), orderBy("createdAt", "desc")),
        (snap) => setState({ lessons: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loaded: true }),
        (err) => {
          console.error("lessons listener:", err);
          setState((s) => ({ ...s, loaded: true }));
        }
      ),
    []
  );
  return state;
}
