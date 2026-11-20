// 교실 화면의 "학교 지도": 누르면 화면 전체에 본관 3D 지도(@/components/school3d)를 띄운다.
// three.js 와 모델 파일(public/school3d/)은 처음 열 때만 불러온다.
// 닫기 단추·Esc 로 닫히고, 아무도 안 만지면 MAP_IDLE_MS 뒤 저절로 닫혀 교실 화면으로 돌아간다.
// 교실 화면은 1280×720 을 transform 으로 늘린 상자라, 지도는 그 밖(전체 화면 요소나 body)에 띄운다.
import { lazy, Suspense, useEffect } from "react";
import { createPortal } from "react-dom";

const School3D = lazy(() => import("@/components/school3d"));

const MAP_IDLE_MS = 3 * 60 * 1000;

export default function SchoolMapOverlay({ onClose }) {
  useEffect(() => {
    let timer = setTimeout(onClose, MAP_IDLE_MS);
    const poke = () => {
      clearTimeout(timer);
      timer = setTimeout(onClose, MAP_IDLE_MS);
    };
    const onKey = (event) => {
      poke();
      if (event.key !== "Escape" || event.repeat) return;
      // 교실 컴퓨터 프로그램의 "Esc 로 화면 내리기"(useEscToLower)보다 먼저 받아서 지도만 닫는다
      event.preventDefault();
      onClose();
    };
    const opts = { capture: true, passive: true };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", poke, opts);
    window.addEventListener("pointermove", poke, opts);
    window.addEventListener("wheel", poke, opts);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", poke, opts);
      window.removeEventListener("pointermove", poke, opts);
      window.removeEventListener("wheel", poke, opts);
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="학교 3D 지도" className="fixed inset-0 z-[60] bg-[#050505]">
      <Suspense
        fallback={
          <p className="absolute inset-0 flex items-center justify-center font-mono text-[12px] tracking-[0.06em] text-[#888888]">
            LOADING · 학교 3D 지도
          </p>
        }
      >
        <School3D onClose={onClose} />
      </Suspense>
    </div>,
    document.fullscreenElement || document.body,
  );
}
