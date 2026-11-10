// 발표자 뽑기의 효과: 꽃가루(캔버스)와 소리(WebAudio, 파일 없이 만든다).
// 화면 컴포넌트(ClassPicker.jsx)가 하나씩 만들어 쓴다.

const COLORS = ["#ff5000", "#000000", "#ffb000", "#00a86b", "#cccccc", "#ff8a4c"];
const LIFE = 260; // 프레임 (약 4초)

/** 화면 전체를 덮는 캔버스(pointer-events: none)에 꽃가루를 뿌린다 */
export function createConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  let parts = [];
  let raf = 0;

  const fit = () => {
    const d = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * d;
    canvas.height = window.innerHeight * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  const step = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    parts = parts.filter((p) => p.y < h + 40 && p.life < LIFE);
    for (const p of parts) {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.34;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      p.life++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = Math.min(1, (LIFE - p.life) / 60);
      ctx.fillStyle = p.c;
      // 세로 길이를 cos 로 줄였다 늘였다 → 종이가 뒤집히며 떨어지는 느낌
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life * 0.12 + p.r)));
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(step) : 0;
    if (!raf) ctx.clearRect(0, 0, w, h);
  };

  return {
    /** rect(화면 위치)의 가운데에서 위로 터뜨린다 */
    burst(rect, amount = 110) {
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      for (let i = 0; i < amount; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
        const s = 6 + Math.random() * 11;
        parts.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          r: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.4,
          w: 5 + Math.random() * 5,
          h: 8 + Math.random() * 8,
          c: COLORS[Math.floor(Math.random() * COLORS.length)],
          life: 0,
        });
      }
      if (!raf) {
        fit();
        raf = requestAnimationFrame(step);
      }
    },
    /** 전체 화면을 켜고 끄면 캔버스 크기를 다시 맞춘다 */
    fit,
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      parts = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

/** 소리. 브라우저는 사용자가 누른 뒤에만 소리를 허락하므로 뽑기 버튼을 누를 때 unlock() 한다 */
export function createSound() {
  let ac = null;
  let lastTick = 0;

  const tone = (freq, dur, { type = "sine", vol = 0.1, when = 0 } = {}) => {
    if (!ac) return;
    const t = ac.currentTime + when;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  return {
    unlock() {
      try {
        ac ??= new (window.AudioContext || window.webkitAudioContext)();
        ac.resume?.();
      } catch {
        ac = null;
      }
    },
    /** 번호가 바뀔 때마다 짧게 "틱". progress(0~1)가 클수록 조금 높게 */
    tick(progress = 0) {
      const now = performance.now();
      if (now - lastTick < 28) return; // 너무 촘촘하면 소리가 뭉개진다
      lastTick = now;
      tone(1100 + progress * 500, 0.035, { type: "square", vol: 0.022 });
    },
    /** 뽑혔을 때 "딩—" (세 음을 겹쳐서) */
    ding() {
      tone(784, 0.5, { vol: 0.16 });
      tone(1175, 0.7, { vol: 0.12, when: 0.09 });
      tone(1568, 1, { vol: 0.09, when: 0.18 });
    },
    close() {
      ac?.close?.().catch(() => {});
      ac = null;
    },
  };
}
