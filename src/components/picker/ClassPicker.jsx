// 정보 수업 탭의 "발표자 뽑기" 작은 탭 (주소 #picker, 로그인한 교사에게만 보인다).
// 명단 없이 반(학년·반)과 인원만 고르면 번호로 뽑는다. 프로젝터에 띄우는 것을 생각해 숫자를 크게 보여 준다.
//   - 애니메이션 두 가지 중 고른다: 번호판 반짝(번호판 위를 불빛이 뛰어다니다 멈춤) / 슬롯머신(숫자가 굴러가다 멈춤)
//   - 뽑히면 주황 카드 + 꽃가루 + 딩 소리 (소리는 끌 수 있다). 한 번에 1~4명
//   - 번호판의 번호를 누르면 결석으로 빠지고(그날만), 뽑힌 번호를 누르면 뽑기를 취소한다
//   - 한 번 뽑힌 번호는 "처음부터"를 누를 때까지 다시 안 나온다 (끌 수 있다). 다음 시간에도 이어진다
//   - 설정과 기록은 이 브라우저에만 저장한다 (Firestore 안 씀). 계산은 src/lib/picker.js, 효과는 ./effects.js
//   - 학교 PC 는 Windows "애니메이션 효과"를 꺼 둔 경우가 많고, 브라우저는 이를 '움직임 줄이기'로 알린다.
//     뽑기는 애니메이션이 기능 자체라서 그 설정을 따르지 않는다 (교사가 눌러야 시작하고 몇 초면 끝난다)
//   - 키보드 (이 작은 탭이 보일 때만): Space 뽑기 · R 처음부터 · F 전체 화면
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Bell, BellOff, ChevronDown, Dices, Maximize, Minimize, Minus, Plus, RotateCcw } from "lucide-react";
import { dateKey } from "@/lib/workCalendar";
import {
  CLASS_MAX,
  GRADES,
  PICK_COUNTS,
  SIZE_MAX,
  SIZE_MIN,
  STYLES,
  addPicked,
  availableNumbers,
  classKey,
  classOf,
  hopDelays,
  hopSequence,
  parseClassKey,
  pickNumbers,
  reelSequence,
  resizeClass,
  restorePicker,
  toggleNumber,
  updateClass,
} from "@/lib/picker";
import { createConfetti, createSound } from "./effects";

const STORE_KEY = "class_picker";
const ITEM_H = 1.35; // 카드 높이(em). 슬롯머신 릴은 한 칸에 이만큼씩 올라간다 (아래 h-[1.35em] 과 같게)
const SLOT_EASE = "cubic-bezier(.12,.72,.14,1)"; // 처음엔 빠르게, 끝에서 아주 천천히 멈춘다
const IDLE_CAPTION = { text: "누가 발표할까요?", muted: true };

const today = () => dateKey(new Date());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function load() {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}
function save(value) {
  try {
    localStorage.setItem(STORE_KEY, value);
  } catch {
    // 저장하지 못해도 뽑기는 그대로 쓴다
  }
}

// 위쪽 큰 카드들. num: 보여 줄 번호, step: 번호판 반짝에서 바뀐 횟수(바뀔 때마다 살짝 튀게),
// reel: 슬롯머신에 늘어놓은 번호들, rolling: 굴러가는 중, dur: 굴러가는 시간(ms), landed: 뽑힘
const blankCards = (n) => Array.from({ length: n }, () => ({ num: null, step: 0, landed: false, reel: null, rolling: false, dur: 0 }));
const setCard = (cards, i, patch) => cards.map((c, k) => (k === i ? { ...c, ...patch } : c));

function CardNumber({ n }) {
  return (
    <div className="h-[1.35em] flex items-center justify-center">
      <span className="font-extrabold leading-none tracking-tight tabular-nums">
        {n}
        <small className="text-[0.3em] font-bold ml-[0.08em] tracking-normal">번</small>
      </span>
    </div>
  );
}

function PickSelect({ value, onChange, options, label, disabled }) {
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        disabled={disabled}
        className="appearance-none bg-page border border-line-strong hover:border-ink pl-3 pr-8 py-2 text-[16px] font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" aria-hidden="true" />
    </span>
  );
}

// active: 이 화면이 보이는지 (키보드 단축키를 받을지)
export default function ClassPicker({ active = true }) {
  const [picker, setPicker] = useState(() => restorePicker(load(), today()));
  const [run, setRun] = useState(() => ({ busy: false, cards: blankCards(picker.count), hot: null, caption: IDLE_CAPTION, shake: 0 }));
  const [sizeDraft, setSizeDraft] = useState(null); // 인원 칸에 치는 중인 글자 (Enter·바깥 누르기로 확정)
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const fxRef = useRef(null);
  const soundRef = useRef(null);
  const soundOnRef = useRef(picker.sound);
  const busyRef = useRef(false); // 뽑는 중 (키보드·버튼이 겹쳐 눌려도 한 번만)
  const aliveRef = useRef(true); // 뽑는 도중 화면이 사라지면(로그아웃) 멈춘다

  const key = picker.current;
  const { grade, cls } = parseClassKey(key);
  const klass = classOf(picker);
  const pool = availableNumbers(klass, picker.noRepeat);

  useEffect(() => {
    save(JSON.stringify(picker));
  }, [picker]);
  useEffect(() => {
    soundOnRef.current = picker.sound;
  }, [picker.sound]);

  useEffect(() => {
    aliveRef.current = true;
    fxRef.current = createConfetti(canvasRef.current);
    soundRef.current = createSound();
    return () => {
      aliveRef.current = false;
      fxRef.current?.stop();
      soundRef.current?.close();
    };
  }, []);

  // ── 효과 ──
  const tick = (progress) => soundOnRef.current && soundRef.current?.tick(progress);
  const ding = () => soundOnRef.current && soundRef.current?.ding();
  const burstAt = (i, amount) => {
    const el = stageRef.current?.querySelectorAll("[data-card]")[i];
    if (el) fxRef.current?.burst(el.getBoundingClientRect(), amount);
  };

  // i 번째 카드에 num 이 뽑혔다
  const land = (i, num, total, k) => {
    setPicker((p) => updateClass(p, k, (c) => addPicked(c, num)));
    setRun((r) => ({ ...r, hot: null, cards: setCard(r.cards, i, { num, landed: true }) }));
    ding();
    requestAnimationFrame(() => burstAt(i, total > 1 ? 70 : 130));
  };

  // 번호판 반짝: 번호판 위를 불빛이 뛰어다니며 점점 느려지다 멈춘다. 여러 명이면 한 명씩 차례로
  const runHop = async (p, targets, k) => {
    for (let i = 0; i < targets.length; i++) {
      const hopPool = p.filter((x) => !targets.slice(0, i).includes(x));
      const delays = hopDelays(i === 0);
      const seq = hopSequence(hopPool, targets[i], delays.length);
      for (let s = 0; s < seq.length; s++) {
        if (!aliveRef.current) return;
        const num = seq[s];
        setRun((r) => ({ ...r, hot: num, cards: setCard(r.cards, i, { num, step: s + 1 }) }));
        tick(s / seq.length);
        await sleep(delays[s]);
      }
      if (!aliveRef.current) return;
      setRun((r) => ({ ...r, hot: targets[i], cards: setCard(r.cards, i, { num: targets[i], step: seq.length + 1 }) }));
      await sleep(380);
      if (!aliveRef.current) return;
      land(i, targets[i], targets.length, k);
      if (i < targets.length - 1) await sleep(450);
    }
  };

  // 슬롯머신: 카드마다 번호 줄을 늘어놓고 한꺼번에 굴린다. 왼쪽 카드부터 하나씩 멈춘다
  const runSlot = async (p, targets, k) => {
    const reels = targets.map((t, i) => ({ reel: reelSequence(p, t, 24 + i * 8), dur: 2100 + i * 800 }));
    flushSync(() => setRun((r) => ({ ...r, cards: reels.map(({ reel, dur }) => ({ ...blankCards(1)[0], reel, dur })) })));
    void stageRef.current?.offsetWidth; // 맨 위(처음 위치)를 브라우저가 먼저 그리게 해야 굴러가는 게 보인다
    setRun((r) => ({ ...r, cards: r.cards.map((c) => ({ ...c, rolling: true })) }));

    // 칸이 바뀔 때마다 틱 소리
    let watching = true;
    const last = reels.map(() => 0);
    const watch = () => {
      if (!watching || !aliveRef.current) return;
      stageRef.current?.querySelectorAll("[data-reel]").forEach((el, i) => {
        const style = getComputedStyle(el);
        const y = new DOMMatrixReadOnly(style.transform).m42;
        const idx = Math.round(-y / (parseFloat(style.fontSize) * ITEM_H));
        if (idx !== last[i]) {
          last[i] = idx;
          tick(idx / reels[i].reel.length);
        }
      });
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);

    await Promise.all(
      reels.map(({ dur }, i) => sleep(dur + 60).then(() => aliveRef.current && land(i, targets[i], targets.length, k)))
    );
    watching = false;
  };

  const draw = async () => {
    if (busyRef.current) return;
    const k = key;
    const p = availableNumbers(classOf(picker, k), picker.noRepeat);
    if (!p.length) {
      setRun((r) => ({ ...r, caption: { text: "모두 뽑았어요. ‘처음부터’를 누르면 다시 뽑아요.", muted: false }, shake: r.shake + 1 }));
      return;
    }
    busyRef.current = true;
    soundRef.current?.unlock();
    const targets = pickNumbers(p, picker.count);
    const n = targets.length;
    setRun({ busy: true, cards: blankCards(n), hot: null, caption: { text: "두구두구두구…", muted: true }, shake: 0 });
    try {
      if (picker.style === "slot") await runSlot(p, targets, k);
      else await runHop(p, targets, k);
    } finally {
      busyRef.current = false;
      if (aliveRef.current) {
        const text = `${targets.map((t) => `${t}번`).join(" · ")} ${n > 1 ? "차례로 발표!" : "발표!"}`;
        setRun((r) => ({ ...r, busy: false, hot: null, caption: { text, muted: false } }));
      }
    }
  };

  // ── 설정 바꾸기 (뽑는 중에는 막는다) ──
  const toIdle = (count = picker.count) => setRun((r) => ({ ...r, cards: blankCards(count), hot: null, caption: IDLE_CAPTION }));
  const setPref = (patch) => setPicker((p) => ({ ...p, ...patch }));
  const reset = () => {
    if (busyRef.current) return;
    setPicker((p) => updateClass(p, key, (c) => ({ ...c, picked: [] })));
    toIdle();
  };
  const changeClass = (g, c) => {
    if (busyRef.current) return;
    setPref({ current: classKey(g, c) });
    setSizeDraft(null);
    toIdle();
  };
  const changeCount = (n) => {
    if (busyRef.current) return;
    setPref({ count: n });
    toIdle(n);
  };
  const changeStyle = (style) => {
    if (busyRef.current) return;
    setPref({ style });
    toIdle();
  };
  const commitSize = (value) => {
    setSizeDraft(null);
    if (busyRef.current) return;
    setPicker((p) => updateClass(p, key, (c) => resizeClass(c, value)));
  };
  const onCell = (num) => {
    if (busyRef.current) return;
    setPicker((p) => updateClass(p, key, (c) => toggleNumber(c, num, today())));
  };
  const toggleSound = () => {
    const next = !picker.sound;
    setPref({ sound: next });
    if (next) {
      soundRef.current?.unlock();
      soundRef.current?.ding(); // 켜면 한 번 울려서 소리가 나는지 확인하게 한다
    }
  };

  // 포털 머리말 없이 뽑기만 화면 가득 (프로젝터용)
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const onChange = () => {
      setFullscreen(!!rootRef.current && document.fullscreenElement === rootRef.current);
      fxRef.current?.fit();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── 키보드 ──
  const onKey = useEffectEvent((e) => {
    if (!active && !fullscreen) return;
    const t = e.target;
    if (t instanceof HTMLElement && (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Space") {
      e.preventDefault();
      draw();
    } else if (e.key === "r" || e.key === "R") reset();
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
  });
  useEffect(() => {
    const handler = (e) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 카드 글자 크기: 판 폭을 카드 수로 나눈 만큼 (카드 폭은 글자의 3배). 휴대폰에서 너무 작아지면 두 줄로 넘어간다
  const n = run.cards.length;
  const perCard = `calc((100cqw - ${(n - 1) * 16}px) / ${n} / 3)`;
  const cardFont = fullscreen ? `clamp(3rem, min(${perCard}, 42vh), 24rem)` : `clamp(2.8rem, ${perCard}, 12rem)`;
  const disabled = run.busy;

  return (
    <div
      ref={rootRef}
      className={`relative flex flex-col bg-page text-ink ${fullscreen ? "h-full overflow-auto justify-center px-4 md:px-10" : "border border-line"}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 md:px-4 pt-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
          <div className="flex items-center gap-1.5">
            <span className="text-ink-faint mr-0.5">반</span>
            <PickSelect value={grade} onChange={(g) => changeClass(g, cls)} label="학년" disabled={disabled} options={GRADES.map((g) => [g, `${g}학년`])} />
            <PickSelect
              value={cls}
              onChange={(c) => changeClass(grade, c)}
              label="반"
              disabled={disabled}
              options={Array.from({ length: CLASS_MAX }, (_, i) => [i + 1, `${i + 1}반`])}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-ink-faint mr-0.5">인원</span>
            <div className="inline-flex border border-line-strong">
              <button
                type="button"
                onClick={() => commitSize(klass.size - 1)}
                disabled={disabled || klass.size <= SIZE_MIN}
                aria-label="인원 한 명 줄이기"
                className="w-9 flex items-center justify-center hover:bg-surface transition-colors disabled:opacity-30"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={sizeDraft ?? klass.size}
                onChange={(e) => setSizeDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
                onBlur={() => sizeDraft !== null && commitSize(sizeDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") setSizeDraft(null);
                }}
                onFocus={(e) => e.target.select()}
                disabled={disabled}
                aria-label={`반 인원 (${SIZE_MIN}~${SIZE_MAX}명)`}
                className="w-12 py-2 text-center text-[16px] font-bold bg-transparent border-x border-line outline-none focus:bg-accent/10 disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => commitSize(klass.size + 1)}
                disabled={disabled || klass.size >= SIZE_MAX}
                aria-label="인원 한 명 늘리기"
                className="w-9 flex items-center justify-center hover:bg-surface transition-colors disabled:opacity-30"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <span className="text-ink-faint">명</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-ink-faint">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={picker.sound}
            title={picker.sound ? "소리 켜짐 (누르면 끔)" : "소리 꺼짐 (누르면 켬)"}
            className="p-2 hover:text-ink transition-colors"
          >
            {picker.sound ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            <span className="sr-only">{picker.sound ? "소리 끄기" : "소리 켜기"}</span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={fullscreen ? "전체 화면 나가기 (F)" : "전체 화면 (F)"}
            className="p-2 hover:text-ink transition-colors"
          >
            {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            <span className="sr-only">{fullscreen ? "전체 화면 나가기" : "전체 화면"}</span>
          </button>
        </div>
      </header>

      {/* 큰 카드. 다 뽑았는데 또 누르면 좌우로 흔든다 (shake 가 바뀌면 다시 그려서 애니메이션을 처음부터) */}
      <div key={run.shake} className={run.shake ? "picker-shake" : ""}>
        <div ref={stageRef} className="[container-type:inline-size] flex flex-wrap justify-center gap-4 px-4 pt-7">
          {run.cards.map((c, i) => (
            <div
              key={i}
              data-card
              style={{ fontSize: cardFont }}
              className={`relative shrink-0 w-[3em] h-[1.35em] overflow-hidden border transition-colors duration-200 ${
                c.landed
                  ? "bg-accent border-accent text-accent-ink picker-pop"
                  : c.reel || c.num != null
                  ? "bg-page border-ink"
                  : "border-dashed border-line-strong text-ink-ghost"
              }`}
            >
              {c.reel ? (
                <div
                  data-reel
                  className="will-change-transform"
                  style={{
                    transform: `translateY(${c.rolling ? -(c.reel.length - 1) * ITEM_H : 0}em)`,
                    transition: c.rolling ? `transform ${c.dur}ms ${SLOT_EASE}` : "none",
                  }}
                >
                  {c.reel.map((num, k) => (
                    <CardNumber key={k} n={num} />
                  ))}
                </div>
              ) : c.num != null ? (
                <div key={c.step} className={c.step && !c.landed ? "picker-tick" : ""}>
                  <CardNumber n={c.num} />
                </div>
              ) : (
                <div className="h-[1.35em] flex items-center justify-center font-extrabold leading-none">?</div>
              )}
              {c.landed && n > 1 && (
                <span className="absolute top-[0.16em] left-[0.2em] font-mono font-bold opacity-75" style={{ fontSize: "max(0.1em, 11px)" }}>
                  {i + 1}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <p
        aria-live="polite"
        className={`mx-4 mt-4 min-h-[1.5em] text-center tracking-tight ${fullscreen ? "text-[clamp(22px,3vw,40px)]" : "text-[clamp(17px,2.2vw,26px)]"} ${
          run.caption.muted ? "text-ink-faint font-medium" : "font-bold"
        }`}
      >
        {run.caption.text}
      </p>

      <div className="flex flex-wrap justify-center items-center gap-3 px-4 pt-5 pb-1.5">
        <button
          type="button"
          onClick={draw}
          disabled={disabled}
          className="inline-flex items-center gap-2 bg-ink text-page border border-ink hover:bg-accent hover:border-accent px-11 py-4 text-[18px] font-semibold transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <Dices className="w-5 h-5" /> 뽑기
        </button>
        <div role="group" aria-label="한 번에 뽑을 수" className="inline-flex items-center gap-1.5 text-[14px]">
          <span className="text-ink-faint mr-0.5">한 번에</span>
          {PICK_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => changeCount(count)}
              aria-pressed={picker.count === count}
              disabled={disabled}
              className={`min-w-[46px] py-3 border text-[15px] font-semibold transition-colors disabled:opacity-40 ${
                picker.count === count ? "bg-ink text-page border-ink" : "border-line-strong hover:border-ink"
              }`}
            >
              {count}명
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={disabled}
          className="inline-flex items-center gap-2 border border-line-strong hover:border-ink px-5 py-3.5 text-[15px] font-semibold transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <RotateCcw className="w-4 h-4" /> 처음부터
        </button>
      </div>

      <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 px-4 pt-2 text-[13px]">
        <div role="group" aria-label="애니메이션" className="inline-flex items-center gap-2">
          <span className="text-ink-faint">애니메이션</span>
          <div className="inline-flex border border-ink">
            {STYLES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => changeStyle(s.id)}
                aria-pressed={picker.style === s.id}
                disabled={disabled}
                className={`px-3 py-1.5 font-semibold transition-colors ${i > 0 ? "border-l border-ink" : ""} ${
                  picker.style === s.id ? "bg-ink text-page" : "hover:bg-surface"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-ink/70">
          <input
            type="checkbox"
            checked={picker.noRepeat}
            onChange={(e) => setPref({ noRepeat: e.target.checked })}
            disabled={disabled}
            className="w-4 h-4 accent-black"
          />
          한 번 뽑힌 번호는 빼고 뽑기
        </label>
      </div>

      <div className="mt-6 border-t border-line">
        <div className="flex flex-wrap justify-between items-baseline gap-x-3 gap-y-1 px-4 pt-6 pb-2 font-mono text-[12px] text-ink-faint">
          <span>
            {grade}학년 {cls}반 · {klass.size}명 중 뽑을 수 있는 번호 {pool.length}개{klass.absent.length > 0 && ` · 결석 ${klass.absent.length}명`}
          </span>
          <span>번호를 누르면 결석으로 빼요 (오늘만)</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5 px-4 pb-3.5">
          {Array.from({ length: klass.size }, (_, k) => k + 1).map((num) => {
            const order = klass.picked.indexOf(num);
            const absent = klass.absent.includes(num);
            const hot = run.hot === num;
            return (
              <button
                key={num}
                type="button"
                onClick={() => onCell(num)}
                disabled={disabled}
                aria-label={`${num}번${absent ? " 결석" : order >= 0 ? ` (${order + 1}번째로 뽑힘)` : ""}`}
                className={`relative aspect-square border flex flex-col items-center justify-center ${
                  hot
                    ? "bg-accent border-accent text-accent-ink scale-110 z-10 shadow-lg shadow-accent/40"
                    : `transition-[background-color,border-color,color,transform] duration-200 ${
                        order >= 0
                          ? "bg-ink border-ink text-page"
                          : absent
                          ? "picker-absent border-dashed border-line-strong text-ink-ghost"
                          : "bg-page border-line-strong hover:border-ink"
                      }`
                }`}
              >
                {order >= 0 && !hot && <i className="absolute top-[3px] left-[5px] not-italic font-mono font-bold text-[10px] text-accent">{order + 1}</i>}
                <b className="text-[20px] font-extrabold leading-none">{num}</b>
                {absent && <span className="mt-[3px] text-[10px] text-ink-faint">결석</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3.5 min-h-[44px] text-[14px]">
          {klass.picked.length > 0 && <span className="mr-1 text-[12px] text-ink-faint">뽑힌 순서</span>}
          {klass.picked.map((num, k) => (
            <span key={num} className="border border-ink px-2.5 py-1.5 font-bold picker-pop">
              <i className="not-italic mr-1.5 font-mono text-[11px] text-accent">{k + 1}</i>
              {num}번
            </span>
          ))}
        </div>
      </div>

      <footer className="hidden md:block short:hidden pb-4 text-center font-mono text-[11px] text-ink-faint">Space 뽑기 · R 처음부터 · F 전체 화면</footer>

      <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 w-screen h-screen pointer-events-none z-50" />
    </div>
  );
}
