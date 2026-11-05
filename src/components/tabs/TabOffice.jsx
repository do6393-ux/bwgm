import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ExternalLink, RefreshCw } from "lucide-react";
import DatePicker from "@/components/ui/DatePicker";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

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

  // 조회할 교사 이름: 이 기기에서 지정한 값 → 로그인 계정의 표시 이름 → (없으면) 비워 두고 직접 설정하게 한다
  const [teacherName, setTeacherName] = useState(() => localStorage.getItem("office_teacher_name") || currentUser?.displayName || "");
  // 컴시간 교사 번호(선택). 동기화 데이터가 교사 번호를 문서 ID 로 쓰는 경우에만 필요하다.
  const [teacherCode, setTeacherCode] = useState(() => {
    const saved = localStorage.getItem("office_teacher_code");
    if (saved !== null) return saved;
    // 예전 버전은 "신정훈" 선생님의 컴시간 번호(32)를 코드에 고정해 두었다.
    // 이미 쓰던 사용자의 시간표가 끊기지 않도록 처음 한 번만 이어받고, 이후에는 화면에서 바꿀 수 있다.
    const name = localStorage.getItem("office_teacher_name") || currentUser?.displayName || "";
    return name.startsWith("신정") || name.includes("정훈") ? "32" : "";
  });
  const [grade, setGrade] = useState(() => Number(localStorage.getItem("office_grade")) || 1);
  const [classNum, setClassNum] = useState(() => Number(localStorage.getItem("office_class")) || 7);
  const [isNextWeek, setIsNextWeek] = useState(false);

  const [teacherBase, setTeacherBase] = useState(() => Array(7).fill().map(() => Array(5).fill("")));
  const [classBase, setClassBase] = useState(() => Array(7).fill().map(() => Array(5).fill("")));
  const [baseReady, setBaseReady] = useState(false);

  // 오늘 날짜(기기의 현지 시간 기준). toISOString() 은 UTC 라서 한국 시간 09시 이전에는 전날이 나온다.
  const [mealDate, setMealDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const [modalType, setModalType] = useState(null); 
  const [modalInputMatrix, setModalInputMatrix] = useState(() => Array(7).fill().map(() => Array(5).fill("")));
  const [tempTeacherName, setTempTeacherName] = useState("");
  const [tempTeacherCode, setTempTeacherCode] = useState("");

  // ── 기본 시간표(교사가 직접 등록해 둔 표) ─────────────────────────────────
  // baseReloadKey 를 올리면 다시 불러온다 (기본 시간표를 저장한 직후).
  const [baseReloadKey, setBaseReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const classKey = `${grade}-${classNum}`;

      let tBase = null;
      if (teacherName) {
        for (const key of [`${userId}_teacher_${teacherName}`, `teacher_${teacherName}`]) {
          try {
            const snap = await getDoc(doc(db, "base_timetables", key));
            if (snap.exists()) {
              tBase = parseMatrixData(snap.data().matrixJson || snap.data().matrix);
              if (tBase) break;
            }
          } catch {
            // 읽기에 실패하면 다음 키를 보고, 그래도 없으면 이 기기에 저장된 사본을 쓴다
          }
        }
      }
      if (!tBase) {
        const local = localStorage.getItem(`base_tt_teacher_${userId}_${teacherName}`) || localStorage.getItem(`base_tt_teacher_${teacherName}`);
        tBase = parseMatrixData(local) || Array(7).fill().map(() => Array(5).fill(""));
      }

      let cBase = null;
      for (const key of [`${userId}_class_${grade}_${classNum}`, `class_${grade}_${classNum}`]) {
        try {
          const snap = await getDoc(doc(db, "base_timetables", key));
          if (snap.exists()) {
            cBase = parseMatrixData(snap.data().matrixJson || snap.data().matrix);
            if (cBase) break;
          }
        } catch {
          // 위와 같이 다음 키 → 로컬 사본 순으로 대신한다
        }
      }
      if (!cBase) {
        const local = localStorage.getItem(`base_tt_class_${userId}_${classKey}`) || localStorage.getItem(`base_tt_class_${classKey}`);
        cBase = parseMatrixData(local) || Array(7).fill().map(() => Array(5).fill(""));
      }

      if (cancelled) return;
      setTeacherBase(tBase);
      setClassBase(cBase);
      setBaseReady(true);
    })();
    return () => { cancelled = true; };
  }, [userId, teacherName, grade, classNum, baseReloadKey]);

  // ── 컴시간 실시간 시간표 (GitHub Actions 동기화가 timetable_schedules 에 기록) ──
  // 요청한 조건(scheduleKey)과 결과의 key 가 다르면 아직 받아오는 중이다.
  const scheduleKey = `${teacherName}|${teacherCode}|${grade}-${classNum}|${isNextWeek ? "next" : "this"}`;
  const [scheduleResult, setScheduleResult] = useState({ key: null, teacher: null, cls: null, failed: false });
  const isSyncingSchedule = scheduleResult.key !== scheduleKey;
  const teacherSchedule = scheduleResult.teacher;
  const classSchedule = scheduleResult.cls;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const weekKey = isNextWeek ? "next" : "this";
      const classKey = `${grade}-${classNum}`;
      let failed = false; // 문서가 없는 것과 읽기 자체가 실패한 것을 구분한다

      // 교사 문서 ID 후보: 이름 앞 2글자, 전체 이름, (설정한 경우) 컴시간 교사 번호
      const tKeys = [...new Set([teacherName.substring(0, 2), teacherName, teacherCode].filter(Boolean))];

      let tSched = null;
      for (const k of tKeys) {
        try {
          const snap = await getDoc(doc(db, "timetable_schedules", `tt_teacher_${weekKey}_${k}`));
          if (snap.exists() && snap.data().schedule) {
            tSched = snap.data().schedule;
            break;
          }
        } catch {
          failed = true;
        }
      }

      let cSched = null;
      try {
        const snap = await getDoc(doc(db, "timetable_schedules", `tt_class_${weekKey}_${classKey}`));
        if (snap.exists() && snap.data().schedule) {
          cSched = snap.data().schedule;
        }
      } catch {
        failed = true;
      }

      if (!cancelled) setScheduleResult({ key: scheduleKey, teacher: tSched, cls: cSched, failed });
    })();
    return () => { cancelled = true; };
  }, [scheduleKey, teacherName, teacherCode, grade, classNum, isNextWeek]);

  // "데이터 연동 상태" 표시: 항상 "정상"이 아니라 실제로 받은 결과를 보여준다
  const scheduleStatus = isSyncingSchedule
    ? { label: "동기화 중...", className: "text-accent" }
    : teacherSchedule && classSchedule
    ? { label: "정상 수신 (컴시간)", className: "text-ok" }
    : scheduleResult.failed
    ? { label: "수신 실패 (연결·권한 확인)", className: "text-danger" }
    : teacherSchedule || classSchedule
    ? { label: `일부만 수신 (${teacherSchedule ? "학급" : "교사"} 시간표 없음)`, className: "text-warn" }
    : { label: "수신된 시간표 없음 (동기화 대기)", className: "text-warn" };

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

  // ── 급식 (NEIS) ──────────────────────────────────────────────────────────
  // mealReloadKey 를 올리면 같은 날짜라도 다시 조회한다 ("조회" 버튼).
  // 날짜를 빠르게 바꿔도 늦게 도착한 이전 응답이 화면을 덮어쓰지 않는다.
  const [mealReloadKey, setMealReloadKey] = useState(0);
  const mealRequestKey = `${mealDate}#${mealReloadKey}`;
  const [mealResult, setMealResult] = useState({ key: null, list: [], status: "ok" }); // status: ok | empty | error
  const mealLoading = !!mealDate && mealResult.key !== mealRequestKey;
  const mealList = mealResult.list;
  const mealStatus = mealResult.status;

  useEffect(() => {
    // 날짜를 지우는 중간 상태("")에서는 조회하지 않는다
    if (!mealDate) return;
    let cancelled = false;
    (async () => {
      const dateStr = mealDate.replace(/-/g, "");
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
        } catch {
          // 네트워크 오류나 JSON 이 아닌 응답이면 다음 주소를 시도한다
        }
      }

      // error: 응답을 받지 못함 / empty: 응답은 받았지만 그날 급식이 없음(주말·휴업일) / ok: 급식 있음
      let status = "error";
      let list = [];
      if (data) {
        status = "empty";
        const rows = data.mealServiceDietInfo?.[1]?.row;
        if (rows?.length > 0) {
          const lunch = rows.find((r) => r.MMEAL_SC_NM === "중식" || r.MMEAL_SC_CODE === "2") || rows[0];
          if (lunch?.DDISH_NM) {
            list = lunch.DDISH_NM
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/\([0-9.\s]+\)/g, "")
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean);
            status = list.length > 0 ? "ok" : "empty";
          }
        }
      }

      if (!cancelled) setMealResult({ key: mealRequestKey, list, status });
    })();
    return () => { cancelled = true; };
  }, [mealDate, mealRequestKey]);

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
    setBaseReloadKey((k) => k + 1);
  };

  const renderCell = (periodIdx, dayIdx, currentScheduleMap, baseMatrix, isClass = false) => {
    if (isSyncingSchedule) {
      return (
        <td key={dayIdx} className="px-1 py-1 md:p-3 border border-line">
          <div className="flex items-center justify-center min-h-[30px] md:min-h-[38px]">
            <Skeleton className="h-3 w-3/4 max-w-[72px]" style={{ animationDelay: `-${(periodIdx + dayIdx) * 110}ms` }} />
          </div>
        </td>
      );
    }
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
        className={`px-1 py-1 md:p-3 text-center break-keep border border-line font-mono text-[12px] md:text-[13px] tracking-tight transition-colors ${
          isMint
            ? "bg-ok/10 text-ok font-bold border-ok/30"
            : isChanged
            ? "bg-accent/10 text-accent font-bold border-accent/40 shadow-[inset_0_0_8px_rgba(255,80,0,0.15)]"
            : text
            ? "text-ink"
            : "text-ink-ghost"
        }`}
      >
        <div className="flex flex-col items-center justify-center min-h-[30px] md:min-h-[38px]">
          <span>{text || "—"}</span>
          {isChanged && <span className="text-[10px] font-bold text-accent mt-0.5">변동</span>}
          {isMint && <span className="text-[10px] font-bold text-ok mt-0.5">창체</span>}
        </div>
      </td>
    );
  };

  // 오늘 요일(월~금 = 0~4). 이번 주를 볼 때만 표시한다
  const todayCol = isNextWeek ? -1 : new Date().getDay() - 1;

  // 시간표 표. 모바일에서는 칸을 줄이고 "월요일" 대신 "월", "1교시" 대신 "1" 로 보여 한 화면에 들어오게 한다
  const renderTable = (schedule, base, isClass) => (
    <div className="overflow-x-auto border border-line bg-page">
      <table aria-busy={isSyncingSchedule} className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line bg-surface">
            <th className="p-2 md:p-3 font-mono text-[10px] md:text-[11px] text-ink-faint md:tracking-widest text-center w-9 md:w-20 border-r border-line">
              교시
            </th>
            {DAYS.map((d, i) => (
              <th
                key={d}
                aria-current={i === todayCol ? "date" : undefined}
                className={`p-2 md:p-3 font-mono text-[12px] md:tracking-widest text-center border-r last:border-r-0 border-line ${
                  i === todayCol ? "text-accent shadow-[inset_0_2px_0_0_rgb(var(--c-accent))]" : "text-ink-muted"
                }`}
              >
                {d}
                <span className="hidden md:inline">요일</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 7 }, (_, r) => (
            <tr key={r} className="border-b border-line last:border-b-0 hover:bg-white/[0.02] transition-colors">
              <td className="p-2 md:p-3 font-mono text-[11px] md:text-[12px] text-ink-faint text-center border-r border-line bg-well">
                {r + 1}
                <span className="hidden md:inline">교시</span>
              </td>
              {Array.from({ length: 5 }, (_, c) => renderCell(r, c, schedule, base, isClass))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // 범례 + 기본 시간표 버튼. 넓은 화면에서는 제목 옆에, 모바일에서는 표 아래에 둬서 표가 먼저 보이게 한다
  const teacherTools = (
    <>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-accent block"></span>
        <span className="text-ink-muted">시간표 변동</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-ok block"></span>
        <span className="text-ink-muted">창체 (자치/동아/봉사/진로)</span>
      </div>
      {currentUser && !baseReady && <Skeleton className="h-7 w-36" />}
      {currentUser && baseReady && (
        <button
          onClick={() => {
            setModalInputMatrix(teacherBase);
            setModalType("teacherBase");
          }}
          className={`border px-3 py-1.5 transition-colors ${
            isBaseMatrixEmpty(teacherBase)
              ? "border-accent text-accent hover:bg-accent hover:text-white"
              : "border-line text-ink-muted hover:border-white hover:text-white"
          }`}
        >
          {isBaseMatrixEmpty(teacherBase) ? "[ ! 기본 시간표 등록 요망 ]" : "[ 기본 시간표 수정 ]"}
        </button>
      )}
    </>
  );

  return (
    <div className="space-y-8 md:space-y-16 ui-enter pb-20">
      <section className="md:border border-line md:bg-surface md:p-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 md:gap-6 md:border-b border-line md:pb-6 md:mb-6">
          <div className="hidden md:block">
            <div className="flex items-center gap-3 mb-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
              <span className="hidden md:inline">[ 교무 시스템 // 실시간 시간표 연동 ]</span>
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-ping"></span>
              <span className="text-ink">{isNextWeek ? "다음 주 조회 모드" : "이번 주 조회 모드"}</span>
            </div>
            <h2 className="text-[26px] md:text-[32px] font-normal tracking-tight text-white leading-none">
              시간표 & 급식
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-4 font-mono text-[11px] md:text-[12px]">
            <div className="flex border border-line bg-page">
              <button
                onClick={() => setIsNextWeek(false)}
                className={`px-4 md:px-5 py-2 md:py-2.5 transition-colors font-bold ${!isNextWeek ? "bg-accent text-white" : "text-ink-muted hover:text-white"}`}
              >
                이번 주 시간표
              </button>
              <button
                onClick={() => setIsNextWeek(true)}
                className={`px-4 md:px-5 py-2 md:py-2.5 transition-colors font-bold ${isNextWeek ? "bg-accent text-white" : "text-ink-muted hover:text-white"}`}
              >
                다음 주 시간표
              </button>
            </div>

            <a
              href="http://comci.net:4082/st"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-2 border border-line px-4 py-2.5 hover:border-accent hover:text-accent transition-colors"
            >
              <span>컴시간 바로가기</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <p className={`md:hidden mt-3 font-mono text-[11px] ${scheduleStatus.className}`} role="status">
          ● {scheduleStatus.label}
        </p>

        <div className="hidden md:grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-[11px]">
          <div
            onClick={() => {
              setTempTeacherName(teacherName);
              setTempTeacherCode(teacherCode);
              setModalType("switchTeacher");
            }}
            className="p-4 border border-line bg-page cursor-pointer hover:border-accent transition-colors group"
          >
            <span className="block text-ink-faint mb-1">조회 교사 (클릭하여 변경)</span>
            <span className="text-ink group-hover:text-accent font-bold text-[14px]">
              {teacherName ? `${teacherName} 선생님 ↗` : "교사 이름 설정 ↗"}
            </span>
          </div>

          <div
            onClick={() => setModalType("switchClass")}
            className="p-4 border border-line bg-page cursor-pointer hover:border-accent transition-colors group"
          >
            <span className="block text-ink-faint mb-1">조회 학급 (클릭하여 변경)</span>
            <span className="text-ink group-hover:text-accent font-bold text-[14px]">
              {grade}학년 {classNum}반 ↗
            </span>
          </div>

          <div className="p-4 border border-line bg-page flex items-center justify-between">
            <div>
              <span className="block text-ink-faint mb-1">데이터 연동 상태</span>
              <span className={`${scheduleStatus.className} font-bold`}>
                {scheduleStatus.label}
              </span>
            </div>
            <RefreshCw className={`w-4 h-4 text-ink-ghost ${isSyncingSchedule ? "animate-spin text-accent" : ""}`} />
          </div>

          <div className="p-4 border border-line bg-page flex items-center justify-between">
            <div>
              <span className="block text-ink-faint mb-1">
                시간표 변동 감지 [{isNextWeek ? "다음 주" : "이번 주"}]
              </span>
              {isSyncingSchedule ? (
                <span className="text-ink-faint font-bold">확인 중...</span>
              ) : teacherChangeCount > 0 || classChangeCount > 0 ? (
                <span className="text-accent font-bold">
                  교사 {teacherChangeCount}건 · 학급 {classChangeCount}건 변동
                </span>
              ) : (
                <span className="text-ok font-bold">변동 없음 (기본 일치)</span>
              )}
            </div>
            <div className={`w-2.5 h-2.5 rounded-full ${isSyncingSchedule ? "bg-ink-ghost" : teacherChangeCount > 0 || classChangeCount > 0 ? "bg-accent animate-pulse" : "bg-ok"}`}></div>
          </div>
        </div>
      </section>

      <section className="space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-line pb-3 md:pb-4 gap-4">
          <div className="flex md:block items-center justify-between w-full sm:w-auto gap-3">
            <div className="hidden md:flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-widest text-accent">
                // 01. 교사별 시간표
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 border border-accent text-accent">
                {isNextWeek ? "다음 주" : "이번 주"} 변동 {isSyncingSchedule ? "–" : teacherChangeCount}건
              </span>
            </div>
            <h3 className="text-[18px] md:text-[24px] font-normal tracking-tight text-white">
              {teacherName ? `${teacherName} 선생님 시간표` : "교사 시간표"}
            </h3>
            <span className="md:hidden shrink-0 text-[11px] font-mono px-2 py-0.5 border border-accent text-accent">
              변동 {isSyncingSchedule ? "–" : teacherChangeCount}건
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-6 font-mono text-[11px]">{teacherTools}</div>
        </div>

        {renderTable(teacherSchedule, teacherBase, false)}
        <div className="sm:hidden flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">{teacherTools}</div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-line pb-4 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-info">
                  // 02. 학급별 시간표
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 border border-info text-info">
                  {isNextWeek ? "다음 주" : "이번 주"} 변동 {isSyncingSchedule ? "–" : classChangeCount}건
                </span>
              </div>
              <h3 className="text-[24px] font-normal tracking-tight text-white">
                {grade}학년 {classNum}반 시간표
              </h3>
            </div>

            {currentUser && !baseReady && <Skeleton className="h-7 w-32" />}
            {currentUser && baseReady && (
              <button
                onClick={() => {
                  setModalInputMatrix(classBase);
                  setModalType("classBase");
                }}
                className={`font-mono text-[11px] border px-3 py-1.5 transition-colors ${
                  isBaseMatrixEmpty(classBase) 
                    ? "border-info text-info hover:bg-info hover:text-white" 
                    : "border-line text-ink-muted hover:border-white hover:text-white"
                }`}
              >
                {isBaseMatrixEmpty(classBase) ? "[ ! 기본 시간표 등록 요망 ]" : "[ 기본 시간표 수정 ]"}
              </button>
            )}
          </div>

          {renderTable(classSchedule, classBase, true)}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="flex justify-between items-end border-b border-line pb-4">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-ok mb-1 block">
                // 03. 오늘의 중식 식단
              </span>
              <h3 className="text-[24px] font-normal tracking-tight text-white">
                오늘의 급식
              </h3>
            </div>
            <span className="text-[11px] font-mono text-ink-faint">
              나이스(NEIS) 연동
            </span>
          </div>

          <div className="border border-line bg-page p-6 space-y-6">
            <div className="flex items-center gap-3">
              {/* 눌러서 작은 달력에서 날짜를 고르면 바로 그 날짜로 조회된다 */}
              <DatePicker value={mealDate} onChange={setMealDate} className="flex-1" />
              <button
                onClick={() => mealDate && setMealReloadKey((k) => k + 1)}
                className="bg-surface border border-line hover:border-white text-white px-5 py-3 font-mono text-[12px] font-bold transition-colors"
              >
                조회
              </button>
            </div>

            <div className="border border-dashed border-line bg-well p-6 font-mono relative">
              <div className="flex justify-between items-center text-[11px] text-ink-faint pb-3 border-b border-raised mb-4">
                <span>급식 정보 수신</span>
                <span className={mealLoading ? "text-accent" : mealStatus === "error" ? "text-danger" : mealStatus === "empty" ? "text-ink-muted" : "text-ok"}>
                  {mealLoading ? "조회 중..." : mealStatus === "error" ? "조회 실패" : mealStatus === "empty" ? "급식 없음" : "정상 조회"}
                </span>
              </div>

              {mealLoading ? (
                <SkeletonGroup label="급식 정보를 불러오는 중" className="space-y-2.5">
                  {[62, 78, 50, 68, 56].map((w, idx) => (
                    <div key={idx} className="flex justify-between items-baseline border-b border-surface pb-2 last:border-b-0">
                      <Skeleton className="h-4" style={{ width: `${w}%`, animationDelay: `-${idx * 140}ms` }} />
                      <Skeleton className="h-3 w-4" style={{ animationDelay: `-${idx * 140}ms` }} />
                    </div>
                  ))}
                </SkeletonGroup>
              ) : mealList.length === 0 ? (
                <div className="py-12 text-center text-ink-faint text-[12px] leading-relaxed">
                  {mealStatus === "error" ? (
                    <>
                      급식 정보를 불러오지 못했습니다.<br />
                      (네트워크 또는 NEIS 인증키를 확인하세요)
                    </>
                  ) : (
                    <>
                      등록된 급식 정보가 없습니다.<br />
                      (주말 또는 공휴일/휴업일)
                    </>
                  )}
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {mealList.map((dish, idx) => (
                    <li key={idx} className="flex justify-between items-baseline text-[14px] text-ink border-b border-surface pb-2 last:border-b-0">
                      <span className="font-light">{dish}</span>
                      <span className="text-[11px] text-ink-faint">0{idx + 1}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 pt-3 border-t border-raised flex justify-between text-[10px] text-ink-faint">
                <span>부원여자중학교 정보교실</span>
                <span>NEIS DIET FEED</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 모달 레이어 */}
      {modalType && (
        <div className="ui-fade ui-scrim fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-page border border-line-strong text-white p-8 max-w-2xl w-full shadow-[8px_8px_0px_0px_rgba(255,80,0,1)] ui-pop">
            
            {(modalType === "teacherBase" || modalType === "classBase") && (
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-line pb-4">
                  <div>
                    <span className="text-[11px] font-mono text-accent uppercase tracking-widest block mb-1">
                      // 기본 시간표 설정
                    </span>
                    <h3 className="text-[20px] font-normal tracking-tight">
                      {modalType === "teacherBase" ? `${teacherName} 선생님 기본 시간표` : `${grade}학년 ${classNum}반 기본 시간표`}
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-ink-faint">[ 7교시 x 5일 ]</span>
                </div>

                <p className="text-[12px] font-mono text-ink-muted">
                  등록해 둔 시간표를 기준으로 컴시간 실시간 시간표와의 차이점(보강, 시간표 교체)을 자동 감지합니다.
                </p>

                <div className="overflow-x-auto border border-line max-h-[420px]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-surface border-b border-line">
                        <th className="p-2 font-mono text-[11px] text-ink-faint w-14 text-center">교시</th>
                        {DAYS.map(d => (
                          <th key={d} className="p-2 font-mono text-[11px] text-ink-muted text-center border-l border-line">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 7 }, (_, r) => (
                        <tr key={r} className="border-b border-line last:border-b-0">
                          <td className="p-2 font-mono text-[11px] text-center text-ink-faint bg-well">{r + 1}교시</td>
                          {Array.from({ length: 5 }, (_, c) => (
                            <td key={c} className="p-1 border-l border-line">
                              <input
                                type="text"
                                value={modalInputMatrix[r]?.[c] || ""}
                                onChange={(e) => {
                                  const updated = modalInputMatrix.map(row => [...row]);
                                  updated[r][c] = e.target.value;
                                  setModalInputMatrix(updated);
                                }}
                                placeholder="과목명"
                                className="w-full bg-surface border border-line p-1.5 text-center text-[12px] font-mono text-white outline-none focus:border-accent"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-4 font-mono text-[12px] pt-4 border-t border-line">
                  <button onClick={() => setModalType(null)} className="px-4 py-2 text-ink-faint hover:text-white transition-colors">
                    취소
                  </button>
                  <button onClick={handleSaveBaseModal} className="bg-accent text-white px-6 py-2 font-bold hover:bg-accent-strong transition-colors">
                    저장하기
                  </button>
                </div>
              </div>
            )}

            {modalType === "switchTeacher" && (
              <div className="space-y-6">
                <div className="border-b border-line pb-4">
                  <span className="text-[11px] font-mono text-accent uppercase tracking-widest block mb-1">
                    // 교사 선택
                  </span>
                  <h3 className="text-[20px] font-normal tracking-tight">조회할 교사 성함 변경</h3>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-ink-faint mb-2">교사 성함 입력</label>
                  <input
                    type="text"
                    value={tempTeacherName}
                    onChange={(e) => setTempTeacherName(e.target.value)}
                    placeholder="예: 홍길동"
                    className="w-full bg-surface border border-line p-3 text-[16px] font-mono text-white outline-none focus:border-accent"
                  />
                  <label className="block text-[11px] font-mono text-ink-faint mt-4 mb-2">컴시간 교사 번호 (선택)</label>
                  <input
                    type="text"
                    value={tempTeacherCode}
                    onChange={(e) => setTempTeacherCode(e.target.value)}
                    placeholder="예: 32"
                    className="w-full bg-surface border border-line p-3 text-[16px] font-mono text-white outline-none focus:border-accent"
                  />
                  <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
                    시간표 동기화 데이터가 교사 번호로 저장되어 있을 때만 입력하세요. 모르면 비워 두어도 됩니다.
                  </p>
                </div>

                <div className="flex justify-end gap-4 font-mono text-[12px] pt-4 border-t border-line">
                  <button onClick={() => setModalType(null)} className="px-4 py-2 text-ink-faint hover:text-white transition-colors">
                    취소
                  </button>
                  <button
                    onClick={() => {
                      if (!tempTeacherName.trim()) return;
                      setTeacherName(tempTeacherName.trim());
                      localStorage.setItem("office_teacher_name", tempTeacherName.trim());
                      setTeacherCode(tempTeacherCode.trim());
                      localStorage.setItem("office_teacher_code", tempTeacherCode.trim());
                      setModalType(null);
                    }}
                    className="bg-accent text-white px-6 py-2 font-bold hover:bg-accent-strong transition-colors"
                  >
                    확인
                  </button>
                </div>
              </div>
            )}

            {modalType === "switchClass" && (
              <div className="space-y-6">
                <div className="border-b border-line pb-4">
                  <span className="text-[11px] font-mono text-info uppercase tracking-widest block mb-1">
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
                              ? "bg-info border-info text-white font-bold shadow-[2px_2px_0px_0px_#fff]"
                              : "border-line bg-surface text-ink-muted hover:border-white hover:text-white"
                          }`}
                        >
                          {g}학년 {c}반
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-line">
                  <button onClick={() => setModalType(null)} className="font-mono text-[12px] text-ink-faint hover:text-white">
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