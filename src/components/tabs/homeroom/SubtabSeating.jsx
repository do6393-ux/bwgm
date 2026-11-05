import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { loadSynced, saveLocal } from "@/lib/syncedStorage";
import { doc, setDoc } from "firebase/firestore";
import { Shuffle, Lock, Unlock, Eye, Download, FileUp, UserX, X, RotateCcw } from "lucide-react";
import JSZip from "jszip";

// 🎯 폭죽 애니메이션 스크립트 로더
const triggerConfetti = () => {
  if (window.confetti) {
    window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  } else {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
    script.onload = () => window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    document.head.appendChild(script);
  }
};

export default function SubtabSeating({ userId, grade, classNum, contacts, excludedStudentNums, setExcludedStudentNums, currentUser }) {
  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(5);
  // 🎯 교사 시점(Teacher View)을 기본값으로 설정
  const [isTeacherView, setIsTeacherView] = useState(true);

  const [seatGrid, setSeatGrid] = useState(() => Array(6).fill().map(() => Array(5).fill({ student: null, isLocked: false, isDisabled: false })));
  const [avoidPairs, setAvoidPairs] = useState([]);
  const [avoidPairText, setAvoidPairText] = useState("");

  const [selectedSeat, setSelectedSeat] = useState(null);
  const [isAvoidModalOpen, setIsAvoidModalOpen] = useState(false);
  const [isExcludeModalOpen, setIsExcludeModalOpen] = useState(false);
  const [excludeDraft, setExcludeDraft] = useState(() => new Set()); // 제외 학생 창에서 고르는 중인 번호
  const [hwpxBlob, setHwpxBlob] = useState(null);
  // 셔플 애니메이션이 도는 약 1.5초 동안은 다른 편집을 막는다.
  // (그 사이 저장한 제외 학생·잠금 등이 마지막 셔플 저장에 낡은 값으로 덮어써지는 것을 방지)
  const [isShuffling, setIsShuffling] = useState(false);

  const loadSeqRef = useRef(0);
  const loadSeatingData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const key = `${userId}_${grade}_${classNum}`;
    // Firestore 를 기준으로 불러오고, 서버에 못 올라간 더 최근 로컬 사본이 있으면 그걸 쓴다
    const loaded = await loadSynced(`seating_data_${key}`, doc(db, "homeroom_seating", key), (d) => d);
    if (seq !== loadSeqRef.current) return; // 그 사이 학급이 바뀌었으면 늦게 온 응답은 버린다

    // 저장된 데이터가 없는 학급이면 이전 학급의 자리배치가 남지 않도록 기본값으로 되돌린다
    // (남아 있으면 다음 저장 때 이전 학급 배치가 이 학급 문서에 덮어써진다)
    const targetRows = loaded?.rows || 6; const targetCols = loaded?.cols || 5;
    setRows(targetRows);
    setCols(targetCols);
    setSeatGrid(loaded?.grid || Array(targetRows).fill().map(() => Array(targetCols).fill({ student: null, isLocked: false, isDisabled: false })));
    setAvoidPairs(loaded?.avoidPairs || []);
    setExcludedStudentNums(new Set(loaded?.excluded || []));
  }, [userId, grade, classNum, setExcludedStudentNums]);

  useEffect(() => { loadSeatingData(); }, [loadSeatingData]);

  const saveSeatingData = async (newGrid, newAvoid = avoidPairs, newRows = rows, newCols = cols, newExcluded = excludedStudentNums) => {
    const key = `${userId}_${grade}_${classNum}`;
    const payload = { userId, grade, classNum, rows: newRows, cols: newCols, grid: newGrid, avoidPairs: newAvoid, excluded: Array.from(newExcluded), updatedAt: new Date().toISOString() };
    setSeatGrid(newGrid); setAvoidPairs(newAvoid);
    saveLocal(`seating_data_${key}`, payload, payload.updatedAt);
    try { await setDoc(doc(db, "homeroom_seating", key), payload); } catch (e) { console.error("Seating save error:", e); }
  };

  const changeRows = (delta) => {
    const target = rows + delta;
    if (isShuffling || target < 4 || target > 8) return;
    setRows(target);
    const newGrid = Array(target).fill().map((_, r) => Array(cols).fill(null).map((_, c) => seatGrid[r]?.[c] || { student: null, isLocked: false, isDisabled: false }));
    saveSeatingData(newGrid, avoidPairs, target, cols);
  };

  const changeCols = (delta) => {
    const target = cols + delta;
    if (isShuffling || target < 3 || target > 8) return;
    setCols(target);
    const newGrid = Array(rows).fill().map((_, r) => Array(target).fill(null).map((_, c) => seatGrid[r]?.[c] || { student: null, isLocked: false, isDisabled: false }));
    saveSeatingData(newGrid, avoidPairs, rows, target);
  };

  // 배치 제외 학생 (결석·전학 등으로 이번 자리 배치에서 뺄 학생)
  const openExcludeModal = () => {
    setExcludeDraft(new Set(excludedStudentNums));
    setIsExcludeModalOpen(true);
  };

  const toggleExcludeDraft = (num) => {
    setExcludeDraft((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const handleSaveExcluded = () => {
    // 새로 제외된 학생은 현재 앉아 있는 자리에서도 비운다
    const newGrid = seatGrid.map((row) =>
      row.map((cell) => (cell.student && excludeDraft.has(cell.student.num) ? { ...cell, student: null, isLocked: false } : cell))
    );
    setExcludedStudentNums(new Set(excludeDraft));
    saveSeatingData(newGrid, avoidPairs, rows, cols, excludeDraft);
    setIsExcludeModalOpen(false);
  };

  const handleReset = () => {
    if (!confirm("현재 배치된 자리를 모두 비우시겠습니까?\n(제외된 자리는 유지됩니다.)")) return;
    const newGrid = seatGrid.map(row => row.map(cell => ({ ...cell, student: null, isLocked: false })));
    setSeatGrid(newGrid);
    saveSeatingData(newGrid);
  };

  const fullStudentList = contacts.length > 0 ? contacts : Array.from({ length: 30 }, (_, i) => ({ num: i + 1, name: `${i + 1}번 학생` }));
  const activeStudents = fullStudentList.filter((s) => !excludedStudentNums.has(s.num));

  const checkHasAvoidConflict = (grid) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const s1 = grid[r][c]?.student?.num; const s2 = grid[r][c + 1]?.student?.num;
        if (!s1 || !s2) continue;
        if (avoidPairs.some(p => (p[0] === s1 && p[1] === s2) || (p[0] === s2 && p[1] === s1))) return true;
      }
    }
    return false;
  };

  const handleShuffle = async () => {
    const lockedMap = {}; 
    const unseated = [];
    let disabledCount = 0;

    seatGrid.forEach((row, r) => row.forEach((cell, c) => { 
      if (cell.isDisabled) disabledCount++;
      else if (cell.isLocked && cell.student && !excludedStudentNums.has(cell.student.num)) lockedMap[`${r}_${c}`] = cell.student; 
    }));
    
    const lockedNums = new Set(Object.values(lockedMap).map(s => s.num));
    activeStudents.forEach(s => { if (!lockedNums.has(s.num)) unseated.push(s); });

    const availableSlots = (rows * cols) - disabledCount - Object.keys(lockedMap).length;
    if (unseated.length > availableSlots) {
      return alert(`배치할 학생(${unseated.length}명)이 남은 자리(${availableSlots}석)보다 많습니다.\n행/열을 추가하거나 제외 자리를 해제하세요.`);
    }

    setIsShuffling(true);
    let bestGrid = null; let attempts = 0;
    while (attempts < 300) {
      attempts++;
      const shuffled = [...unseated].sort(() => Math.random() - 0.5);
      const tempGrid = Array(rows).fill().map(() => Array(cols).fill(null));
      let idx = 0;
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (seatGrid[r][c].isDisabled) tempGrid[r][c] = { student: null, isLocked: false, isDisabled: true };
          else if (lockedMap[`${r}_${c}`]) tempGrid[r][c] = { student: lockedMap[`${r}_${c}`], isLocked: true, isDisabled: false };
          else if (idx < shuffled.length) tempGrid[r][c] = { student: shuffled[idx++], isLocked: false, isDisabled: false };
          else tempGrid[r][c] = { student: null, isLocked: false, isDisabled: false };
        }
      }
      if (!checkHasAvoidConflict(tempGrid)) { bestGrid = tempGrid; break; }
      bestGrid = tempGrid;
    }

    const emptyGrid = bestGrid.map(row => row.map(cell => (cell.isLocked || cell.isDisabled) ? cell : { student: null, isLocked: false, isDisabled: false }));
    setSeatGrid(emptyGrid);
    
    // 순차 렌더링 애니메이션
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!bestGrid[r][c].isLocked && !bestGrid[r][c].isDisabled) {
          emptyGrid[r][c] = bestGrid[r][c];
          setSeatGrid([...emptyGrid]);
          await new Promise(res => setTimeout(res, 50)); 
        }
      }
    }
    saveSeatingData(bestGrid);
    setIsShuffling(false);

    // 🎯 자리 뽑기가 완료되면 폭죽 애니메이션 실행
    triggerConfetti();

    if (attempts >= 300 && avoidPairs.length > 0) alert("⚠️ 인원 제약으로 기피 조합이 완전히 분리되지 못했습니다.");
  };

  const handleSeatClick = (r, c) => {
    if (!currentUser || isShuffling) return;
    const targetCell = seatGrid[r][c];
    if (!selectedSeat && !targetCell.student) {
      const next = seatGrid.map(row => [...row]);
      next[r][c] = { ...targetCell, isDisabled: !targetCell.isDisabled };
      saveSeatingData(next);
      return;
    }
    if (!selectedSeat) { 
      if (targetCell.isDisabled) return; 
      setSelectedSeat({ r, c }); return; 
    }
    if (selectedSeat.r === r && selectedSeat.c === c) { setSelectedSeat(null); return; }
    
    const next = seatGrid.map(row => [...row]);
    const origin = next[selectedSeat.r][selectedSeat.c]; 
    const target = next[r][c];
    if (target.isDisabled) { alert("배치 제외 처리된 자리로는 이동할 수 없습니다."); setSelectedSeat(null); return; }

    next[selectedSeat.r][selectedSeat.c] = { ...origin, student: target.student };
    next[r][c] = { ...target, student: origin.student };
    saveSeatingData(next); setSelectedSeat(null);
  };

  const handleDeskClick = (e) => {
    if (e.detail === 3) {
      setAvoidPairText(avoidPairs.map(p => `${p[0]}, ${p[1]}`).join('\n')); 
      setIsAvoidModalOpen(true);
    }
  };

  const handleDownloadHwpx = async () => {
    if (!hwpxBlob) return alert("등록된 HWPX 양식이 없습니다.");
    try {
      const zip = await JSZip.loadAsync(hwpxBlob);
      let sectionXml = await zip.file("Contents/section0.xml")?.async("string");
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // 🎯 수학적 공식: 교탁 기준 우측 맨 앞자리(rows-1, cols-1)가 {{자리1}}, 좌측으로 2, 3..
          const tagNumber = (rows - 1 - r) * cols + (cols - c);
          const tagPattern = new RegExp(`\\{\\{자리${tagNumber}\\}\\}`, 'g');
          
          const item = seatGrid[r]?.[c];
          let text = ""; // 🎯 기본값은 공백(제외 자리 포함)
          
          if (item?.student) {
            text = `${item.student.num}.${item.student.name}`; // 🎯 띄어쓰기 제거
          }
          
          // XML 상의 태그를 찾아서 치환
          sectionXml = sectionXml.replace(tagPattern, text);
        }
      }

      zip.file("Contents/section0.xml", sectionXml);
      const outBlob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(outBlob);
      a.download = `${grade}학년_${classNum}반_자리배치표.hwpx`;
      a.click();
    } catch (error) { 
      console.error(error);
      alert("HWPX 생성 오류가 발생했습니다."); 
    }
  };

  const renderRowIndices = isTeacherView ? Array.from({ length: rows }, (_, i) => i) : Array.from({ length: rows }, (_, i) => rows - 1 - i);

  return (
    <div className="space-y-6 text-[#F5F5F5]">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-[#707070] pb-4">
        <div>
          <span className="text-[11px] font-mono text-indigo-400 uppercase tracking-widest block mb-0.5">
            // SEATING ALGORITHM MATRIX
          </span>
          <h3 className="text-[22px] font-normal tracking-tight text-white">{grade}학년 {classNum}반 자리배치</h3>
        </div>

        {currentUser && (
          <div className="flex flex-wrap items-center gap-2">
            
            <div className="flex items-center bg-[#4E4E4E] border border-[#707070] rounded-full mr-2 divide-x divide-[#707070]">
              <div className="flex items-center px-1.5">
                <span className="text-[11px] font-medium text-[#A0A0A0] ml-2 mr-1">앞뒤</span>
                <button onClick={() => changeRows(-1)} className="px-2 py-1.5 text-[#A0A0A0] hover:text-white" title="줄(행) 감소">-</button>
                <span className="text-[12px] font-mono font-bold px-1 w-3 text-center">{rows}</span>
                <button onClick={() => changeRows(1)} className="px-2 py-1.5 text-[#A0A0A0] hover:text-white" title="줄(행) 추가">+</button>
              </div>
              <div className="flex items-center px-1.5">
                <span className="text-[11px] font-medium text-[#A0A0A0] ml-2 mr-1">양옆</span>
                <button onClick={() => changeCols(-1)} className="px-2 py-1.5 text-[#A0A0A0] hover:text-white" title="칸(열) 감소">-</button>
                <span className="text-[12px] font-mono font-bold px-1 w-3 text-center">{cols}</span>
                <button onClick={() => changeCols(1)} className="px-2 py-1.5 text-[#A0A0A0] hover:text-white" title="칸(열) 추가">+</button>
              </div>
            </div>

            <button onClick={openExcludeModal} disabled={isShuffling} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-medium bg-[#3D3D3D] border border-[#707070] hover:bg-[#4E4E4E] text-[#E0E0E0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <UserX className="w-3.5 h-3.5" /> <span>제외 학생{excludedStudentNums.size > 0 ? ` (${excludedStudentNums.size})` : ""}</span>
            </button>

            <button onClick={handleReset} disabled={isShuffling} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-medium bg-[#3D3D3D] border border-[#707070] hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/50 text-[#E0E0E0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <RotateCcw className="w-3.5 h-3.5" /> <span>초기화</span>
            </button>

            <button onClick={() => setIsTeacherView(!isTeacherView)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] bg-[#3D3D3D] border border-[#707070] hover:bg-[#4E4E4E] text-[#E0E0E0]">
              <Eye className="w-3.5 h-3.5" /> <span>{isTeacherView ? "교사 시점" : "학생 시점"}</span>
            </button>
            <button onClick={handleShuffle} disabled={isShuffling} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold bg-indigo-500 hover:bg-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
              <Shuffle className="w-3.5 h-3.5" /> <span>자리 셔플</span>
            </button>
            <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-medium bg-[#3D3D3D] border border-[#707070] hover:bg-[#4E4E4E] text-[#E0E0E0] transition-colors cursor-pointer">
              <FileUp className="w-3.5 h-3.5" />
              <span>{hwpxBlob ? "HWPX 등록됨" : "HWPX 올리기"}</span>
              <input type="file" accept=".hwpx" className="hidden" onChange={(e) => e.target.files?.[0] && setHwpxBlob(e.target.files[0])} />
            </label>
            {hwpxBlob && (
              <button onClick={handleDownloadHwpx} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold bg-white text-black hover:bg-neutral-200 transition-colors">
                <Download className="w-3.5 h-3.5" /> <span>출력</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 🎯 학생 시점일 때 교탁이 위에 렌더링됨 */}
      {!isTeacherView && (
        <div className="w-full flex justify-center py-2" onClick={handleDeskClick}>
          <div className="px-10 py-1.5 rounded-full border border-[#707070] bg-[#3D3D3D] text-[#A0A0A0] font-mono text-[12px] uppercase tracking-widest shadow-sm cursor-pointer hover:bg-[#4E4E4E] transition-colors select-none">
            [ 칠판 및 교탁 (TEACHER'S DESK) ]
          </div>
        </div>
      )}

      <div className="border border-[#707070] bg-[#4E4E4E] rounded-3xl p-6 shadow-xl overflow-x-auto custom-scrollbar">
        <div className="grid gap-3.5 mx-auto min-w-[700px] max-w-5xl" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {renderRowIndices.map((r) =>
            Array.from({ length: cols }, (_, c) => {
              const cell = seatGrid[r]?.[c] || { student: null, isLocked: false, isDisabled: false };
              const isSelected = selectedSeat?.r === r && selectedSeat?.c === c;
              
              let cellStyle;
              if (isSelected) cellStyle = "border-indigo-400 bg-indigo-500/20 shadow-[0_0_12px_rgba(99,102,241,0.5)]";
              else if (cell.isDisabled) cellStyle = "bg-[#343434] border-dashed border-[#666666] text-[#777777]";
              else if (cell.student) cellStyle = "bg-[#3D3D3D] border-[#707070] hover:border-[#A0A0A0]";
              else cellStyle = "bg-[#343434] border-dashed border-[#666666] text-[#888888] hover:border-[#A0A0A0]";

              return (
                <div key={`${r}-${c}`} onClick={() => handleSeatClick(r, c)} className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all min-h-[96px] ${cellStyle} ${currentUser ? "cursor-pointer active:scale-95 select-none" : ""}`}>
                  {currentUser && cell.student && (
                    <button disabled={isShuffling} onClick={(e) => { e.stopPropagation(); const next = seatGrid.map(row => [...row]); next[r][c].isLocked = !next[r][c].isLocked; saveSeatingData(next); }} className="absolute top-2 right-2">
                      {cell.isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-[#707070] hover:text-[#C0C0C0]" />}
                    </button>
                  )}
                  {cell.isDisabled ? (
                    <span className="font-mono text-[12px] font-bold text-[#707070]">제외 자리</span>
                  ) : cell.student ? (
                    <><span className="text-[11px] font-mono font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full mb-1">{cell.student.num}번</span><span className="text-[15px] font-medium text-white truncate">{cell.student.name}</span></>
                  ) : (
                    <span className="font-mono text-[12px]">빈 자리</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 🎯 교사 시점일 때 교탁이 아래에 렌더링됨 */}
      {isTeacherView && (
        <div className="w-full flex justify-center py-2" onClick={handleDeskClick}>
          <div className="px-10 py-1.5 rounded-full border border-[#707070] bg-[#3D3D3D] text-[#A0A0A0] font-mono text-[12px] uppercase tracking-widest shadow-sm cursor-pointer hover:bg-[#4E4E4E] transition-colors select-none">
            [ 칠판 및 교탁 (TEACHER'S DESK) ]
          </div>
        </div>
      )}

      {/* 기피 조합 모달 */}
      {isAvoidModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#4E4E4E] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#707070]">
            <div className="flex justify-between items-center border-b border-[#707070] pb-3 mb-4">
              <h4 className="text-[18px] font-medium text-white">기피 조합 일괄 입력</h4>
              <button onClick={() => setIsAvoidModalOpen(false)} className="text-[#A0A0A0] hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <textarea value={avoidPairText} onChange={(e) => setAvoidPairText(e.target.value)} rows={5} className="w-full bg-[#3D3D3D] border border-[#707070] text-white rounded-xl p-3 text-[13px] outline-none font-mono" placeholder="1, 2&#10;3, 4" />
            <button onClick={() => {
              const lines = avoidPairText.split('\n');
              const pairs = [];
              lines.forEach(line => {
                  const parts = line.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                  if (parts.length >= 2) pairs.push([parts[0], parts[1]]);
              });
              saveSeatingData(seatGrid, pairs);
              setIsAvoidModalOpen(false);
            }} className="w-full mt-3 py-2.5 bg-white text-black font-bold rounded-xl text-[13px]">비밀 저장하기</button>
          </div>
        </div>
      )}
      
      {/* 배치 제외 학생 모달 */}
      {isExcludeModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#4E4E4E] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#707070]">
            <div className="flex justify-between items-start border-b border-[#707070] pb-3 mb-4">
              <div>
                <h4 className="text-[18px] font-medium text-white">배치 제외 학생</h4>
                <p className="text-[11px] text-[#A0A0A0] mt-1">결석·전학 등으로 이번 배치에서 뺄 학생을 선택하세요.</p>
              </div>
              <button onClick={() => setIsExcludeModalOpen(false)} className="text-[#A0A0A0] hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
              {fullStudentList.map((s) => {
                const checked = excludeDraft.has(s.num);
                return (
                  <label
                    key={s.num}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[13px] cursor-pointer select-none transition-colors ${checked ? "border-rose-400 bg-rose-500/10 text-rose-300" : "border-[#707070] bg-[#3D3D3D] text-[#E0E0E0] hover:border-[#A0A0A0]"}`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleExcludeDraft(s.num)} className="accent-rose-400" />
                    <span className="font-mono text-[11px] opacity-70">{s.num}번</span>
                    <span className="truncate">{s.name}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-[#707070]">
              <span className="text-[12px] text-[#A0A0A0]">제외 {excludeDraft.size}명 · 배치 {fullStudentList.length - excludeDraft.size}명</span>
              <button onClick={handleSaveExcluded} className="px-5 py-2 bg-white text-black font-bold rounded-xl text-[13px]">저장</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #666; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #888; }
      `}} />
    </div>
  );
}