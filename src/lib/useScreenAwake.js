// 교실 화면을 띄워 둘 때 쓰는 훅: 화면 꺼짐 막기 · 전체 화면 · 지금 시각.
import { useEffect, useState } from "react";

/** on 인 동안 화면이 꺼지지 않게 한다 (되는 브라우저에서만). 다른 창을 봤다 돌아오면 다시 건다 */
export function useWakeLock(on) {
  useEffect(() => {
    if (!on || !navigator.wakeLock) return undefined;
    let lock = null;
    let done = false;
    const request = () => {
      if (done || document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (done) l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", request);
      lock?.release().catch(() => {});
    };
  }, [on]);
}

/** ref 요소가 전체 화면인지, 그리고 전체 화면으로 들어가는 함수 (안 되면 예외) */
export function useFullscreen(ref) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);
  const enter = async () => {
    await ref.current?.requestFullscreen();
  };
  return [full, enter];
}

/** ms 마다 바뀌는 지금 시각 */
export function useNow(ms = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
