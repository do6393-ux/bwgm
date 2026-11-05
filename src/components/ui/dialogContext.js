import { createContext, useContext } from "react";

export const DialogContext = createContext(null);

/**
 * 브라우저 기본 alert/confirm 대신 쓰는 테마 알림.
 *   const { confirm, alert, toast } = useDialog();
 *   if (await confirm("삭제할까요?", { danger: true, confirmText: "삭제" })) { ... }
 *   toast("저장했습니다");                 // 잠깐 떴다 사라지는 알림 (기본 info)
 *   toast("저장하지 못했습니다", "error");  // "success" | "error" | "info"
 *   await alert("긴 안내문 ...");           // 확인을 눌러야 닫히는 안내
 */
export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog 는 <DialogProvider> 안에서만 쓸 수 있습니다.");
  return ctx;
}

const RELOAD_TOAST_KEY = "toast_after_reload";

/** 페이지를 새로고침한 뒤 첫 화면에 띄울 알림을 예약한다 (설정 저장 직후 새로고침 등) */
export function toastAfterReload(message, type = "success") {
  try {
    sessionStorage.setItem(RELOAD_TOAST_KEY, JSON.stringify({ message, type }));
  } catch {
    // 저장소를 못 쓰는 환경이면 알림 없이 넘어간다
  }
}

/** 예약된 알림을 한 번 꺼내고 지운다 */
export function takeReloadToast() {
  try {
    const raw = sessionStorage.getItem(RELOAD_TOAST_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RELOAD_TOAST_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
