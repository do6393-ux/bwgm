import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { loadSynced, saveLocal } from "@/lib/syncedStorage";
import { encodeGrid, decodeGrid } from "@/lib/gridCodec";
import { doc, setDoc } from "firebase/firestore";
import { ArrowUp, ArrowDown, Download, X, FileUp } from "lucide-react";
import JSZip from "jszip";
import { useDialog } from "@/components/ui/dialogContext";

const CLEANING_AREAS = [
  "교실 쓸기 - 창", "교실 쓸기 - 중앙", "교실 쓸기 - 복도",
  "컴퓨터실 - 창문쪽", "컴퓨터실 - 복도쪽", "교탁 및 칠판"
];

export default function SubtabCleaning({ userId, grade, classNum, contacts, currentUser }) {
  const { toast } = useDialog();
  const [cleaningData, setCleaningData] = useState(() => Array(6).fill().map(() => Array(5).fill(null)));
  const [activeSlot, setActiveSlot] = useState(null);
  const [hwpxBlob, setHwpxBlob] = useState(null);

  const loadSeqRef = useRef(0);
  const loadCleaningGrid = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const key = `${userId}_${grade}_${classNum}`;
    // Firestore 를 기준으로 불러오고, 서버에 못 올라간 더 최근 로컬 사본이 있으면 그걸 쓴다
    const ref = doc(db, "homeroom_cleaning", key);
    const loaded = await loadSynced(`cleaning_grid_${key}`, ref, (d) => decodeGrid(d.grid), {
      // 예전에 서버 저장이 실패해 이 기기에만 남아 있던 배정은, 열어 보는 순간 서버로 올린다
      onLocalNewer: (local, localTs) => setDoc(ref, { userId, grade, classNum, grid: encodeGrid(local), updatedAt: localTs || new Date().toISOString() }),
    });
    if (seq !== loadSeqRef.current) return; // 그 사이 학급이 바뀌었으면 늦게 온 응답은 버린다
    setCleaningData(loaded || Array(6).fill().map(() => Array(5).fill(null)));
  }, [userId, grade, classNum]);

  useEffect(() => { loadCleaningGrid(); }, [loadCleaningGrid]);

  const saveCleaningGrid = async (grid) => {
    setCleaningData(grid);
    const key = `${userId}_${grade}_${classNum}`;
    const updatedAt = saveLocal(`cleaning_grid_${key}`, grid);
    // 서버(Firestore)는 2차원 배열을 못 받으므로 encodeGrid 로 풀어서 올린다. 실패하면 조용히 넘기지 않고 알린다.
    try {
      await setDoc(doc(db, "homeroom_cleaning", key), { userId, grade, classNum, grid: encodeGrid(grid), updatedAt });
    } catch (e) {
      console.error("Cleaning save error:", e);
      toast("서버에 저장하지 못했습니다. 이 기기에는 저장됐어요. 연결을 확인한 뒤 다시 시도해 주세요.", "error");
    }
  };

  const handleRotateUp = () => {
    const next = Array(6).fill().map(() => Array(5).fill(null));
    for (let r = 0; r < 6; r++) { const prevR = (r - 1 + 6) % 6; for (let c = 0; c < 5; c++) next[prevR][c] = cleaningData[r][c]; }
    saveCleaningGrid(next);
  };

  const handleRotateDown = () => {
    const next = Array(6).fill().map(() => Array(5).fill(null));
    for (let r = 0; r < 6; r++) { const nextR = (r + 1) % 6; for (let c = 0; c < 5; c++) next[nextR][c] = cleaningData[r][c]; }
    saveCleaningGrid(next);
  };

  const handleAssignStudent = (student) => {
    if (!activeSlot) return;
    const next = cleaningData.map((row) => [...row]);
    next[activeSlot.row][activeSlot.col] = student ? { num: student.num, name: student.name } : null;
    saveCleaningGrid(next);
    setActiveSlot(null);
  };

  const handleDownloadHwpx = async () => {
    if (!hwpxBlob) return toast("등록된 HWPX 양식 파일이 없습니다. 먼저 양식을 올려 주세요.", "info");
    try {
      const zip = await JSZip.loadAsync(hwpxBlob);
      let sectionXml = await zip.file("Contents/section0.xml")?.async("string");
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 5; c++) {
          const tag = `{{C_${r + 1}_${c + 1}}}`;
          const item = cleaningData[r][c];
          sectionXml = sectionXml.replaceAll(tag, item ? `${item.num}번 ${item.name}` : "");
        }
      }
      zip.file("Contents/section0.xml", sectionXml);
      const outBlob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(outBlob);
      a.download = `${grade}학년_${classNum}반_청소구역.hwpx`;
      a.click();
    } catch (err) {
      console.error("HWPX export:", err);
      toast("HWPX 파일을 만들지 못했습니다. 양식 파일을 확인해 주세요.", "error");
    }
  };

  const studentPool = contacts.length > 0 ? contacts : Array.from({ length: 36 }, (_, i) => ({ num: i + 1, name: `${i + 1}번 학생` }));

  return (
    <div className="space-y-4 md:space-y-6 text-ink-strong">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 md:gap-4 border-b border-line pb-3 md:pb-4">
        <div>
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-widest hidden md:block mb-0.5">
            // CLEANING ROTATION PROTOCOL
          </span>
          <h3 className="text-[18px] md:text-[22px] font-normal tracking-tight text-white">{grade}학년 {classNum}반 청소 구역</h3>
        </div>

        {currentUser && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleRotateUp} className="flex items-center gap-1.5 px-3 md:px-3.5 py-2 whitespace-nowrap rounded-full text-[12px] font-medium bg-well border border-line hover:bg-raised text-ink transition-colors">
              <ArrowUp className="w-3.5 h-3.5" /><span>위로 회전</span>
            </button>
            <button onClick={handleRotateDown} className="flex items-center gap-1.5 px-3 md:px-3.5 py-2 whitespace-nowrap rounded-full text-[12px] font-medium bg-well border border-line hover:bg-raised text-ink transition-colors">
              <ArrowDown className="w-3.5 h-3.5" /><span>아래로 회전</span>
            </button>
            <label className="flex items-center gap-1.5 px-3 md:px-3.5 py-2 whitespace-nowrap rounded-full text-[12px] font-medium bg-well border border-line hover:bg-raised text-ink transition-colors cursor-pointer">
              <FileUp className="w-3.5 h-3.5" />
              <span><span className="md:hidden">{hwpxBlob ? "HWPX 등록됨" : "HWPX 올리기"}</span><span className="hidden md:inline">{hwpxBlob ? "HWPX 양식 등록됨" : "HWPX 양식 올리기"}</span></span>
              <input type="file" accept=".hwpx" className="hidden" onChange={(e) => e.target.files?.[0] && setHwpxBlob(e.target.files[0])} />
            </label>
            {hwpxBlob && (
              <button onClick={handleDownloadHwpx} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold bg-white text-black hover:bg-neutral-200 transition-colors">
                <Download className="w-3.5 h-3.5" /><span>HWPX 다운로드</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-line rounded-panel bg-surface shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-well border-b border-line">
              <th className="p-1.5 md:p-3 text-[12px] font-mono text-ink-muted w-[72px] md:w-36 border-r border-line text-center">구역</th>
              {Array.from({ length: 5 }, (_, i) => (<th key={i} className="p-1.5 md:p-3 text-[11px] md:text-[12px] font-mono text-ink whitespace-nowrap border-r last:border-r-0 border-line text-center">0{i + 1}조</th>))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, r) => (
              <tr key={r} className="border-b border-line last:border-b-0 hover:bg-raised transition-colors">
                <td className="p-1.5 md:p-3 text-[11px] md:text-[13px] leading-tight font-bold text-white bg-well-2 border-r border-line text-center">{CLEANING_AREAS[r]}</td>
                {Array.from({ length: 5 }, (_, c) => {
                  const student = cleaningData[r]?.[c];
                  return (
                    <td key={c} className="p-1 md:p-2 border-r last:border-r-0 border-line text-center align-middle">
                      {student ? (
                        <div onClick={() => currentUser && setActiveSlot({ row: r, col: c })} className="relative flex flex-col md:flex-row items-center md:justify-between gap-0.5 md:gap-0 px-1 md:px-3 py-1 md:py-1.5 rounded-field bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium text-[12px] cursor-pointer hover:bg-emerald-500/20 transition-colors group">
                          <span className="font-mono text-[9px] md:text-[10px] text-black bg-emerald-400 px-1 md:px-1.5 py-0.5 rounded md:mr-1 font-bold">{student.num}번</span>
                          <span className="truncate max-w-full text-[11px] md:text-[12px]">{student.name}</span>
                          {currentUser && (<button onClick={(e) => { e.stopPropagation(); const next = cleaningData.map((row) => [...row]); next[r][c] = null; saveCleaningGrid(next); }} className="absolute top-0 right-0.5 md:static text-ink-muted hover:text-white md:ml-1"><X className="w-2.5 h-2.5 md:w-3 md:h-3" /></button>)}
                        </div>
                      ) : (
                        currentUser && (<button onClick={() => setActiveSlot({ row: r, col: c })} className="w-full py-2 rounded-field border border-dashed border-line hover:border-emerald-400 text-ink-faint hover:text-emerald-400 text-[11px] font-mono whitespace-nowrap transition-colors"><span className="md:hidden">+</span><span className="hidden md:inline">+ 배정</span></button>)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeSlot && (
        <div className="ui-fade ui-scrim fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-lg w-full shadow-2xl border border-line ui-pop space-y-4">
            <div className="flex justify-between items-center border-b border-line pb-3">
              <h4 className="text-[18px] font-medium text-white">{CLEANING_AREAS[activeSlot.row]} (0{activeSlot.col + 1}조) 학생 배정</h4>
              <button onClick={() => setActiveSlot(null)} className="text-ink-muted hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <button onClick={() => handleAssignStudent(null)} className="w-full py-2.5 rounded-field border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold text-[12px] transition-colors">이 자리 배정 해제 (비우기)</button>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {studentPool.map((s) => (
                <button key={s.num} onClick={() => handleAssignStudent(s)} className="p-2 rounded-field border border-line hover:border-emerald-400 hover:bg-emerald-500/10 text-center transition-colors">
                  <span className="block text-[10px] font-mono text-ink-muted">{s.num}번</span>
                  <span className="text-[12px] font-medium text-ink truncate block">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}