// 교실 화면의 "학교 지도": 누르면 화면 전체에 학교 3D 지도(본관·솔향관·주변)를 띄운다.
// 지도는 buwon2 에서 만든 단독 페이지 public/school3d/index.html 을 iframe 으로 그대로 쓴다
// (three.js 는 그 페이지가 CDN 에서 부르고, 모델 파일은 같은 폴더). 모델이 바뀌면 그 폴더만 다시 복사한다.
// 닫기 단추·Esc 로 닫히고, 아무도 안 만지면 MAP_IDLE_MS 뒤 저절로 닫혀 교실 화면으로 돌아간다.
// 단, 지도 안에서 "사람 눈높이로 걷기" 중인 Esc 는 지도가 preventDefault 하므로 걷기만 끝나고 지도는 안 닫힌다.
// 교실 화면은 1280×720 을 transform 으로 늘린 상자라, 지도는 그 밖(전체 화면 요소나 body)에 띄운다.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAP_SRC = "/school3d/index.html";
const MAP_IDLE_MS = 3 * 60 * 1000;

export default function SchoolMapOverlay({ onClose }) {
  const frameRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let timer = setTimeout(onClose, MAP_IDLE_MS);
    const poke = () => {
      clearTimeout(timer);
      timer = setTimeout(onClose, MAP_IDLE_MS);
    };
    const onKey = (event) => {
      poke();
      if (event.key !== "Escape" || event.repeat) return;
      // 지도 안에서 걷기·카메라 전환을 끝내는 Esc 는 지도 페이지가 먼저 받아 preventDefault 한다 → 지도는 그대로 둔다
      if (event.defaultPrevented) return;
      // 교실 컴퓨터 프로그램의 "Esc 로 화면 내리기"(useEscToLower)보다 먼저 받아서 지도만 닫는다
      event.preventDefault();
      onClose();
    };
    const opts = { capture: true, passive: true };
    // iframe 안에서 생긴 키·마우스 이벤트는 바깥 window 로 안 올라오므로, 같은 출처인 iframe 의 window 에도 단다
    const targets = new Set([window]);
    const listen = (target) => {
      target.addEventListener("keydown", onKey, true);
      target.addEventListener("pointerdown", poke, opts);
      target.addEventListener("pointermove", poke, opts);
      target.addEventListener("wheel", poke, opts);
    };
    const unlisten = (target) => {
      target.removeEventListener("keydown", onKey, true);
      target.removeEventListener("pointerdown", poke, opts);
      target.removeEventListener("pointermove", poke, opts);
      target.removeEventListener("wheel", poke, opts);
    };
    listen(window);
    const frame = frameRef.current;
    const onFrameLoad = () => {
      const inner = frame.contentWindow;
      try {
        void inner?.document; // 다른 출처면 여기서 막힌다
      } catch {
        return;
      }
      if (!inner || targets.has(inner)) return;
      targets.add(inner);
      listen(inner);
    };
    frame?.addEventListener("load", onFrameLoad);
    return () => {
      clearTimeout(timer);
      frame?.removeEventListener("load", onFrameLoad);
      targets.forEach((target) => {
        try {
          unlisten(target);
        } catch {
          // iframe 이 이미 사라졌으면 할 일 없음
        }
      });
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="학교 3D 지도" className="fixed inset-0 z-[60] bg-[#050505]">
      {!loaded && (
        <p className="absolute inset-0 flex items-center justify-center font-mono text-[12px] tracking-[0.06em] text-[#888888]">
          LOADING · 학교 3D 지도
        </p>
      )}
      <iframe
        ref={frameRef}
        src={MAP_SRC}
        title="학교 3D 지도"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 block h-full w-full border-0 bg-[#050505]"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 z-[1] min-h-[44px] rounded-none border border-[#333333] bg-[rgba(17,17,17,0.92)] px-[14px] py-2 text-[13px] font-bold text-[#e5e5e5] hover:border-[#444444] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5000]"
      >
        닫기 ✕
      </button>
    </div>,
    document.fullscreenElement || document.body,
  );
}
