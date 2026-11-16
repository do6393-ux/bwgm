// 교실 채팅 알림: 내가 만든 교실 화면들에 학생 메시지가 오면 포털 어느 탭에서든 알린다.
// 포털을 켜 둔 동안만 알 수 있다 (창을 다 닫으면 알림이 오지 않는다).
import { useEffect, useState } from "react";
import { watchMessages, watchMyScreens } from "@/lib/classroomApi";
import { todayMessages, unreadFromStudents } from "@/lib/classroomChat";
import { useNow } from "@/lib/useScreenAwake";

const PER_SCREEN = 30; // 교실마다 최근 대화 몇 개까지 볼지

/**
 * uid: 로그인한 선생님 (없으면 아무것도 하지 않음)
 * 반환 { count: 아직 확인하지 않은 학생 메시지 수, latest: { screen, message } | null (가장 최근 것) }
 */
export function useClassroomInbox(uid) {
  const [screens, setScreens] = useState([]);
  useEffect(() => {
    if (!uid) return undefined;
    return watchMyScreens(uid, (list) => setScreens(list || []));
  }, [uid]);

  const mine = uid ? screens : [];
  const idsKey = mine.map((s) => s.id).join(",");
  const [byScreen, setByScreen] = useState({});
  useEffect(() => {
    if (!idsKey) return undefined;
    const unsubs = idsKey
      .split(",")
      .map((id) => watchMessages(id, (list) => setByScreen((m) => ({ ...m, [id]: list || [] })), PER_SCREEN));
    return () => unsubs.forEach((u) => u());
  }, [idsKey]);

  const now = useNow(60000);
  const items = [];
  for (const s of mine) {
    for (const m of unreadFromStudents(todayMessages(byScreen[s.id], now), s.teacherReadAt)) items.push({ screen: s, message: m });
  }
  items.sort((a, b) => a.message.at - b.message.at);
  return { count: items.length, latest: items.at(-1) || null };
}
