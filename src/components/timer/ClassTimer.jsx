// 정보 수업 탭의 "수업 타이머" 작은 탭 (주소 #timer). 로그인 없이 누구나 쓴다.
// 프로젝터에 띄우는 것을 생각해 숫자를 크게 보여 주고, 전체 화면을 누르면 타이머만 화면 가득 나온다.
//   - 작은 탭을 옮기거나 교무실 등 다른 탭을 봐도 계속 돈다 (화면을 숨겨 둘 뿐이라서). 끝나면 어디서든 울린다
//   - 키보드 단축키는 이 작은 탭이 보일 때만 (active)
//   - 남은 시간은 끝나는 시각에서 계산한다 (탭을 옮기거나 컴퓨터가 느려도 정확하다)
//   - 끝나면 삐 소리 세 번 (소리 끄기 가능), 실행 중에는 화면이 꺼지지 않게 한다 (지원하는 브라우저만)
//   - 멈춰 있을 때 큰 숫자를 누르면(또는 Enter) 분·초를 직접 칠 수 있다
//   - 키보드: Space 시작·정지, R 처음으로, F 전체 화면, ↑↓ 1분, ←→ 10초
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Bell, BellOff, Maximize, Minimize, Pause, Play, RotateCcw } from "lucide-react";
import {
  DEFAULT_DURATION,
  MINUTE,
  PRESET_MINUTES,
  SECOND,
  clampDuration,
  describeDuration,
  digits2,
  durationFromInput,
  formatClock,
  remainingAt,
  remainingRatio,
  timerPhase,
} from "@/lib/timer";

const STORE = { duration: "class_timer_duration", label: "class_timer_label", sound: "class_timer_sound" };
const LABEL_MAX = 40;

function load(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장하지 못해도 타이머는 그대로 쓴다
  }
}

const PHASE_TEXT = {
  normal: "text-ink",
  "last-minute": "text-accent",
  final: "text-danger motion-safe:animate-pulse",
  done: "text-danger motion-safe:animate-pulse",
};
const PHASE_BAR = { normal: "bg-ink", "last-minute": "bg-accent", final: "bg-danger", done: "bg-danger" };

function Btn({ onClick, children, primary = false, className = "", ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 border font-medium transition-colors disabled:opacity-30 disabled:pointer-events-none ${
        primary ? "bg-ink text-page border-ink hover:bg-accent hover:border-accent" : "border-line-strong hover:border-ink"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// active: 이 화면이 보이는지 (키보드 단축키를 받을지). onBadge: 도는 동안 탭 이름 옆에 보일 글자 (남은 시간)
export default function ClassTimer({ active = true, onBadge }) {
  const [duration, setDurationState] = useState(() => clampDuration(Number(load(STORE.duration)) || DEFAULT_DURATION));
  const [status, setStatus] = useState("idle"); // idle | running | paused | done
  const [total, setTotal] = useState(duration); // 지금 돌고 있는 회차의 길이 (진행 막대 기준)
  const [endAt, setEndAt] = useState(0);
  const [pausedLeft, setPausedLeft] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [label, setLabel] = useState(() => load(STORE.label) || "");
  const [sound, setSound] = useState(() => load(STORE.sound) !== "off");
  const [fullscreen, setFullscreen] = useState(false);
  const [draft, setDraft] = useState(null); // 숫자를 눌러 직접 입력하는 중이면 { m: "05", s: "00" }
  const audioRef = useRef(null);
  const rootRef = useRef(null);
  const minRef = useRef(null);
  const secRef = useRef(null);
  const cancelRef = useRef(false);
  const caretEndRef = useRef(false); // 다음 포커스 때 전체 선택 대신 커서를 끝에 둔다

  const left =
    status === "running" ? remainingAt(endAt, now) : status === "paused" ? pausedLeft : status === "done" ? 0 : duration;
  const length = status === "idle" ? duration : total;
  const phase = status === "idle" ? "normal" : timerPhase(left, length);
  const clock = formatClock(left);

  // ── 소리 ── 브라우저는 사용자가 누른 뒤에만 소리를 허락하므로, 시작 버튼을 누를 때 준비해 둔다
  const unlockAudio = () => {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      audioRef.current.resume?.();
    } catch {
      audioRef.current = null;
    }
  };
  const beep = (times) => {
    const ctx = audioRef.current;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < times; i++) {
      const start = t0 + i * 0.45;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    }
  };

  // ── 동작 ──
  const start = () => {
    unlockAudio();
    const t = Date.now();
    const runLength = status === "paused" ? pausedLeft : duration;
    if (status !== "paused") setTotal(duration);
    setEndAt(t + runLength);
    setNow(t);
    setStatus("running");
  };
  const pause = () => {
    setPausedLeft(remainingAt(endAt, Date.now()));
    setStatus("paused");
  };
  const reset = () => setStatus("idle");
  const toggle = () => (status === "running" ? pause() : start());

  const setDuration = (ms) => {
    const next = clampDuration(ms);
    setDurationState(next);
    save(STORE.duration, String(next));
    setStatus("idle");
  };
  const adjust = (delta) => setDuration(duration + delta);

  // ── 직접 입력: 멈춰 있을 때 큰 숫자를 누르면 분·초 칸이 된다 ──
  const editable = status === "idle" || status === "done";
  // firstDigit: 숫자 키를 눌러 바로 시작했으면 그 숫자부터 분 칸에 넣는다 (7 → Enter 면 7분)
  const startEdit = (firstDigit) => {
    if (!editable) return;
    const [m, s] = formatClock(duration).split(":");
    cancelRef.current = false;
    const digit = typeof firstDigit === "string" ? digits2(firstDigit) : "";
    caretEndRef.current = !!digit;
    setStatus("idle");
    setDraft(digit ? { m: digit, s: "00" } : { m, s });
  };
  const commitEdit = () => {
    if (!draft) return;
    if (!cancelRef.current) {
      const ms = durationFromInput(draft.m, draft.s);
      if (ms !== null) setDuration(ms);
    }
    setDraft(null);
  };
  const cancelEdit = () => {
    cancelRef.current = true;
    setDraft(null);
  };
  // 분·초 칸 사이를 오갈 때는 끝내지 않는다. 바깥을 누르면 입력한 시간으로 맞춘다
  const onDraftBlur = (e) => {
    if (e.relatedTarget === minRef.current || e.relatedTarget === secRef.current) return;
    commitEdit();
  };
  const onDraftKey = (e, field) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (field === "m" && (e.key === ":" || (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length))) {
      e.preventDefault();
      secRef.current?.focus();
    } else if (field === "s" && (e.key === "Backspace" || e.key === "ArrowLeft") && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      e.preventDefault();
      minRef.current?.focus();
    }
  };
  const onDraftChange = (field, value) => {
    const v = digits2(value);
    setDraft((d) => ({ ...d, [field]: v }));
    if (field === "m" && v.length === 2) secRef.current?.focus(); // 분 두 자리를 치면 초 칸으로
  };
  useEffect(() => {
    if (draft && document.activeElement !== minRef.current && document.activeElement !== secRef.current) {
      minRef.current?.focus();
    }
  }, [draft]);

  // 돌고 있거나 멈춘 타이머에 시간 더하기. 끝난 뒤에는 그 시간만큼 새로 시작한다
  const extend = (ms) => {
    unlockAudio();
    const t = Date.now();
    if (status === "running") {
      setEndAt((e) => e + ms);
      setTotal((v) => v + ms);
    } else if (status === "paused") {
      setPausedLeft((v) => v + ms);
      setTotal((v) => v + ms);
    } else {
      setTotal(ms);
      setEndAt(t + ms);
      setNow(t);
      setStatus("running");
    }
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    save(STORE.sound, next ? "on" : "off");
    if (next) {
      unlockAudio();
      beep(1); // 켜면 한 번 울려서 소리가 나는지 확인하게 한다
    }
  };

  // 포털 머리말 없이 타이머만 화면 가득 (프로젝터용)
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  // ── 시계: 도는 동안 0.2초마다 다시 그린다. 끝나는 순간 소리를 낸다 ──
  const onFinish = useEffectEvent(() => {
    setStatus("done");
    if (sound) beep(3);
  });
  useEffect(() => {
    if (status !== "running") return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt) onFinish();
    }, 200);
    return () => clearInterval(id);
  }, [status, endAt]);

  // ── 키보드 ──
  const onKey = useEffectEvent((e) => {
    if (!active && !fullscreen) return;
    if (e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const idle = status === "idle" || status === "done";
    if (e.key === "Enter") {
      // 버튼에 포커스가 있으면 그 버튼을 누르게 둔다
      if (!(e.target instanceof HTMLElement && e.target.tagName === "BUTTON") && idle) {
        e.preventDefault();
        startEdit();
      }
      return;
    }
    if (idle && /^[0-9]$/.test(e.key)) {
      e.preventDefault();
      startEdit(e.key);
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      toggle();
    } else if (e.key === "r" || e.key === "R") reset();
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    else if (idle && e.key === "ArrowUp") adjust(MINUTE);
    else if (idle && e.key === "ArrowDown") adjust(-MINUTE);
    else if (idle && e.key === "ArrowRight") adjust(10 * SECOND);
    else if (idle && e.key === "ArrowLeft") adjust(-10 * SECOND);
    else return;
    if (e.key.startsWith("Arrow")) e.preventDefault();
  });
  useEffect(() => {
    const handler = (e) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── 전체 화면 상태 따라가기 (Esc 로 나와도) ──
  useEffect(() => {
    const onChange = () => setFullscreen(!!rootRef.current && document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── 도는 동안 화면이 꺼지지 않게 (프로젝터용 노트북 절전 방지) ──
  useEffect(() => {
    if (status !== "running" || !("wakeLock" in navigator)) return undefined;
    let lock = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (stopped) l.release();
        else lock = l;
      } catch {
        // 지원하지 않거나 거절되면 그냥 둔다
      }
    };
    acquire();
    const onVisible = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [status]);

  // ── 브라우저 탭 제목·작은 탭 이름에 남은 시간 (멈춰 있을 때는 원래 제목) ──
  const originalTitle = useRef(document.title);
  const title = status === "done" ? "⏰ 시간 종료 · 수업 타이머" : status === "idle" ? null : `${clock} · 수업 타이머`;
  useEffect(() => {
    document.title = title ?? originalTitle.current;
  }, [title]);
  useEffect(() => {
    const original = originalTitle.current;
    return () => {
      document.title = original;
    };
  }, []);
  const badge = status === "idle" ? null : status === "done" ? "종료" : clock;
  useEffect(() => {
    onBadge?.(badge);
  }, [badge, onBadge]);

  const statusText =
    status === "done"
      ? "시간 종료!"
      : status === "paused"
      ? "일시 정지"
      : status === "running"
      ? `${describeDuration(total)} 타이머`
      : draft
      ? "분·초를 입력하고 Enter (취소는 Esc)"
      : `${describeDuration(duration)} 타이머 · 숫자를 눌러 직접 입력`;

  return (
    <div
      ref={rootRef}
      className={`flex flex-col bg-page text-ink transition-colors ${fullscreen ? "h-full px-4 md:px-10" : "border border-line"} ${
        status === "done" ? "bg-danger/10" : ""
      }`}
    >
      <header className="flex items-center justify-end gap-4 px-2 md:px-4 py-2 font-mono text-[12px] text-ink-faint">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            title={sound ? "끝날 때 소리 켜짐 (누르면 끔)" : "끝날 때 소리 꺼짐 (누르면 켬)"}
            className="p-2 hover:text-ink transition-colors"
          >
            {sound ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            <span className="sr-only">{sound ? "소리 끄기" : "소리 켜기"}</span>
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

      <main className={`flex-1 flex flex-col items-center justify-center px-4 ${fullscreen ? "gap-6 md:gap-8 short:gap-3 pb-8 short:pb-4" : "gap-5 md:gap-6 pb-8"}`}>
        <input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            save(STORE.label, e.target.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={LABEL_MAX}
          placeholder="무엇을 하는 시간인가요? (예: 모둠 활동)"
          aria-label="타이머 이름"
          className={`w-full max-w-4xl text-center bg-transparent text-[22px] md:text-[clamp(1.5rem,3.2vw,3rem)] font-medium tracking-tight outline-none border-b-2 border-transparent hover:border-line focus:border-ink transition-colors ${
            status === "idle" ? "placeholder:text-ink-ghost" : "placeholder:text-transparent"
          }`}
        />

        {/* 숫자는 Pretendard (Space Mono 의 0 은 가운데 점이 있어 멀리서 읽기 어렵다). tabular-nums 로 자릿수 폭을 고정 */}
        <div
          role="timer"
          aria-label={`남은 시간 ${clock}`}
          className={`font-sans font-extrabold tabular-nums leading-none tracking-tight ${
            fullscreen ? "text-[clamp(4.5rem,min(27vw,36vh),26rem)]" : "text-[clamp(4rem,min(16vw,22vh),14rem)]"
          } ${draft ? "text-ink" : PHASE_TEXT[phase]}`}
        >
          {draft ? (
            <div className="flex items-center justify-center">
              {[
                { field: "m", ref: minRef, label: "분" },
                { field: "s", ref: secRef, label: "초" },
              ].map(({ field, ref, label }, i) => (
                <span key={field} className="flex items-center">
                  {i > 0 && <span aria-hidden="true">:</span>}
                  <input
                    ref={ref}
                    value={draft[field]}
                    onChange={(e) => onDraftChange(field, e.target.value)}
                    onKeyDown={(e) => onDraftKey(e, field)}
                    onFocus={(e) => {
                      if (caretEndRef.current) {
                        caretEndRef.current = false;
                        const end = e.target.value.length;
                        e.target.setSelectionRange(end, end);
                      } else {
                        e.target.select();
                      }
                    }}
                    onBlur={onDraftBlur}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={2}
                    placeholder="00"
                    aria-label={label}
                    className="w-[1.25em] h-[1em] p-0 leading-none bg-transparent text-center outline-none border-b-[0.03em] border-ink-ghost focus:border-accent placeholder:text-ink-ghost caret-accent"
                  />
                </span>
              ))}
            </div>
          ) : editable ? (
            <button type="button" onClick={() => startEdit()} title="눌러서 분·초 직접 입력 (Enter)" className="cursor-text hover:opacity-70 transition-opacity">
              {clock}
            </button>
          ) : (
            clock
          )}
        </div>

        <div className="w-full max-w-5xl h-2 md:h-3 bg-surface" aria-hidden="true">
          <div
            className={`h-full ${PHASE_BAR[phase]} ${status === "running" ? "transition-[width] duration-200 ease-linear" : ""}`}
            style={{ width: `${remainingRatio(left, length) * 100}%` }}
          />
        </div>

        <p className={`font-mono text-[14px] md:text-[16px] ${status === "done" ? "text-danger font-bold text-[20px] md:text-[28px]" : "text-ink-faint"}`} aria-live="polite">
          {statusText}
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {status === "running" ? (
            <Btn primary onClick={pause} className="px-8 py-4 text-[17px]">
              <Pause className="w-5 h-5" /> 일시 정지
            </Btn>
          ) : (
            <Btn primary onClick={start} className="px-8 py-4 text-[17px]">
              <Play className="w-5 h-5" /> {status === "paused" ? "계속" : status === "done" ? "다시 시작" : "시작"}
            </Btn>
          )}
          {status !== "idle" && (
            <Btn onClick={() => extend(MINUTE)} className="px-5 py-4 text-[15px]">
              {status === "done" ? "1분 더" : "+1분"}
            </Btn>
          )}
          {status !== "idle" && (
            <Btn onClick={reset} className="px-5 py-4 text-[15px]">
              <RotateCcw className="w-4 h-4" /> 처음으로
            </Btn>
          )}
        </div>

        {/* 시간 고르기: 멈춰 있을 때만 누를 수 있다. 도는 동안에도 자리는 남겨 둬서 숫자가 위아래로 움직이지 않게 한다 */}
        <div className={`flex flex-col items-center gap-3 ${status === "running" || status === "paused" ? "invisible" : ""}`}>
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap justify-center gap-2">
            {PRESET_MINUTES.map((m) => {
              const active = status === "idle" && duration === m * MINUTE;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m * MINUTE)}
                  aria-pressed={active}
                  className={`min-w-[72px] px-4 py-2.5 border text-[15px] font-medium transition-colors ${
                    active ? "bg-ink text-page border-ink" : "border-line-strong hover:border-ink"
                  }`}
                >
                  {m}분
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-[14px]">
            <Btn onClick={() => adjust(-MINUTE)} className="px-3 py-2">−1분</Btn>
            <Btn onClick={() => adjust(-10 * SECOND)} className="px-3 py-2">−10초</Btn>
            <Btn onClick={() => adjust(10 * SECOND)} className="px-3 py-2">+10초</Btn>
            <Btn onClick={() => adjust(MINUTE)} className="px-3 py-2">+1분</Btn>
          </div>
        </div>
      </main>

      <footer className="hidden md:block short:hidden pb-4 text-center font-mono text-[11px] text-ink-faint">
        Enter 직접 입력 · Space 시작·정지 · R 처음으로 · F 전체 화면 · ↑↓ 1분 · ←→ 10초
      </footer>
    </div>
  );
}
