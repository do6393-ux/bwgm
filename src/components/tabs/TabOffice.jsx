import React, { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ExternalLink, RefreshCw } from "lucide-react";

const EVENT_KEYWORDS = ["자치", "동아", "봉사", "진로"];
const DAYS = ["월", "화", "수", "목", "금"];

function parseMatrixData(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return parseMatrixData(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) {
    if (Array.isArray(raw[0])) return raw;
    if (raw.length === 35) {
      const res = [];
      for (let i = 0; i < 7; i++) res.push(raw.slice(i * 5, (i + 1) * 5));
      return res;
    }
  }
  return null;
}

function isBaseMatrixEmpty(baseMatrix) {
  if (!baseMatrix) return true;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (baseMatrix[r]?.[c]?.trim() !== "") return false;
    }
  }
  return true;
}

function isCellChanged(r, c, scheduleMap, baseMatrix, isClass = false) {
  if (isBaseMatrixEmpty(baseMatrix)) return false;

  const cellKey = `${r + 1}_${c}`;
  const item = scheduleMap ? scheduleMap[cellKey] : null;

  let text = "";
  let isRed = false;
  if (item) {
    text = typeof item === "object" ? (item.text || "") : String(item);
    isRed = typeof item === "object" && item.type === "red";
  }

  const baseText = baseMatrix?.[r]?.[c] || "";
  const cleanBase = baseText.trim().replace(/\s+/g, "");
  const cleanText = text.trim().replace(/\s+/g, "");

  const isMint = EVENT_KEYWORDS.some((k) => cleanText.includes(k));
  if (isMint) return false;

  if (!cleanBase && !cleanText) return false;

  if (isClass) {
    if (cleanBase !== "" && cleanText !== "") {
      const bSub = cleanBase.slice(0, 2);
      const tSub = cleanText.slice(0, 2);
      const isMatch = bSub === tSub || cleanText.startsWith(cleanBase);
      return !isMatch || isRed;
    }
    return cleanBase !== cleanText || isRed;
  } else {
    return cleanBase !== cleanText || isRed;
  }
}

export default function TabOffice({ currentUser }) {
  const userId = currentUser?.uid || "default_teacher";

  const [teacherName, setTeacherName] = useState(() => localStorage.getItem("office_teacher_name") || "신정훈");
  const [grade, setGrade] = useState(() => Number(localStorage.getItem("office_grade")) || 1);
  const [classNum, setClassNum] = useState(() => Number(localStorage.getItem("office_class")) || 7);
  const [isNextWeek, setIsNextWeek] = useState(false);
  const [isSyncingSchedule, setIsSyncingSchedule] = useState(false);

  const [teacherBase, setTeacherBase] = useState(() => Array(7).fill().map(() => Array(5).fill("")));
  const [classBase, setClassBase] = useState(() => Array(7).fill().map(() => Array(5).fill("")));
  const [teacherSchedule, setTeacherSchedule] = useState(null);
  const [classSchedule, setClassSchedule] = useState(null);

  const [mealDate, setMealDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mealList, setMealList] = useState([]);
  const [mealLoading, setMealLoading] = useState(false);

  const [modalType, setModalType] = useState(null); 
  const [modalInputMatrix, setModalInputMatrix] = useState(() => Array(7).fill().map(() => Array(5).fill("")));
  const [tempTeacherName, setTempTeacherName] = useState("");

  const loadBaseTimetables = useCallback(async () => {
    const classKey = `${grade}-${classNum}`;

    let tBase = null;
    for (const key of [`${userId}_teacher_${teacherName}`, `teacher_${teacherName}`]) {
      try {
        const snap = await getDoc(doc(db, "base_timetables", key));
        if (snap.exists()) {
          tBase = parseMatrixData(snap.data().matrixJson || snap.data().matrix);
          if (tBase) break;
        }
      } catch {}
    }
    if (!tBase) {
      const local = localStorage.getItem(`base_tt_teacher_${userId}_${teacherName}`) || localStorage.getItem(`base_tt_teacher_${teacherName}`);
      tBase = parseMatrixData(local) || Array(7).fill().map(() => Array(5).fill(""));
    }
    setTeacherBase(tBase);

    let cBase = null;
    for (const key of [`${userId}_class_${grade}_${classNum}`, `class_${grade}_${classNum}`]) {
      try {
        const snap = await getDoc(doc(db, "base_timetables", key));
        if (snap.exists()) {
          cBase = parseMatrixData(snap.data().matrixJson || snap.data().matrix);
          if (cBase) break;
        }
      } catch {}
    }
    if (!cBase) {
      const local = localStorage.getItem(`base_tt_class_${userId}_${classKey}`) || localStorage.getItem(`base_tt_class_${classKey}`);
      cBase = parseMatrixData(local) || Array(7).fill().map(() => Array(5).fill(""));
    }
    setClassBase(cBase);
  }, [userId, teacherName, grade, classNum]);

  const loadLiveSchedules = useCallback(async () => {
    setIsSyncingSchedule(true);
    const weekKey = isNextWeek ? "next" : "this";
    const classKey = `${grade}-${classNum}`;

    const namePrefix = teacherName.substring(0, 2);
    const tKeys = [namePrefix, teacherName];
    if (namePrefix === "신정" || teacherName.includes("정훈")) tKeys.push("32");

    let tSched = null;
    for (const k of tKeys) {
      try {
        const snap = await getDoc(doc(db, "timetable_schedules", `tt_teacher_${weekKey}_${k}`));
        if (snap.exists() && snap.data().schedule) {
          tSched = snap.data().schedule;
          break;
        }
      } catch {}
    }
    setTeacherSchedule(tSched);

    let cSched = null;
    try {
      const snap = await getDoc(doc(db, "timetable_schedules", `tt_class_${weekKey}_${classKey}`));
      if (snap.exists() && snap.data().schedule) {
        cSched = snap.data().schedule;
      }
    } catch {}
    setClassSchedule(cSched);
    setIsSyncingSchedule(false);
  }, [teacherName, grade, classNum, isNextWeek]);

  useEffect(() => {
    loadBaseTimetables();
  }, [loadBaseTimetables]);

  useEffect(() => {
    loadLiveSchedules();
  }, [loadLiveSchedules]);

  const teacherChangeCount = useMemo(() => {
    let count = 0;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (isCellChanged(r, c, teacherSchedule, teacherBase, false)) {
          count++;
        }
      }
    }
    return count;
  }, [teacherSchedule, teacherBase]);

  const classChangeCount = useMemo(() => {
    let count = 0;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (isCellChanged(r, c, classSchedule, classBase, true)) {
          count++;
        }
      }
    }
    return count;
  }, [classSchedule, classBase]);

  const fetchMeal = useCallback(async (targetDate) => {
    setMealLoading(true);
    const dateStr = targetDate.replace(/-/g, "");
    const officeCode = "E10";
    const schoolCode = "7331057";

    // NEIS 인증키는 소스에 두지 않고 환경변수(VITE_NEIS_KEY)로 주입. 없으면 키 없는 샘플 호출로 대체.
    const baseUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=10&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${dateStr}`;
    const neisKey = import.meta.env.VITE_NEIS_KEY;
    const urls = neisKey ? [`${baseUrl}&KEY=${neisKey}`, baseUrl] : [baseUrl];

    let data = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.mealServiceDietInfo || json.RESULT?.CODE === "INFO-200") {
          data = json;
          break;
        }
      } catch {}
    }

    if (data?.mealServiceDietInfo?.[1]?.row?.length > 0) {
      const rows = data.mealServiceDietInfo[1].row;
      const lunch = rows.find(r => r.MMEAL_SC_NM === "중식" || r.MMEAL_SC_CODE === "2") || rows[0];
      if (lunch?.DDISH_NM) {
        const clean = lunch.DDISH_NM
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/\([0-9\.\s]+\)/g, "")
          .split("\n")
          .map(item => item.trim())
          .filter(Boolean);
        setMealList(clean);
        setMealLoading(false);
        return;
      }
    }

    setMealList([]);
    setMealLoading(false);
  }, []);

  useEffect(() => {
    fetchMeal(mealDate);
  }, [mealDate, fetchMeal]);

  const handleSaveBaseModal = async () => {
    const matrixStr = JSON.stringify(modalInputMatrix);
    const classKey = `${grade}-${classNum}`;

    if (modalType === "teacherBase") {
      setTeacherBase(modalInputMatrix);
      localStorage.setItem(`base_tt_teacher_${userId}_${teacherName}`, matrixStr);
      try {
        const payload = { userId, teacherName, matrix: matrixStr, matrixJson: matrixStr, updatedAt: new Date().toISOString() };
        await setDoc(doc(db, "base_timetables", `${userId}_teacher_${teacherName}`), payload);
        await setDoc(doc(db, "base_timetables", `teacher_${teacherName}`), payload);
      } catch (e) {
        console.error(e);
      }
    } else if (modalType === "classBase") {
      setClassBase(modalInputMatrix);
      localStorage.setItem(`base_tt_class_${userId}_${classKey}`, matrixStr);
      try {
        const payload = { userId, grade, classNum, matrix: matrixStr, matrixJson: matrixStr, updatedAt: new Date().toISOString() };
        await setDoc(doc(db, "base_timetables", `${userId}_class_${grade}_${classNum}`), payload);
        await setDoc(doc(db, "base_timetables", `class_${grade}_${classNum}`), payload);
      } catch (e) {
        console.error(e);
      }
    }

    setModalType(null);
    loadBaseTimetables();
  };

  const renderCell = (periodIdx, dayIdx, currentScheduleMap, baseMatrix, isClass = false) => {
    const cellKey = `${periodIdx + 1}_${dayIdx}`;
    const item = currentScheduleMap ? currentScheduleMap[cellKey] : null;

    let text = "";
    if (item) {
      text = typeof item === "object" ? (item.text || "") : String(item);
    }

    const cleanText = text.trim().replace(/\s+/g, "");
    const hasBase = !isBaseMatrixEmpty(baseMatrix);
    const isMint = hasBase ? EVENT_KEYWORDS.some(k => cleanText.includes(k)) : false;
    const isChanged = hasBase ? isCellChanged(periodIdx, dayIdx, currentScheduleMap, baseMatrix, isClass) : false;

    return (
      <td
        key={dayIdx}
        className={`p-3 text-center border border-[#222222] font-mono text-[13px] tracking-tight transition-colors ${
          isMint
            ? "bg-[#00E599]/10 text-[#00E599] font-bold border-[#00E599]/30"
            : isChanged
            ? "bg-[#FF5000]/10 text-[#FF5000] font-bold border-[#FF5000]/40 shadow-[inset_0_0_8px_rgba(255,80,0,0.15)]"
            : text
            ? "text-[#E5E5E5]"
            : "text-[#333333]"
        }`}
      >
        <div className="flex flex-col items-center justify-center min-h-[38px]">
          <span>{text || "—"}</span>
          {isChanged && <span className="text-[10px] font-bold text-[#FF5000] mt-0.5">변동</span>}
          {isMint && <span className="text-[10px] font-bold text-[#00E599] mt-0.5">창체</span>}
        </div>
      </td>
    );
  };

  return (
    <div className="space-y-16 animate-in fade-in duration-500 pb-20">
      <section className="border border-[#222222] bg-[#111111] p-5 md:p-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-[#222222] pb-6 md:mb-6 mb-2">
          <div>
            <div className="flex items-center gap-3 mb-2 font-mono text-[11px] uppercase tracking-widest text-[#666666]">
              <span>[ 교무 시스템 // 실시간 시간표 연동 ]</span>
              <span className="w-1.5 h-1.5 bg-[#FF5000] rounded-full animate-ping"></span>
              <span className="text-[#E5E5E5]">{isNextWeek ? "다음 주 조회 모드" : "이번 주 조회 모드"}</span>
            </div>
            <h2 className="text-[26px] md:text-[32px] font-normal tracking-tight text-white leading-none">
              시간표 & 급식
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-4 font-mono text-[11px] md:text-[12px]">
            <div className="flex border border-[#222222] bg-[#050505]">
              <button
                onClick={() => setIsNextWeek(false)}
                className={`px-4 md:px-5 py-2 md:py-2.5 transition-colors font-bold ${!isNextWeek ? "bg-[#FF5000] text-white" : "text-[#888888] hover:text-white"}`}
              >
                이번 주 시간표
              </button>
              <button
                onClick={() => setIsNextWeek(true)}
                className={`px-4 md:px-5 py-2 md:py-2.5 transition-colors font-bold ${isNextWeek ? "bg-[#FF5000] text-white" : "text-[#888888] hover:text-white"}`}
              >
                다음 주 시간표
              </button>
            </div>

            <a
              href="http://comci.net:4082/st"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-2 border border-[#222222] px-4 py-2.5 hover:border-[#FF5000] hover:text-[#FF5000] transition-colors"
            >
              <span>컴시간 바로가기</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="hidden md:grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-[11px]">
          <div
            onClick={() => {
              setTempTeacherName(teacherName);
              setModalType("switchTeacher");
            }}
            className="p-4 border border-[#222222] bg-[#050505] cursor-pointer hover:border-[#FF5000] transition-colors group"
          >
            <span className="block text-[#666666] mb-1">조회 교사 (클릭하여 변경)</span>
            <span className="text-[#E5E5E5] group-hover:text-[#FF5000] font-bold text-[14px]">
              {teacherName} 선생님 ↗
            </span>
          </div>

          <div
            onClick={() => setModalType("switchClass")}
            className="p-4 border border-[#222222] bg-[#050505] cursor-pointer hover:border-[#FF5000] transition-colors group"
          >
            <span className="block text-[#666666] mb-1">조회 학급 (클릭하여 변경)</span>
            <span className="text-[#E5E5E5] group-hover:text-[#FF5000] font-bold text-[14px]">
              {grade}학년 {classNum}반 ↗
            </span>
          </div>

          <div className="p-4 border border-[#222222] bg-[#050505] flex items-center justify-between">
            <div>
              <span className="block text-[#666666] mb-1">데이터 연동 상태</span>
              <span className="text-[#00E599] font-bold">
                {isSyncingSchedule ? "동기화 중..." : "정상 수신 (컴시간·나이스)"}
              </span>
            </div>
            <RefreshCw className={`w-4 h-4 text-[#333333] ${isSyncingSchedule ? "animate-spin text-[#FF5000]" : ""}`} />
          </div>

          <div className="p-4 border border-[#222222] bg-[#050505] flex items-center justify-between">
            <div>
              <span className="block text-[#666666] mb-1">
                시간표 변동 감지 [{isNextWeek ? "다음 주" : "이번 주"}]
              </span>
              {teacherChangeCount > 0 || classChangeCount > 0 ? (
                <span className="text-[#FF5000] font-bold">
                  교사 {teacherChangeCount}건 · 학급 {classChangeCount}건 변동
                </span>
              ) : (
                <span className="text-[#00E599] font-bold">변동 없음 (기본 일치)</span>
              )}
            </div>
            <div className={`w-2.5 h-2.5 rounded-full ${teacherChangeCount > 0 || classChangeCount > 0 ? "bg-[#FF5000] animate-pulse" : "bg-[#00E599]"}`}></div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-[#222222] pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#FF5000]">
                // 01. 교사별 시간표
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 border border-[#FF5000] text-[#FF5000]">
                {isNextWeek ? "다음 주" : "이번 주"} 변동 {teacherChangeCount}건
              </span>
            </div>
            <h3 className="text-[24px] font-normal tracking-tight text-white">
              {teacherName} 선생님 시간표
            </h3>
          </div>

          <div className="flex items-center gap-6 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#FF5000] block"></span>
              <span className="text-[#888888]">시간표 변동</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#00E599] block"></span>
              <span className="text-[#888888]">창체 (자치/동아/봉사/진로)</span>
            </div>
            {currentUser && (
              <button
                onClick={() => {
                  setModalInputMatrix(teacherBase);
                  setModalType("teacherBase");
                }}
                className={`border px-3 py-1.5 transition-colors ${
                  isBaseMatrixEmpty(teacherBase) 
                    ? "border-[#FF5000] text-[#FF5000] hover:bg-[#FF5000] hover:text-white" 
                    : "border-[#222222] text-[#888888] hover:border-white hover:text-white"
                }`}
              >
                {isBaseMatrixEmpty(teacherBase) ? "[ ! 기본 시간표 등록 요망 ]" : "[ 기본 시간표 수정 ]"}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-[#222222] bg-[#050505]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#222222] bg-[#111111]">
                <th className="p-3 font-mono text-[11px] text-[#666666] tracking-widest text-center w-20 border-r border-[#222222]">
                  교시
                </th>
                {DAYS.map(d => (
                  <th key={d} className="p-3 font-mono text-[12px] text-[#888888] tracking-widest text-center border-r last:border-r-0 border-[#222222]">
                    {d}요일
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }, (_, r) => (
                <tr key={r} className="border-b border-[#222222] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 font-mono text-[12px] text-[#666666] text-center border-r border-[#222222] bg-[#0B0B0B]">
                    {r + 1}교시
                  </td>
                  {Array.from({ length: 5 }, (_, c) =>
                    renderCell(r, c, teacherSchedule, teacherBase, false)
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-[#222222] pb-4 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#0055FF]">
                  // 02. 학급별 시간표
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 border border-[#0055FF] text-[#0055FF]">
                  {isNextWeek ? "다음 주" : "이번 주"} 변동 {classChangeCount}건
                </span>
              </div>
              <h3 className="text-[24px] font-normal tracking-tight text-white">
                {grade}학년 {classNum}반 시간표
              </h3>
            </div>

            {currentUser && (
              <button
                onClick={() => {
                  setModalInputMatrix(classBase);
                  setModalType("classBase");
                }}
                className={`font-mono text-[11px] border px-3 py-1.5 transition-colors ${
                  isBaseMatrixEmpty(classBase) 
                    ? "border-[#0055FF] text-[#0055FF] hover:bg-[#0055FF] hover:text-white" 
                    : "border-[#222222] text-[#888888] hover:border-white hover:text-white"
                }`}
              >
                {isBaseMatrixEmpty(classBase) ? "[ ! 기본 시간표 등록 요망 ]" : "[ 기본 시간표 수정 ]"}
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-[#222222] bg-[#050505]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#222222] bg-[#111111]">
                  <th className="p-3 font-mono text-[11px] text-[#666666] tracking-widest text-center w-20 border-r border-[#222222]">
                    교시
                  </th>
                  {DAYS.map(d => (
                    <th key={d} className="p-3 font-mono text-[12px] text-[#888888] tracking-widest text-center border-r last:border-r-0 border-[#222222]">
                      {d}요일
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 7 }, (_, r) => (
                  <tr key={r} className="border-b border-[#222222] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                    <td className="p-3 font-mono text-[12px] text-[#666666] text-center border-r border-[#222222] bg-[#0B0B0B]">
                      {r + 1}교시
                    </td>
                    {Array.from({ length: 5 }, (_, c) =>
                      renderCell(r, c, classSchedule, classBase, true)
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="flex justify-between items-end border-b border-[#222222] pb-4">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#00E599] mb-1 block">
                // 03. 오늘의 중식 식단
              </span>
              <h3 className="text-[24px] font-normal tracking-tight text-white">
                오늘의 급식
              </h3>
            </div>
            <span className="text-[11px] font-mono text-[#666666]">
              나이스(NEIS) 연동
            </span>
          </div>

          <div className="border border-[#222222] bg-[#050505] p-6 space-y-6">
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={mealDate}
                onChange={(e) => setMealDate(e.target.value)}
                className="flex-1 bg-[#111111] border border-[#222222] p-3 text-[14px] font-mono text-white outline-none focus:border-[#FF5000] transition-colors"
              />
              <button
                onClick={() => fetchMeal(mealDate)}
                className="bg-[#111111] border border-[#222222] hover:border-white text-white px-5 py-3 font-mono text-[12px] font-bold transition-colors"
              >
                조회
              </button>
            </div>

            <div className="border border-dashed border-[#222222] bg-[#0A0A0A] p-6 font-mono relative">
              <div className="flex justify-between items-center text-[11px] text-[#666666] pb-3 border-b border-[#1A1A1A] mb-4">
                <span>급식 정보 수신</span>
                <span className="text-[#00E599]">정상 조회</span>
              </div>

              {mealLoading ? (
                <div className="py-12 text-center text-[#666666] text-[12px] animate-pulse">
                  급식 정보를 불러오는 중입니다...
                </div>
              ) : mealList.length === 0 ? (
                <div className="py-12 text-center text-[#555555] text-[12px] leading-relaxed">
                  등록된 급식 정보가 없습니다.<br />
                  (주말 또는 공휴일/휴업일)
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {mealList.map((dish, idx) => (
                    <li key={idx} className="flex justify-between items-baseline text-[14px] text-[#E5E5E5] border-b border-[#141414] pb-2 last:border-b-0">
                      <span className="font-light">{dish}</span>
                      <span className="text-[11px] text-[#555555]">0{idx + 1}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 pt-3 border-t border-[#1A1A1A] flex justify-between text-[10px] text-[#444444]">
                <span>부원여자중학교 정보교실</span>
                <span>NEIS DIET FEED</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 모달 레이어 */}
      {modalType && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-[#333333] text-white p-8 max-w-2xl w-full shadow-[8px_8px_0px_0px_rgba(255,80,0,1)] animate-in fade-in zoom-in-95 duration-200">
            
            {(modalType === "teacherBase" || modalType === "classBase") && (
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-[#222222] pb-4">
                  <div>
                    <span className="text-[11px] font-mono text-[#FF5000] uppercase tracking-widest block mb-1">
                      // 기본 시간표 설정
                    </span>
                    <h3 className="text-[20px] font-normal tracking-tight">
                      {modalType === "teacherBase" ? `${teacherName} 선생님 기본 시간표` : `${grade}학년 ${classNum}반 기본 시간표`}
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#666666]">[ 7교시 x 5일 ]</span>
                </div>

                <p className="text-[12px] font-mono text-[#888888]">
                  등록해 둔 시간표를 기준으로 컴시간 실시간 시간표와의 차이점(보강, 시간표 교체)을 자동 감지합니다.
                </p>

                <div className="overflow-x-auto border border-[#222222] max-h-[420px]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-[#111111] border-b border-[#222222]">
                        <th className="p-2 font-mono text-[11px] text-[#666666] w-14 text-center">교시</th>
                        {DAYS.map(d => (
                          <th key={d} className="p-2 font-mono text-[11px] text-[#888888] text-center border-l border-[#222222]">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 7 }, (_, r) => (
                        <tr key={r} className="border-b border-[#222222] last:border-b-0">
                          <td className="p-2 font-mono text-[11px] text-center text-[#666666] bg-[#0B0B0B]">{r + 1}교시</td>
                          {Array.from({ length: 5 }, (_, c) => (
                            <td key={c} className="p-1 border-l border-[#222222]">
                              <input
                                type="text"
                                value={modalInputMatrix[r]?.[c] || ""}
                                onChange={(e) => {
                                  const updated = modalInputMatrix.map(row => [...row]);
                                  updated[r][c] = e.target.value;
                                  setModalInputMatrix(updated);
                                }}
                                placeholder="과목명"
                                className="w-full bg-[#111111] border border-[#222222] p-1.5 text-center text-[12px] font-mono text-white outline-none focus:border-[#FF5000]"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-4 font-mono text-[12px] pt-4 border-t border-[#222222]">
                  <button onClick={() => setModalType(null)} className="px-4 py-2 text-[#666666] hover:text-white transition-colors">
                    취소
                  </button>
                  <button onClick={handleSaveBaseModal} className="bg-[#FF5000] text-white px-6 py-2 font-bold hover:bg-[#FF3000] transition-colors">
                    저장하기
                  </button>
                </div>
              </div>
            )}

            {modalType === "switchTeacher" && (
              <div className="space-y-6">
                <div className="border-b border-[#222222] pb-4">
                  <span className="text-[11px] font-mono text-[#FF5000] uppercase tracking-widest block mb-1">
                    // 교사 선택
                  </span>
                  <h3 className="text-[20px] font-normal tracking-tight">조회할 교사 성함 변경</h3>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-[#666666] mb-2">교사 성함 입력</label>
                  <input
                    type="text"
                    value={tempTeacherName}
                    onChange={(e) => setTempTeacherName(e.target.value)}
                    placeholder="예: 신정훈"
                    className="w-full bg-[#111111] border border-[#222222] p-3 text-[16px] font-mono text-white outline-none focus:border-[#FF5000]"
                  />
                </div>

                <div className="flex justify-end gap-4 font-mono text-[12px] pt-4 border-t border-[#222222]">
                  <button onClick={() => setModalType(null)} className="px-4 py-2 text-[#666666] hover:text-white transition-colors">
                    취소
                  </button>
                  <button
                    onClick={() => {
                      if (!tempTeacherName.trim()) return;
                      setTeacherName(tempTeacherName.trim());
                      localStorage.setItem("office_teacher_name", tempTeacherName.trim());
                      setModalType(null);
                    }}
                    className="bg-[#FF5000] text-white px-6 py-2 font-bold hover:bg-[#FF3000] transition-colors"
                  >
                    확인
                  </button>
                </div>
              </div>
            )}

            {modalType === "switchClass" && (
              <div className="space-y-6">
                <div className="border-b border-[#222222] pb-4">
                  <span className="text-[11px] font-mono text-[#0055FF] uppercase tracking-widest block mb-1">
                    // 학급 선택
                  </span>
                  <h3 className="text-[20px] font-normal tracking-tight">조회할 학급을 선택하세요</h3>
                </div>

                <div className="grid grid-cols-5 gap-3 max-h-[320px] overflow-y-auto pr-2">
                  {Array.from({ length: 3 }, (_, gIdx) =>
                    Array.from({ length: 10 }, (_, cIdx) => {
                      const g = gIdx + 1;
                      const c = cIdx + 1;
                      const isSelected = grade === g && classNum === c;
                      return (
                        <button
                          key={`${g}-${c}`}
                          onClick={() => {
                            setGrade(g);
                            setClassNum(c);
                            localStorage.setItem("office_grade", g);
                            localStorage.setItem("office_class", c);
                            setModalType(null);
                          }}
                          className={`p-3 font-mono text-[13px] border transition-all ${
                            isSelected
                              ? "bg-[#0055FF] border-[#0055FF] text-white font-bold shadow-[2px_2px_0px_0px_#fff]"
                              : "border-[#222222] bg-[#111111] text-[#888888] hover:border-white hover:text-white"
                          }`}
                        >
                          {g}학년 {c}반
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-[#222222]">
                  <button onClick={() => setModalType(null)} className="font-mono text-[12px] text-[#666666] hover:text-white">
                    닫기
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}