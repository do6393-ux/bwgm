// CSS 미디어 쿼리가 지금 맞는지 (창 크기·기기가 바뀌면 다시 그린다)
import { useSyncExternalStore } from "react";

/** 마우스가 있는 기기(PC). 휴대폰·태블릿 같은 터치 기기는 아니다 */
export const MOUSE_QUERY = "(hover: hover) and (pointer: fine)";

export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
