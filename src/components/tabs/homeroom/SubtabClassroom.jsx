// 내 학급 "교실 화면" 작은 탭: 미리보기 + 전체 화면으로 띄우기 (새 주소 없이 브라우저 전체 화면 기능을 쓴다).
import { useEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import ClassroomScreen from "./ClassroomScreen";

export default function SubtabClassroom({ grade, classNum }) {
  const { toast } = useDialog();
  const boxRef = useRef(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(!!boxRef.current && document.fullscreenElement === boxRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 전체 화면으로 띄워 둔 동안에는 화면이 꺼지지 않게 한다 (되는 브라우저에서만)
  useEffect(() => {
    if (!full || !navigator.wakeLock) return undefined;
    let lock = null;
    let done = false;
    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (done) l.release().catch(() => {});
        else lock = l;
      })
      .catch(() => {});
    return () => {
      done = true;
      lock?.release().catch(() => {});
    };
  }, [full]);

  const enterFull = async () => {
    try {
      await boxRef.current?.requestFullscreen();
    } catch {
      toast("이 기기에서는 전체 화면을 쓸 수 없어요. 교실 컴퓨터나 TV 브라우저에서 열어 주세요.", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 bg-surface border border-line rounded-card p-5 md:p-6">
        <div className="min-w-0">
          <h3 className="text-[18px] md:text-[20px] font-bold text-white">교실 화면</h3>
          <p className="mt-1 text-[13px] text-ink-muted leading-relaxed">
            교실 TV·전자칠판에 띄워 두는 화면이에요. 시간표·급식·학사일정이 저절로 바뀌어요. 전체 화면에서 Esc 를 누르면 돌아와요.
          </p>
        </div>
        <button
          type="button"
          onClick={enterFull}
          className="flex items-center justify-center gap-2 shrink-0 px-5 py-3 rounded-full bg-emerald-400 hover:bg-emerald-300 text-[#052e22] text-[14px] font-bold transition-colors active:scale-95"
        >
          <Maximize className="w-4 h-4" strokeWidth={2.4} />
          전체 화면으로 띄우기
        </button>
      </div>

      <div
        ref={boxRef}
        className={full ? "w-full h-full bg-[#2b2b2b]" : "w-full aspect-video bg-[#2b2b2b] rounded-card overflow-hidden border border-line"}
      >
        <ClassroomScreen grade={grade} classNum={classNum} />
      </div>
    </div>
  );
}
