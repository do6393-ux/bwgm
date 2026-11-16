// 교실 컴퓨터에 깐 "부원 교실 화면" 프로그램(classroom-app/) 안에서 교실 화면이 열렸을 때만 쓰는 것.
// 프로그램이 window.bwgmClassroomApp = { raise(), lower() } 를 넣어 준다. 크롬에서 열면 없다.
//   raise(): 내려가 있던(최소화·다른 창 뒤) 교실 화면을 맨 앞으로. 내려가 있었으면 true
//   lower(): 교실 화면을 내려놓는다 (최소화)
// 언제 올리고 얼마 뒤 내릴지는 여기(웹)에서 정한다 → 바꿔도 프로그램을 다시 깔 필요가 없다.
import { useEffect, useMemo } from "react";

export const LOWER_AFTER_MS = 60 * 1000; // 메시지로 올라온 화면을 아무도 안 누르면 이만큼 뒤 다시 내린다

/** 프로그램 안이면 다리 객체, 크롬이면 null */
export function classroomApp() {
  if (typeof window === "undefined") return null;
  const app = window.bwgmClassroomApp;
  return app && typeof app.raise === "function" && typeof app.lower === "function" ? app : null;
}

/** 선생님 메시지(글·그림)를 띄운 시각. 메시지가 없으면 null. 이 값이 새로 바뀌면 화면을 올린다 */
export function noticeKey(screen) {
  if (!screen || !(screen.noticeAt instanceof Date)) return null;
  const hasText = typeof screen.noticeText === "string" && screen.noticeText.trim() !== "";
  const hasDrawing = typeof screen.noticeDrawing === "string" && screen.noticeDrawing !== "";
  return hasText || hasDrawing ? screen.noticeAt.getTime() : null;
}

/**
 * 메시지가 새로 오면 화면을 올리고, 메시지 때문에 올라온 화면은 아무도 안 누르면 delay 뒤 다시 내린다.
 *   update(key): noticeKey 값. undefined 는 아직 문서를 모르는 것 → 처음 열 때 이미 있던 메시지로는 올리지 않는다
 *   touched(): 누가 화면을 눌렀다 (채팅·그림 보기 등) → 저절로 내리지 않는다
 */
export function createRaiser(app, { delay = LOWER_AFTER_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let prev; // undefined: 아직 모름
  let autoLower = false; // 메시지 때문에 올라와 있고, 아직 아무도 안 눌렀다
  let timer = null;
  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  return {
    update(key) {
      if (key === undefined) return Promise.resolve();
      const before = prev;
      prev = key;
      if (before === undefined || key === null || key === before) return Promise.resolve();
      return Promise.resolve()
        .then(() => app.raise())
        .then((wasDown) => {
          // 이미 떠 있던 화면이면 그대로 둔다. 메시지로 올라와 있는 동안 또 오면 다시 센다
          if (!wasDown && !autoLower) return;
          autoLower = true;
          stopTimer();
          timer = setTimer(() => {
            timer = null;
            if (!autoLower) return;
            autoLower = false;
            Promise.resolve()
              .then(() => app.lower())
              .catch(() => {});
          }, delay);
        })
        .catch(() => {});
    },
    touched() {
      autoLower = false;
      stopTimer();
    },
    dispose: stopTimer,
  };
}

/** Esc 로 화면을 내릴까? 글을 쓰는 중(채팅 입력칸)이거나 키를 누르고 있는 것이면 아니다 */
export function isEscToLower(event) {
  if (!event || event.key !== "Escape" || event.repeat) return false;
  const t = event.target;
  if (!t) return true;
  return !t.isContentEditable && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/** 프로그램 안에서만: Esc 를 누르면 교실 화면을 내린다 */
export function useEscToLower(app) {
  useEffect(() => {
    if (!app) return undefined;
    const onKey = (event) => {
      if (isEscToLower(event)) Promise.resolve(app.lower()).catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app]);
}

/** 프로그램 안에서만: 선생님이 메시지를 새로 띄우면 교실 화면을 올린다 (key 는 noticeKey, 모르면 undefined) */
export function useRaiseOnNotice(app, key) {
  const raiser = useMemo(() => (app ? createRaiser(app) : null), [app]);
  useEffect(() => {
    if (!raiser) return undefined;
    const touched = () => raiser.touched();
    window.addEventListener("pointerdown", touched);
    return () => {
      window.removeEventListener("pointerdown", touched);
      raiser.dispose();
    };
  }, [raiser]);
  useEffect(() => {
    raiser?.update(key);
  }, [raiser, key]);
}
