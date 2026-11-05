import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { loadSynced, saveLocal } from "@/lib/syncedStorage";
import { doc, setDoc } from "firebase/firestore";
import { Download, X, FileUp, FileDown, GripVertical, Pencil, Check, Plus } from "lucide-react";
import JSZip from "jszip";
import { useDialog } from "@/components/ui/dialogContext";
import {
  MAX_AREAS, MAX_AREA_NAME, MAX_GROUPS,
  addArea, addGroup, countAssigned, emptyCleaning, fromCleaningDoc, groupCount, moveAssignments,
  normalizeCleaning, removeArea, removeGroup, renameArea, toCleaningDoc,
} from "@/lib/cleaningModel";

const groupLabel = (i) => `${String(i + 1).padStart(2, "0")}조`;

// HWPX(XML) 안에 넣는 글자는 &, < 등이 들어 있으면 파일이 깨지므로 바꿔 준다 (구역 이름은 자유롭게 적을 수 있다)
const escapeXml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]);

// 폰이 진동을 지원하면(안드로이드) 집을 때·칸이 바뀔 때 살짝 울린다. 아이폰 등은 지원하지 않아 조용히 넘어간다.
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* 지원하지 않으면 무시 */ } };

const toolBtn = "flex items-center gap-1.5 px-3 md:px-3.5 py-2 whitespace-nowrap rounded-full text-[12px] font-medium bg-well border border-line hover:bg-raised text-ink transition-colors";

export default function SubtabCleaning({ userId, grade, classNum, contacts, currentUser }) {
  const { toast, confirm } = useDialog();
  const [cleaning, setCleaning] = useState(() => emptyCleaning());
  const [activeSlot, setActiveSlot] = useState(null);
  const [hwpxBlob, setHwpxBlob] = useState(null);
  const [editMode, setEditMode] = useState(false); // 구역·조를 추가/삭제/이름 바꾸는 모드
  const [areaDialog, setAreaDialog] = useState(null); // { mode: "add" } | { mode: "rename", row }
  const [areaName, setAreaName] = useState("");
  const [drag, setDrag] = useState(null); // 끌고 있는 줄: { from: 집은 줄, over: 지금 놓을 줄, top·height: 집은 순간 줄의 위치·높이 }

  const dragRef = useRef(null); // 이벤트가 연달아 와도 최신 값을 읽기 위한 사본
  const pointerYRef = useRef(0); // 끌고 있는 손가락·마우스의 화면 세로 위치
  const grabOffsetRef = useRef(0); // 줄 위쪽 끝에서 얼마나 아래를 집었는지 (집은 자리 그대로 따라오게)
  const wrapRef = useRef(null); // 떠 있는 줄(ghost)의 위치 기준
  const ghostRef = useRef(null); // 손을 따라다니는 줄
  const scrollRafRef = useRef(0); // 가장자리 자동 스크롤 반복(requestAnimationFrame)
  const rowRefs = useRef([]);
  const handleRefs = useRef([]);

  const editing = editMode && !!currentUser;
  const areas = cleaning.areas;
  const groups = groupCount(cleaning);
  // 끄는 동안에는 놓았을 때의 모습을 미리 보여 준다 (사이의 줄이 한 칸씩 밀리는 것이 바로 보임)
  const shownGrid = drag ? moveAssignments(cleaning, drag.from, drag.over).grid : cleaning.grid;

  const loadSeqRef = useRef(0);
  const loadCleaningGrid = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const key = `${userId}_${grade}_${classNum}`;
    // Firestore 를 기준으로 불러오고, 서버에 못 올라간 더 최근 로컬 사본이 있으면 그걸 쓴다
    const ref = doc(db, "homeroom_cleaning", key);
    const loaded = await loadSynced(`cleaning_grid_${key}`, ref, fromCleaningDoc, {
      // 예전에 서버 저장이 실패해 이 기기에만 남아 있던 배정은, 열어 보는 순간 서버로 올린다
      onLocalNewer: (local, localTs) => setDoc(ref, { userId, grade, classNum, ...toCleaningDoc(normalizeCleaning(local)), updatedAt: localTs || new Date().toISOString() }),
    });
    if (seq !== loadSeqRef.current) return; // 그 사이 학급이 바뀌었으면 늦게 온 응답은 버린다
    setCleaning(normalizeCleaning(loaded)); // 예전에 저장한 표(구역 이름 없음)도 여기서 새 모양으로 바뀐다
  }, [userId, grade, classNum]);

  useEffect(() => { loadCleaningGrid(); }, [loadCleaningGrid]);

  const saveCleaning = async (next) => {
    setCleaning(next);
    const key = `${userId}_${grade}_${classNum}`;
    const updatedAt = saveLocal(`cleaning_grid_${key}`, next);
    // 서버(Firestore)는 2차원 배열을 못 받으므로 toCleaningDoc 이 표를 풀어서 올린다. 실패하면 조용히 넘기지 않고 알린다.
    try {
      await setDoc(doc(db, "homeroom_cleaning", key), { userId, grade, classNum, ...toCleaningDoc(next), updatedAt });
    } catch (e) {
      console.error("Cleaning save error:", e);
      toast("서버에 저장하지 못했습니다. 이 기기에는 저장됐어요. 연결을 확인한 뒤 다시 시도해 주세요.", "error");
    }
  };

  // ───────── 배정 ─────────
  const handleAssignStudent = (student) => {
    if (!activeSlot) return;
    const grid = cleaning.grid.map((row) => [...row]);
    grid[activeSlot.row][activeSlot.col] = student ? { num: student.num, name: student.name } : null;
    saveCleaning({ ...cleaning, grid });
    setActiveSlot(null);
  };

  // ───────── 줄(구역의 배정) 끌어서 옮기기 ─────────
  // 마우스·터치·펜 모두 포인터 이벤트로 처리한다 (아이폰은 HTML5 드래그를 지원하지 않는다).
  const rowAt = (clientY) => {
    for (let i = 0; i < areas.length; i++) {
      const el = rowRefs.current[i];
      if (el && clientY < el.getBoundingClientRect().bottom) return i;
    }
    return areas.length - 1;
  };

  const beginDrag = (e, r) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* 캡처가 안 돼도 끌기는 동작 */ } // 손잡이 밖으로 나가도 계속 따라온다
    const rowRect = rowRefs.current[r]?.getBoundingClientRect();
    const wrapTop = wrapRef.current?.getBoundingClientRect().top ?? 0;
    const d = { from: r, over: r, top: (rowRect?.top ?? e.clientY) - wrapTop, height: rowRect?.height ?? 48 };
    pointerYRef.current = e.clientY;
    grabOffsetRef.current = e.clientY - (rowRect?.top ?? e.clientY);
    dragRef.current = d;
    setDrag(d);
    buzz(12);
  };

  // 집은 줄이 손가락·마우스를 따라다니게 한다 (React 를 거치지 않고 위치만 바꿔 가볍게)
  const positionGhost = () => {
    const ghost = ghostRef.current;
    const wrap = wrapRef.current;
    if (!ghost || !wrap) return;
    ghost.style.top = `${pointerYRef.current - grabOffsetRef.current - wrap.getBoundingClientRect().top}px`;
  };

  const updateOver = () => {
    const d = dragRef.current;
    if (!d) return;
    const over = rowAt(pointerYRef.current);
    if (over !== d.over) {
      const next = { ...d, over };
      dragRef.current = next;
      setDrag(next);
      buzz(6);
    }
  };

  // 표가 화면보다 길 때: 화면 위·아래 가장자리 근처로 가져가면 페이지가 저절로 스크롤된다
  const autoScroll = () => {
    scrollRafRef.current = 0;
    if (!dragRef.current) return;
    const edge = 64;
    const y = pointerYRef.current;
    const vh = window.innerHeight;
    const dy = y < edge ? -Math.ceil((edge - y) / 4) : y > vh - edge ? Math.ceil((y - (vh - edge)) / 4) : 0;
    if (!dy) return;
    window.scrollBy(0, dy);
    positionGhost();
    updateOver();
    scrollRafRef.current = requestAnimationFrame(autoScroll);
  };

  const moveDrag = (e) => {
    if (!dragRef.current) return;
    pointerYRef.current = e.clientY;
    positionGhost();
    updateOver();
    if (!scrollRafRef.current) scrollRafRef.current = requestAnimationFrame(autoScroll);
  };

  const endDrag = (e, commit) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = 0;
    setDrag(null);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* 이미 풀렸으면 무시 */ }
    if (commit && d.from !== d.over) {
      saveCleaning(moveAssignments(cleaning, d.from, d.over));
      buzz(8);
    }
  };

  // 키보드: 손잡이에서 ↑ ↓ 로 한 줄씩 옮긴다
  const handleKeyMove = (e, r) => {
    const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    const to = r + step;
    if (to < 0 || to >= areas.length) return;
    saveCleaning(moveAssignments(cleaning, r, to));
    requestAnimationFrame(() => handleRefs.current[to]?.focus());
  };

  // ───────── 구역·조 편집 ─────────
  const openAddArea = () => {
    if (areas.length >= MAX_AREAS) return toast(`구역은 최대 ${MAX_AREAS}개까지 만들 수 있습니다.`, "info");
    setAreaName("");
    setAreaDialog({ mode: "add" });
  };

  const openRenameArea = (row) => {
    setAreaName(areas[row]);
    setAreaDialog({ mode: "rename", row });
  };

  const submitArea = (e) => {
    e.preventDefault();
    const name = areaName.trim();
    if (!name || !areaDialog) return;
    saveCleaning(areaDialog.mode === "add" ? addArea(cleaning, name) : renameArea(cleaning, areaDialog.row, name));
    setAreaDialog(null);
  };

  const deleteArea = async () => {
    if (!areaDialog || areaDialog.mode !== "rename") return;
    const row = areaDialog.row;
    if (areas.length <= 1) return toast("구역은 하나 이상 있어야 합니다.", "info");
    const n = countAssigned(cleaning, { row });
    const ok = await confirm(
      n > 0 ? `'${areas[row]}' 구역을 삭제할까요? 배정된 학생 ${n}명도 함께 비워집니다.` : `'${areas[row]}' 구역을 삭제할까요?`,
      { danger: true, confirmText: "삭제" },
    );
    if (!ok) return;
    setAreaDialog(null);
    saveCleaning(removeArea(cleaning, row));
  };

  const handleAddGroup = () => {
    if (groups >= MAX_GROUPS) return toast(`조는 최대 ${MAX_GROUPS}개까지 만들 수 있습니다.`, "info");
    saveCleaning(addGroup(cleaning));
  };

  const handleRemoveGroup = async (col) => {
    if (groups <= 1) return toast("조는 하나 이상 있어야 합니다.", "info");
    const n = countAssigned(cleaning, { col });
    if (n > 0) {
      const ok = await confirm(`${groupLabel(col)}을 삭제할까요? 배정된 학생 ${n}명이 비워지고, 뒤의 조는 번호가 하나씩 당겨집니다.`, { danger: true, confirmText: "삭제" });
      if (!ok) return;
    }
    saveCleaning(removeGroup(cleaning, col));
  };

  // ───────── HWPX ─────────
  const handleDownloadHwpx = async () => {
    if (!hwpxBlob) return toast("등록된 HWPX 양식 파일이 없습니다. 먼저 양식을 올려 주세요.", "info");
    try {
      const zip = await JSZip.loadAsync(hwpxBlob);
      let sectionXml = await zip.file("Contents/section0.xml")?.async("string");
      cleaning.grid.forEach((row, r) => {
        // {{A_1}} = 첫 구역 이름, {{C_1_1}} = 첫 구역·01조 학생
        sectionXml = sectionXml.replaceAll(`{{A_${r + 1}}}`, escapeXml(areas[r]));
        row.forEach((item, c) => {
          sectionXml = sectionXml.replaceAll(`{{C_${r + 1}_${c + 1}}}`, item ? escapeXml(`${item.num}.${item.name}`) : "");
        });
      });
      // 양식에는 있는데 지금 표에는 없는 칸(지운 구역·조)은 비워 둔다
      sectionXml = sectionXml.replace(/\{\{[AC]_\d+(?:_\d+)?\}\}/g, "");
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
    <div ref={wrapRef} className="relative space-y-4 md:space-y-6 text-ink-strong">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 md:gap-4 border-b border-line pb-3 md:pb-4">
        <div>
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-widest hidden md:block mb-0.5">
            // CLEANING ROTATION PROTOCOL
          </span>
          <h3 className="text-[18px] md:text-[22px] font-normal tracking-tight text-white">{grade}학년 {classNum}반 청소 구역</h3>
        </div>

        {currentUser && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editing}
              className={`${toolBtn} ${editing ? "!bg-emerald-500/15 !border-emerald-400/60 !text-emerald-300" : ""}`}
            >
              {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              <span>{editing ? "편집 끝내기" : "구역·조 편집"}</span>
            </button>
            {editing && (
              <>
                <button onClick={openAddArea} className={toolBtn}><Plus className="w-3.5 h-3.5" /><span>구역</span></button>
                <button onClick={handleAddGroup} className={toolBtn}><Plus className="w-3.5 h-3.5" /><span>조</span></button>
              </>
            )}
            <label className={`${toolBtn} cursor-pointer`}>
              <FileUp className="w-3.5 h-3.5" />
              <span><span className="md:hidden">{hwpxBlob ? "HWPX 등록됨" : "HWPX 올리기"}</span><span className="hidden md:inline">{hwpxBlob ? "HWPX 양식 등록됨" : "HWPX 양식 올리기"}</span></span>
              <input type="file" accept=".hwpx" className="hidden" onChange={(e) => e.target.files?.[0] && setHwpxBlob(e.target.files[0])} />
            </label>
            {/* 기본 양식(public/templates). 받아서 한글에서 고친 뒤 위의 "HWPX 올리기"로 올린다 */}
            <a href={`${import.meta.env.BASE_URL}templates/cleaning-template.hwpx`} download="청소구역_양식.hwpx" className={toolBtn}>
              <FileDown className="w-3.5 h-3.5" /><span>양식 받기</span>
            </a>
            {hwpxBlob && (
              <button onClick={handleDownloadHwpx} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold bg-white text-black hover:bg-neutral-200 transition-colors">
                <Download className="w-3.5 h-3.5" /><span>HWPX 다운로드</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className={`overflow-x-auto border border-line rounded-panel bg-surface shadow-sm ${drag ? "select-none cursor-grabbing" : ""}`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-well border-b border-line">
              <th className="p-1.5 md:p-3 text-[12px] font-mono text-ink-muted w-[72px] md:w-44 border-r border-line text-center">구역</th>
              {Array.from({ length: groups }, (_, c) => (
                <th key={c} className="p-1.5 md:p-3 text-[11px] md:text-[12px] font-mono text-ink whitespace-nowrap border-r last:border-r-0 border-line text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>{groupLabel(c)}</span>
                    {editing && (
                      <button onClick={() => handleRemoveGroup(c)} aria-label={`${groupLabel(c)} 삭제`} title={`${groupLabel(c)} 삭제`} className="p-1 -mr-1 rounded text-ink-faint hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((area, r) => {
              // 손에 든 줄이 놓일 자리: 옅게 칠하고 안의 학생은 흐리게 해서, 손을 따라다니는 줄(ghost)과 구별되게 한다
              const isSlot = !!drag && drag.over === r;
              return (
                <tr
                  key={r}
                  ref={(el) => { rowRefs.current[r] = el; }}
                  className={`border-b border-line last:border-b-0 transition-colors ${isSlot ? "bg-emerald-500/15" : drag ? "" : "hover:bg-raised"}`}
                >
                  <td className="p-1.5 md:p-3 text-[11px] md:text-[13px] leading-tight font-bold text-white bg-well-2 border-r border-line [word-break:keep-all]">
                    {editing ? (
                      <button onClick={() => openRenameArea(r)} aria-label={`${area} 이름 바꾸기 또는 삭제`} className="w-full flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1.5 text-center hover:text-emerald-300 transition-colors">
                        <Pencil className="w-3 h-3 shrink-0 text-ink-faint md:order-last" />
                        <span>{area}</span>
                      </button>
                    ) : (
                      <div className="flex flex-col md:flex-row items-center md:gap-1.5 text-center md:text-left">
                        {currentUser && (
                          <button
                            ref={(el) => { handleRefs.current[r] = el; }}
                            onPointerDown={(e) => beginDrag(e, r)}
                            onPointerMove={moveDrag}
                            onPointerUp={(e) => endDrag(e, true)}
                            onPointerCancel={(e) => endDrag(e, false)}
                            onLostPointerCapture={(e) => endDrag(e, false)}
                            onKeyDown={(e) => handleKeyMove(e, r)}
                            aria-label={`${area} 배정 옮기기. 끌어서 다른 구역에 놓거나 위·아래 화살표 키를 누르세요`}
                            title="끌어서 옮기기 (↑ ↓ 키도 가능)"
                            className={`touch-none select-none shrink-0 p-1 rounded cursor-grab active:cursor-grabbing transition ${drag?.from === r ? "text-emerald-200 bg-emerald-500/30 ring-2 ring-emerald-400/70 scale-110" : "text-ink-faint hover:text-emerald-300 hover:bg-raised"}`}
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>
                        )}
                        <span>{area}</span>
                      </div>
                    )}
                  </td>
                  {Array.from({ length: groups }, (_, c) => {
                    const student = shownGrid[r]?.[c];
                    return (
                      <td key={c} className={`p-1 md:p-2 border-r last:border-r-0 border-line text-center align-middle ${isSlot ? "[&>*]:opacity-40" : ""}`}>
                        {student ? (
                          <div onClick={() => currentUser && !drag && setActiveSlot({ row: r, col: c })} className="relative flex flex-col md:flex-row items-center md:justify-between gap-0.5 md:gap-0 px-1 md:px-3 py-1 md:py-1.5 rounded-field bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium text-[12px] cursor-pointer hover:bg-emerald-500/20 transition-colors group">
                            <span className="font-mono text-[9px] md:text-[10px] text-black bg-emerald-400 px-1 md:px-1.5 py-0.5 rounded md:mr-1 font-bold">{student.num}번</span>
                            <span className="truncate max-w-full text-[11px] md:text-[12px]">{student.name}</span>
                            {currentUser && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const grid = cleaning.grid.map((row) => [...row]);
                                  grid[r][c] = null;
                                  saveCleaning({ ...cleaning, grid });
                                }}
                                aria-label={`${student.num}번 ${student.name} 배정 해제`}
                                className="absolute top-0 right-0.5 md:static text-ink-muted hover:text-white md:ml-1"
                              >
                                <X className="w-2.5 h-2.5 md:w-3 md:h-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          currentUser && (<button onClick={() => setActiveSlot({ row: r, col: c })} className="w-full py-2 rounded-field border border-dashed border-line hover:border-emerald-400 text-ink-faint hover:text-emerald-400 text-[11px] font-mono whitespace-nowrap transition-colors"><span className="md:hidden">+</span><span className="hidden md:inline">+ 배정</span></button>)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drag && (
        // 집어 든 줄: 손을 따라다니며 떠 있다. 놓으면 옅게 칠해진 자리(위 표)로 들어간다.
        <div
          ref={ghostRef}
          aria-hidden="true"
          style={{ top: drag.top, height: drag.height }}
          className="ui-lift pointer-events-none absolute inset-x-0 !mt-0 z-30 flex items-stretch overflow-hidden rounded-field border-2 border-emerald-400 bg-surface shadow-2xl shadow-black/60"
        >
          <div className="flex w-[72px] md:w-44 shrink-0 flex-col md:flex-row items-center justify-center md:justify-start gap-0.5 md:gap-1.5 bg-emerald-500/25 px-1 md:px-3 text-center md:text-left text-[11px] md:text-[13px] font-bold leading-tight text-white [word-break:keep-all]">
            <GripVertical className="w-4 h-4 shrink-0 text-emerald-300" />
            <span className="line-clamp-2">{areas[drag.from]}</span>
          </div>
          <div className="grid flex-1 items-center gap-1 px-1 md:px-2" style={{ gridTemplateColumns: `repeat(${groups}, minmax(0, 1fr))` }}>
            {cleaning.grid[drag.from].map((student, c) => (student ? (
              <div key={c} className="truncate rounded-field border border-emerald-500/40 bg-emerald-500/20 px-1 py-1 text-center text-[11px] md:text-[12px] font-medium text-emerald-200">
                <span className="hidden md:inline font-mono text-[10px] mr-1">{student.num}번</span>{student.name}
              </div>
            ) : <div key={c} />))}
          </div>
        </div>
      )}

      {currentUser && (
        <p className="text-[11px] text-ink-faint leading-relaxed">
          {editing
            ? "구역 이름을 누르면 이름을 바꾸거나 삭제할 수 있고, 조 번호 옆 × 로 조를 삭제합니다. 위의 + 버튼으로 구역·조를 추가하세요."
            : "구역 왼쪽의 ⠿ 손잡이를 끌어 다른 구역에 놓으면, 그 구역의 모든 조 배정이 함께 옮겨지고 사이에 있던 구역은 한 칸씩 밀립니다. (키보드는 손잡이에서 ↑ ↓)"}
        </p>
      )}

      {activeSlot && (
        <div className="ui-fade ui-scrim fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-lg w-full shadow-2xl border border-line ui-pop space-y-4">
            <div className="flex justify-between items-center border-b border-line pb-3">
              <h4 className="text-[18px] font-medium text-white">{areas[activeSlot.row]} ({groupLabel(activeSlot.col)}) 학생 배정</h4>
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

      {areaDialog && (
        <div className="ui-fade ui-scrim fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={submitArea} className="bg-surface rounded-card p-6 max-w-sm w-full shadow-2xl border border-line ui-pop space-y-4">
            <div className="flex justify-between items-center border-b border-line pb-3">
              <h4 className="text-[18px] font-medium text-white">{areaDialog.mode === "add" ? "구역 추가" : "구역 이름 바꾸기"}</h4>
              <button type="button" onClick={() => setAreaDialog(null)} aria-label="닫기" className="text-ink-muted hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <label className="block">
              <span className="block text-[11px] font-mono text-ink-muted mb-1">구역 이름</span>
              <input
                type="text"
                autoFocus
                value={areaName}
                maxLength={MAX_AREA_NAME}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="예) 급식실 앞 복도"
                className="w-full bg-well border border-line text-white rounded-field p-2.5 text-[14px] outline-none focus:border-emerald-400"
              />
            </label>
            <div className="flex gap-2 text-[12px] font-bold">
              {areaDialog.mode === "rename" && (
                <button type="button" onClick={deleteArea} className="px-4 py-2.5 rounded-field border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-colors">삭제</button>
              )}
              <button type="button" onClick={() => setAreaDialog(null)} className="flex-1 py-2.5 rounded-field border border-line bg-well hover:bg-raised text-ink transition-colors">취소</button>
              <button type="submit" disabled={!areaName.trim()} className="flex-1 py-2.5 rounded-field bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {areaDialog.mode === "add" ? "추가" : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
