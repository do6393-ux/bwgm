import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react";
import { DialogContext, takeReloadToast } from "./dialogContext";

const TOAST_MS = { success: 3000, info: 3500, error: 5000 };
const MAX_TOASTS = 3;

const TOAST_STYLE = {
  success: { bar: "bg-ok", icon: Check, iconClass: "text-ok", label: "완료" },
  error: { bar: "bg-danger", icon: TriangleAlert, iconClass: "text-danger", label: "오류" },
  info: { bar: "bg-accent", icon: Info, iconClass: "text-accent", label: "알림" },
};

/**
 * 앱 전체의 알림창(confirm/alert)과 토스트.
 * 색·모서리는 현재 탭 테마(<html data-theme>)를 따라가므로 탭마다 자연스럽게 어울린다.
 * 사용법은 dialogContext.js 의 useDialog 설명 참고.
 */
export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const current = useRef(null); // 지금 열려 있는 알림창 (결과를 돌려줄 resolve 를 들고 있다)
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const timers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message, type = "info") => {
      const kind = TOAST_STYLE[type] ? type : "info";
      const id = ++toastId.current;
      setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { id, message, type: kind }]);
      timers.current.set(id, setTimeout(() => dismissToast(id), TOAST_MS[kind]));
    },
    [dismissToast]
  );

  // 한 번에 하나의 알림창만 띄운다. 열려 있는 중에 새로 부르면 이전 것은 취소로 처리한다.
  const open = useCallback((kind, message, options = {}) => {
    return new Promise((resolve) => {
      current.current?.resolve(current.current.kind === "alert" ? undefined : false);
      current.current = { kind, message, ...options, resolve };
      setDialog(current.current);
    });
  }, []);

  const confirm = useCallback((message, options) => open("confirm", message, options), [open]);
  const alert = useCallback((message, options) => open("alert", message, options), [open]);

  const close = useCallback((result) => {
    const d = current.current;
    current.current = null;
    setDialog(null);
    d?.resolve(result);
  }, []);

  // 새로고침 직전에 예약된 알림(예: 설정 저장)을 첫 화면에서 보여준다
  useEffect(() => {
    const pending = takeReloadToast();
    if (pending) toast(pending.message, pending.type);
  }, [toast]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const value = useMemo(() => ({ confirm, alert, toast }), [confirm, alert, toast]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && <DialogView dialog={dialog} onClose={close} />}
      <ToastView toasts={toasts} onDismiss={dismissToast} />
    </DialogContext.Provider>
  );
}

function DialogView({ dialog, onClose }) {
  const { kind, message, title, confirmText, cancelText, danger } = dialog;
  const isConfirm = kind === "confirm";
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const okRef = useRef(null);

  // 열릴 때 포커스를 옮기고, 닫히면 원래 있던 곳으로 돌려준다.
  // 되돌릴 수 없는 작업(danger)은 실수로 Enter 를 눌러도 실행되지 않도록 "취소"에 먼저 둔다.
  useEffect(() => {
    const previous = document.activeElement;
    (danger && isConfirm ? cancelRef.current : okRef.current)?.focus();
    return () => previous?.focus?.();
  }, [danger, isConfirm]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose(isConfirm ? false : undefined);
      return;
    }
    // 창 밖으로 포커스가 나가지 않게 Tab 을 가둔다
    if (e.key === "Tab") {
      const items = panelRef.current?.querySelectorAll("button");
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      className="ui-fade fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        // 어두운 바깥을 누르면 취소 (확인창은 안전한 쪽인 "취소"로)
        if (e.target === e.currentTarget) onClose(isConfirm ? false : undefined);
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role={isConfirm ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={title ? "ui-dialog-title" : undefined}
        aria-describedby="ui-dialog-message"
        className="ui-pop w-full max-w-sm rounded-dialog border border-line bg-surface p-6 text-ink shadow-2xl"
      >
        {title && (
          <h3 id="ui-dialog-title" className="mb-2 text-[17px] font-bold tracking-tight text-ink-strong">
            {title}
          </h3>
        )}
        <p id="ui-dialog-message" className="whitespace-pre-line text-[14px] leading-relaxed text-ink">
          {message}
        </p>

        <div className="mt-6 flex justify-end gap-2.5 font-sans">
          {isConfirm && (
            <button
              ref={cancelRef}
              type="button"
              onClick={() => onClose(false)}
              className="rounded-control border border-line px-5 py-2.5 text-[13px] font-medium text-ink-muted transition-colors hover:border-line-hover hover:text-ink-strong"
            >
              {cancelText || "취소"}
            </button>
          )}
          <button
            ref={okRef}
            type="button"
            onClick={() => onClose(isConfirm ? true : undefined)}
            className={`rounded-control px-5 py-2.5 text-[13px] font-bold transition-opacity hover:opacity-90 ${
              danger ? "bg-danger text-white" : "bg-accent text-accent-ink"
            }`}
          >
            {confirmText || "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastView({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[110] flex flex-col items-stretch gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:w-96">
      {toasts.map((t) => {
        const style = TOAST_STYLE[t.type];
        const Icon = style.icon;
        return (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            onClick={() => onDismiss(t.id)}
            className="ui-pop pointer-events-auto relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-dialog border border-line bg-surface py-3 pr-3 pl-5 text-ink shadow-xl"
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} aria-hidden="true" />
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} aria-label={style.label} />
            <p className="flex-1 whitespace-pre-line text-[13px] leading-relaxed">{t.message}</p>
            <button
              type="button"
              aria-label="닫기"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(t.id);
              }}
              className="shrink-0 text-ink-muted transition-colors hover:text-ink-strong"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
