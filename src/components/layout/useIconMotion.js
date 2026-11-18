import { useEffect, useRef, useState } from "react";
import { spinStep, LINGER_S } from "@/lib/iconSpin";

// 머리글 탭 아이콘(바람개비·명찰·서류·시계) 움직임.
//  - PC: 마우스를 올리면 움직이기 시작하고, 떼면 3초(LINGER_S) 더 움직인다.
//  - 휴대폰: 누르면 3초 움직인다 (휴대폰에는 "마우스 올리기"가 없다).
//  - 명찰·서류(CSS 애니메이션): 움직이는 동안 탭에 data-moving="true" 가 붙고, Header 의 group-data-[moving=true]:…
//    클래스가 움직임을 건다. 멈출 때는 흔들기를 마저 끝내 제자리에서 멈춘다(남은 게 길면 FINISH_MAX_MS 안에).
//  - 정보 수업 바람개비·교무실 시곗바늘(spin): 스크립트로 돌린다. 1초 동안 점점 빨라지고, 3초의 마지막 1초에 점점
//    느려지며 멈춘다(속도 계산은 src/lib/iconSpin.js). 어느 각도에서 멈춰도 된다. 시곗바늘은 분침·시침이 같은 비율로
//    빨라지고 느려져서 멈췄을 때도 시각이 맞는다.
// CSS :hover 를 쓰지 않는 까닭: 일부 휴대폰(삼성 인터넷 등)은 누른 뒤 hover 가 남아 끝없이 돌았다 (2026-11-18).
// Windows 애니메이션 효과가 꺼진 PC(움직임 줄이기)에서도 움직인다: 사용자가 다 움직이길 원함 (2026-11-18).

const LINGER_MS = LINGER_S * 1000;
const FINISH_MAX_MS = 1200;

// 그 탭 안에서 돌고 있는 CSS 애니메이션 (트랜지션은 빼고). 오래된 브라우저는 빈 목록 → 그냥 멈춘다
const cssAnimations = (el) => (el?.getAnimations?.({ subtree: true }) ?? []).filter((a) => "animationName" in a);

/**
 * 쓰는 법: const motion = useIconMotion();
 *   <div className="group …" {...motion.tab("class")}>  … <g ref={motion.spin("class")} className="origin-[50px_50px]">
 *   시계처럼 한 탭에 바늘이 둘이면: ref={motion.spin("office", "minute", 360)} · ref={motion.spin("office", "hour", 30)}
 */
export function useIconMotion() {
  const [moving, setMoving] = useState(() => new Set());
  const els = useRef({});
  const timers = useRef({});
  const tokens = useRef({}); // 멈추는 중에 다시 움직이면 예전 "멈춤"을 무시하려고
  const spinners = useRef({}); // "탭:이름" → { tab, el, angle, omega, max, leaveAt, w0, running }
  const raf = useRef(0);
  const lastT = useRef(0);

  useEffect(() => {
    const t = timers.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const mark = (id, on) =>
    setMoving((prev) => {
      if (prev.has(id) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // ---- 바람개비: 화면마다 속도를 계산해 직접 돌린다 ----
  function tick(ms) {
    const now = ms / 1000;
    const dt = Math.min(0.1, Math.max(0, now - lastT.current)); // 탭을 오래 비웠다 돌아와도 한 번에 크게 튀지 않게
    lastT.current = now;
    let any = false;
    for (const s of Object.values(spinners.current)) {
      if (!s.running) continue;
      Object.assign(s, spinStep(s, now, dt));
      if (s.done) s.running = false;
      else any = true;
      if (s.el) s.el.style.transform = `rotate(${s.angle}deg)`;
    }
    raf.current = any ? requestAnimationFrame(tick) : 0;
  }
  const spinnersOf = (id) => Object.values(spinners.current).filter((s) => s.tab === id);
  const kick = () => {
    if (raf.current) return;
    lastT.current = performance.now() / 1000;
    raf.current = requestAnimationFrame(tick);
  };

  const start = (id) => {
    clearTimeout(timers.current[id]);
    tokens.current[id] = (tokens.current[id] ?? 0) + 1;
    // 멈추는 중이었으면 처음부터 다시 하지 않고 이어서 계속 돈다
    for (const a of cssAnimations(els.current[id])) {
      a.effect.updateTiming({ iterations: Infinity });
      a.playbackRate = 1;
    }
    for (const s of spinnersOf(id)) {
      s.running = true;
      s.leaveAt = null;
      s.w0 = null;
      kick();
    }
    mark(id, true);
  };

  const finish = (id) => {
    const token = tokens.current[id];
    const anims = cssAnimations(els.current[id]);
    for (const a of anims) {
      const t = a.effect.getComputedTiming();
      const duration = Number(t.duration);
      if (!(duration > 0) || t.currentIteration == null) continue;
      a.effect.updateTiming({ iterations: t.currentIteration + 1 }); // 지금 바퀴까지만
      const left = (1 - (t.progress ?? 0)) * duration;
      if (left > FINISH_MAX_MS) a.playbackRate = left / FINISH_MAX_MS;
    }
    Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {
      if (tokens.current[id] === token) mark(id, false);
    });
  };

  const finishLater = (id) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => finish(id), LINGER_MS);
    for (const s of spinnersOf(id)) {
      if (!s.running) continue;
      s.leaveAt = performance.now() / 1000; // 바람개비·시곗바늘은 tick 이 3초 뒤 스스로 멈춘다
      s.w0 = null;
    }
  };

  return {
    tab: (id) => ({
      ref: (el) => {
        els.current[id] = el;
      },
      "data-moving": moving.has(id) ? "true" : undefined,
      onPointerEnter: (e) => {
        if (e.pointerType === "mouse") start(id);
      },
      onPointerLeave: (e) => {
        if (e.pointerType === "mouse") finishLater(id);
      },
      onPointerDown: (e) => {
        if (e.pointerType === "mouse") return;
        start(id);
        finishLater(id);
      },
    }),
    // 탭 id 안에서 스크립트로 돌릴 것. 한 탭에 여럿이면 name 을 다르게, max 는 최고 속도(도/초)
    spin: (id, name = "main", max = undefined) => (el) => {
      const s = (spinners.current[`${id}:${name}`] ||= { tab: id, max, angle: 0, omega: 0, leaveAt: null, w0: null, running: false });
      s.el = el;
      if (el) el.style.transform = `rotate(${s.angle}deg)`;
    },
  };
}
