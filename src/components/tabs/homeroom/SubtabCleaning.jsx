import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { loadSynced, saveLocal } from "@/lib/syncedStorage";
import { doc, setDoc } from "firebase/firestore";
import { ArrowUp, ArrowDown, Download, X, FileUp } from "lucide-react";
import JSZip from "jszip";

const CLEANING_AREAS = [
  "교실 쓸기 - 창", "교실 쓸기 - 중앙", "교실 쓸기 - 복도",
  "컴퓨터실 - 창문쪽", "컴퓨터실 - 복도쪽", "교탁 및 칠판"
];

export default function SubtabCleaning({ userId, grade, classNum, contacts, currentUser }) {
  const [cleaningData, setCleaningData] = useState(() => Array(6).fill().map(() => Array(5).fill(null)));
  const [activeSlot, setActiveSlot] = useState(null);
  const [hwpxBlob, setHwpxBlob] = useState(null);

  const loadSeqRef = useRef(0);
  const loadCleaningGrid = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const key = `${userId}_${grade}_${classNum}`;
    // Firestore 를 기준으로 불러오고, 서버에 못 올라간 더 최근 로컬 사본이 있으면 그걸 쓴다
    const loaded = await loadSynced(`cleaning_grid_${key}`, doc(db, "homeroom_cleaning", key), (d) => d.grid);
    if (seq !== loadSeqRef.current) return; // 그 사이 학급이 바뀌었으면 늦게 온 응답은 버린다
    setCleaningData(loaded || Array(6).fill().map(() => Array(5).fill(null)));
  }, [userId, grade, classNum]);

  useEffect(() => { loadCleaningGrid(); }, [loadCleaningGrid]);

  const saveCleaningGrid = async (grid) => {
    setCleaningData(grid);
    const key = `${userId}_${grade}_${classNum}`;
    const updatedAt = saveLocal(`cleaning_grid_${key}`, grid);
    try { await setDoc(doc(db, "homeroom_cleaning", key), { userId, grade, classNum, grid, updatedAt }); } catch (e) { console.error("Cleaning save error:", e); }
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
    if (!hwpxBlob) return alert("등록된 HWPX 양식 파일이 없습니다.");
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
    } catch { alert("HWPX 생성 오류."); }
  };

  const studentPool = contacts.length > 0 ? contacts : Array.from({ length: 36 }, (_, i) => ({ num: i + 1, name: `${i + 1}번 학생` }));

  return (
    <div className="space-y-6 text-[#F5F5F5]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#666666] pb-4">
        <div>
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-widest block mb-0.5">
            // CLEANING ROTATION PROTOCOL
          </span>
          <h3 className="text-[22px] font-normal tracking-tight text-white">{grade}학년 {classNum}반 청소 구역</h3>
        </div>

        {currentUser && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleRotateUp} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-medium bg-[#333333] border border-[#666666] hover:bg-[#555555] text-[#E0E0E0] transition-colors">
              <ArrowUp className="w-3.5 h-3.5" /><span>위로 회전</span>
            </button>
            <button onClick={handleRotateDown} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-medium bg-[#333333] border border-[#666666] hover:bg-[#555555] text-[#E0E0E0] transition-colors">
              <ArrowDown className="w-3.5 h-3.5" /><span>아래로 회전</span>
            </button>
            <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-medium bg-[#333333] border border-[#666666] hover:bg-[#555555] text-[#E0E0E0] transition-colors cursor-pointer">
              <FileUp className="w-3.5 h-3.5" />
              <span>{hwpxBlob ? "HWPX 양식 등록됨" : "HWPX 양식 올리기"}</span>
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

      <div className="overflow-x-auto border border-[#666666] rounded-2xl bg-[#444444] shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#333333] border-b border-[#666666]">
              <th className="p-3 text-[12px] font-mono text-[#A0A0A0] w-36 border-r border-[#666666] text-center">구역</th>
              {Array.from({ length: 5 }, (_, i) => (<th key={i} className="p-3 text-[12px] font-mono text-[#E0E0E0] border-r last:border-r-0 border-[#666666] text-center">0{i + 1}조</th>))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, r) => (
              <tr key={r} className="border-b border-[#666666] last:border-b-0 hover:bg-[#555555] transition-colors">
                <td className="p-3 text-[13px] font-bold text-white bg-[#3A3A3A] border-r border-[#666666] text-center">{CLEANING_AREAS[r]}</td>
                {Array.from({ length: 5 }, (_, c) => {
                  const student = cleaningData[r]?.[c];
                  return (
                    <td key={c} className="p-2 border-r last:border-r-0 border-[#666666] text-center align-middle">
                      {student ? (
                        <div onClick={() => currentUser && setActiveSlot({ row: r, col: c })} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium text-[12px] cursor-pointer hover:bg-emerald-500/20 transition-colors group">
                          <span className="font-mono text-[10px] text-black bg-emerald-400 px-1.5 py-0.5 rounded mr-1 font-bold">{student.num}번</span>
                          <span className="truncate">{student.name}</span>
                          {currentUser && (<button onClick={(e) => { e.stopPropagation(); const next = cleaningData.map((row) => [...row]); next[r][c] = null; saveCleaningGrid(next); }} className="text-[#A0A0A0] hover:text-white ml-1"><X className="w-3 h-3" /></button>)}
                        </div>
                      ) : (
                        currentUser && (<button onClick={() => setActiveSlot({ row: r, col: c })} className="w-full py-2 rounded-xl border border-dashed border-[#666666] hover:border-emerald-400 text-[#888888] hover:text-emerald-400 text-[11px] font-mono transition-colors">+ 배정</button>)
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#444444] rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-[#666666] animate-in fade-in zoom-in-95 duration-200 space-y-4">
            <div className="flex justify-between items-center border-b border-[#666666] pb-3">
              <h4 className="text-[18px] font-medium text-white">{CLEANING_AREAS[activeSlot.row]} (0{activeSlot.col + 1}조) 학생 배정</h4>
              <button onClick={() => setActiveSlot(null)} className="text-[#A0A0A0] hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <button onClick={() => handleAssignStudent(null)} className="w-full py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold text-[12px] transition-colors">이 자리 배정 해제 (비우기)</button>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {studentPool.map((s) => (
                <button key={s.num} onClick={() => handleAssignStudent(s)} className="p-2 rounded-xl border border-[#666666] hover:border-emerald-400 hover:bg-emerald-500/10 text-center transition-colors">
                  <span className="block text-[10px] font-mono text-[#A0A0A0]">{s.num}번</span>
                  <span className="text-[12px] font-medium text-[#E0E0E0] truncate block">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}