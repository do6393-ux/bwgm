import { useEffect, useRef, useState } from "react";
import { createBustView } from "./logoBustScene";
import { lookLabel, nextLook, readSavedLook, saveLook } from "@/lib/logoBust";

// 머리글 "buwon informatics" 글자 대신 서 있는 3D 조각 (넓은 PC 화면 + 로그인한 선생님만, Header 가 늦게 불러온다).
// 마우스 쪽으로 고개를 돌리고, 누를 때마다 다음 모양(9가지)으로 바뀐다. 고른 모양은 이 브라우저가 기억한다.
// 모델을 다 받기 전이나 WebGL 이 안 되면 아무것도 안 보이고, 머리글은 글자 로고를 그대로 보여 준다(onReady).

const MODEL_URL = `${import.meta.env.BASE_URL}models/bust.glb`;

// 머리글 줄의 위아래 여백까지 써서 크게 그린다. 바깥 여백을 그만큼 음수로 줘서 머리글 높이는 그대로다.
// 두 값은 Header.jsx 의 탭 아이콘 높이·안쪽 줄 위아래 여백과 같아야 한다.
// 폭은 글자 로고(약 150px)와 비슷하게 둬서 머리글이 더 넓어지지 않게 한다.
const ROW = "clamp(58px, 7.8vw, 110px)";
const PAD = "clamp(1.5rem, 2.2vw, 2rem)";
const HEIGHT = `(${ROW} + 2 * ${PAD} - 6px)`;
const BOX_STYLE = { height: `calc${HEIGHT}`, width: `calc(${HEIGHT} * 0.92)`, marginBlock: `calc(3px - ${PAD})` };

export default function LogoBust({ onReady }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef(null);
  const [look, setLook] = useState(readSavedLook);
  const firstLook = useRef(look);
  const [ready, setReady] = useState(false);
  const [tag, setTag] = useState({ text: "", on: false }); // 바꾼 직후 잠깐 보이는 이름표

  useEffect(() => {
    let view;
    try {
      view = createBustView(canvasRef.current, boxRef.current);
    } catch (err) {
      console.warn("logo bust: 3D 를 그릴 수 없어 글자 로고를 그대로 둡니다", err);
      return undefined;
    }
    viewRef.current = view;
    view.setLook(firstLook.current);
    let alive = true;
    view.load(MODEL_URL)
      .then(() => {
        if (!alive) return;
        setReady(true);
        onReady?.(true);
      })
      .catch((err) => console.warn("logo bust: 모델을 불러오지 못해 글자 로고를 그대로 둡니다", err));
    return () => {
      alive = false;
      view.dispose();
      viewRef.current = null;
      onReady?.(false);
    };
  }, [onReady]);

  useEffect(() => {
    if (!tag.on) return undefined;
    const t = setTimeout(() => setTag((v) => ({ ...v, on: false })), 1400);
    return () => clearTimeout(t);
  }, [tag]);

  const onClick = () => {
    const id = nextLook(look);
    setLook(id);
    saveLook(id);
    viewRef.current?.setLook(id, { hop: true });
    setTag({ text: lookLabel(id), on: true });
  };

  return (
    <button
      ref={boxRef}
      type="button"
      onClick={onClick}
      title="누르면 모양이 바뀌어요"
      aria-label={`조각 모양 바꾸기 (지금: ${lookLabel(look)})`}
      className={`${ready ? "block" : "hidden"} relative shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      style={BOX_STYLE}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block w-full h-full [filter:drop-shadow(0_6px_8px_rgba(0,0,0,0.14))]" />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 bottom-0 -translate-x-1/2 whitespace-nowrap bg-page text-ink font-mono text-[12px] px-1.5 transition-opacity duration-300 ${tag.on ? "opacity-100" : "opacity-0"}`}
      >
        [ {tag.text} ]
      </span>
    </button>
  );
}
