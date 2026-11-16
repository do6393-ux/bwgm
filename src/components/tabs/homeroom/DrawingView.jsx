// 선생님 그림(획 목록)을 SVG 로 그린다. 담는 칸 크기에 맞춰 16:9 로 늘고 줄어든다.
import { DRAW_BG, DRAW_H, DRAW_W, strokeColor, strokePath, strokeWidth } from "@/lib/drawing";

function Stroke({ stroke }) {
  return (
    <path
      d={strokePath(stroke.p)}
      stroke={strokeColor(stroke.c)}
      strokeWidth={strokeWidth(stroke)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** strokes: 획 목록, live: 지금 그리는 중인 획(없으면 null), label: 화면 낭독기용 설명 (없으면 꾸밈으로 숨김) */
export default function DrawingView({ strokes, live = null, label }) {
  return (
    <svg
      viewBox={`0 0 ${DRAW_W} ${DRAW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full h-full"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect width={DRAW_W} height={DRAW_H} fill={DRAW_BG} />
      {(strokes || []).map((s, i) => (
        <Stroke key={i} stroke={s} />
      ))}
      {live && <Stroke stroke={live} />}
    </svg>
  );
}
