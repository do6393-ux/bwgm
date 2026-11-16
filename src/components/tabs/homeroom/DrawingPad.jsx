// 내 학급 › 교실 화면 › "교실에 띄울 메시지"의 그림 그리기 창.
// 마우스·손가락·펜으로 그린다. 바탕은 교실 TV 와 같은 색이라 보이는 그대로 TV 에 뜬다.
import { useEffect, useRef, useState } from "react";
import { Eraser, Trash2, Undo2, X } from "lucide-react";
import { DRAWING_MAX_CHARS, ERASER, PEN_COLORS, PEN_WIDTHS, addPoint, encodeDrawing, hasInk, toDrawPoint } from "@/lib/drawing";
import DrawingView from "./DrawingView";

const toolClass = (on) =>
  `h-9 px-3 rounded-[10px] text-[13px] flex items-center gap-1.5 border ${
    on ? "bg-white text-black border-white font-bold" : "border-line text-ink hover:border-line-hover"
  }`;

/** initial: 고칠 때 앞의 그림, onDone(획 목록 | null), onCancel() */
export default function DrawingPad({ initial, onDone, onCancel }) {
  const [strokes, setStrokes] = useState(() => initial || []);
  const [past, setPast] = useState([]); // 되돌리기용: 앞의 획 목록들
  const [color, setColor] = useState(1);
  const [width, setWidth] = useState(0);
  const [eraser, setEraser] = useState(false);
  const [live, setLive] = useState(null); // 지금 그리는 획 (화면용)
  const liveRef = useRef(null); // 같은 획 (이벤트 처리용: 손을 뗄 때 두 번 더해지지 않게)
  const [error, setError] = useState("");
  const boxRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  const point = (e) => toDrawPoint(e.clientX, e.clientY, boxRef.current.getBoundingClientRect());

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = point(e);
    setError("");
    liveRef.current = { c: eraser ? ERASER : color, w: width, p: [x, y] };
    setLive(liveRef.current);
  };

  const onPointerMove = (e) => {
    const cur = liveRef.current;
    if (!cur) return;
    const [x, y] = point(e);
    const p = addPoint(cur.p, x, y);
    if (p === cur.p) return;
    liveRef.current = { ...cur, p };
    setLive(liveRef.current);
  };

  const finish = () => {
    const stroke = liveRef.current;
    if (!stroke) return;
    liveRef.current = null;
    setPast((h) => [...h, strokes]);
    setStrokes((list) => [...list, stroke]);
    setLive(null);
  };

  const undo = () => {
    if (past.length === 0) return;
    setStrokes(past[past.length - 1]);
    setPast((h) => h.slice(0, -1));
  };

  const clearAll = () => {
    if (strokes.length === 0) return;
    setPast((h) => [...h, strokes]);
    setStrokes([]);
  };

  const done = () => {
    if (!hasInk(strokes)) {
      onDone(null);
      return;
    }
    if (encodeDrawing(strokes).length > DRAWING_MAX_CHARS) {
      setError("그림이 너무 복잡해서 띄울 수 없어요. 조금 지우거나 되돌린 뒤 다시 해 주세요.");
      return;
    }
    onDone(strokes);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
  };

  return (
    <div className="ui-fade fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 md:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawing-pad-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
        className="ui-pop w-full max-w-[1020px] max-h-full overflow-y-auto bg-surface border border-line rounded-card p-4 md:p-6 flex flex-col gap-3 md:gap-4 focus:outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 id="drawing-pad-title" className="text-[18px] md:text-[20px] font-bold text-white">
              그림 그리기
            </h3>
            <p className="text-[12px] md:text-[13px] text-ink-muted">마우스나 손가락으로 그려요. 바탕색은 교실 TV와 같아요.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="닫기" className="shrink-0 w-10 h-10 rounded-full bg-raised hover:bg-well text-ink flex items-center justify-center">
            <X className="w-[18px] h-[18px]" strokeWidth={2.6} />
          </button>
        </div>

        <div role="toolbar" aria-label="그리기 도구" className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-muted">색</span>
            {PEN_COLORS.map((pc, i) => {
              const on = !eraser && color === i;
              return (
                <button
                  key={pc.name}
                  type="button"
                  aria-label={pc.name}
                  aria-pressed={on}
                  onClick={() => {
                    setColor(i);
                    setEraser(false);
                  }}
                  style={{ background: pc.hex }}
                  className={`w-[34px] h-[34px] rounded-full ${on ? "border-[3px] border-white ring-2 ring-offset-0 ring-amber-400" : "border-2 border-line"}`}
                />
              );
            })}
          </div>
          <span aria-hidden="true" className="hidden md:block w-px h-7 bg-line" />
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-ink-muted">굵기</span>
            {PEN_WIDTHS.map((pw, i) => (
              <button key={pw.name} type="button" aria-pressed={!eraser && width === i} onClick={() => { setWidth(i); setEraser(false); }} className={toolClass(!eraser && width === i)}>
                {pw.name}
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="hidden md:block w-px h-7 bg-line" />
          <button type="button" aria-pressed={eraser} onClick={() => setEraser((v) => !v)} className={toolClass(eraser)}>
            <Eraser className="w-4 h-4" strokeWidth={2.2} />
            지우개
          </button>
          <button type="button" onClick={undo} disabled={past.length === 0} className={`${toolClass(false)} disabled:opacity-40`}>
            <Undo2 className="w-4 h-4" strokeWidth={2.2} />
            되돌리기
          </button>
          <button type="button" onClick={clearAll} disabled={strokes.length === 0} className={`${toolClass(false)} !text-rose-300 disabled:opacity-40`}>
            <Trash2 className="w-4 h-4" strokeWidth={2.2} />
            모두 지우기
          </button>
        </div>

        <div
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          aria-label="그림 칸"
          className={`w-full aspect-video rounded-2xl overflow-hidden outline outline-1 outline-line touch-none select-none ${eraser ? "cursor-cell" : "cursor-crosshair"}`}
        >
          <DrawingView strokes={strokes} live={live} />
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-rose-300">
            {error}
          </p>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3">
          <span className="text-[12px] text-ink-faint">다 그리면 '교실에 띄울 메시지' 칸에 작은 그림이 들어가요. 글과 같이 띄울 수 있어요.</span>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel} className="h-11 px-5 rounded-field border border-line text-ink hover:border-line-hover text-[14px]">
              취소
            </button>
            <button type="button" onClick={done} className="h-11 px-5 rounded-field bg-amber-400 hover:bg-amber-300 text-[#3a2a05] text-[14px] font-bold">
              다 그렸어요
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
