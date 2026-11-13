import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { loadSynced } from "@/lib/syncedStorage";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Users, PhoneCall, Grid, Sparkles, RefreshCw, Monitor } from "lucide-react";

import { DEFAULT_BEHAVIOR_PRESETS } from "./defaultPresets";

import SubtabContacts from "./SubtabContacts";
import SubtabCleaning from "./SubtabCleaning";
import SubtabSeating from "./SubtabSeating";
import SubtabRecords from "./SubtabRecords";
import SubtabClassroom from "./SubtabClassroom";

const SUBTABS = [
  { id: "contacts", label: "비상연락망", icon: PhoneCall, color: "text-rose-400" },
  { id: "seating", label: "자리배치", icon: Grid, color: "text-indigo-400" },
  { id: "cleaning", label: "청소구역", icon: Sparkles, color: "text-emerald-400" },
  { id: "records", label: "행발세특 조립기", shortLabel: "행발세특", icon: RefreshCw, color: "text-purple-400" }, // shortLabel: 폰에서 쓰는 짧은 이름
  { id: "classroom", label: "교실 화면", shortLabel: "교실화면", icon: Monitor, color: "text-emerald-400" }, // 교실 TV·전자칠판용
];

export default function TabHomeroom({ currentUser }) {
  const userId = currentUser?.uid || "default_teacher";

  const [activeSubtab, setActiveSubtab] = useState("contacts");
  const [grade, setGrade] = useState(() => Number(localStorage.getItem("homeroom_grade")) || 1);
  const [classNum, setClassNum] = useState(() => Number(localStorage.getItem("homeroom_class")) || 7);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);

  const [contacts, setContacts] = useState([]);
  // 어느 학급의 연락처까지 불러왔는지. 지금 학급과 다르면 아직 불러오는 중이다 (학급을 바꿀 때도 같은 방식)
  const [contactsLoadedKey, setContactsLoadedKey] = useState(null);
  const [excludedStudentNums, setExcludedStudentNums] = useState(new Set());

  // 프리셋 초기화
  useEffect(() => {
    const initDBPresets = async () => {
      try {
        const presetRef = doc(db, "shared_records_presets", "global_presets");
        const snap = await getDoc(presetRef);
        if (!snap.exists()) {
          await setDoc(presetRef, {
            presets: DEFAULT_BEHAVIOR_PRESETS,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        console.error("Preset Init Error:", e);
      }
    };
    initDBPresets();
  }, []);

  // 🎯 과거 바닐라 JS의 다중 키 탐색 로직(candidateKeys) 완벽 복원
  const loadSeqRef = useRef(0);
  const loadHomeroomContacts = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const candidateKeys = [
      `${userId}_${grade}_${classNum}`,
      `${userId}_${grade}-${classNum}`,
      `${grade}_${classNum}`,
      `${grade}-${classNum}`,
    ];

    let loaded = null;
    
    // 키 후보를 차례로 보면서, 처음으로 데이터가 있는 키를 쓴다.
    // Firestore 를 기준으로 읽고, 서버에 못 올라간 더 최근 로컬 사본이 있으면 그걸 쓴다.
    for (const key of candidateKeys) {
      const list = await loadSynced(
        `contacts_${key}`,
        doc(db, "homeroom_contacts", key),
        (d) => (d.list?.length > 0 ? d.list : null)
      );
      if (Array.isArray(list) && list.length > 0) {
        loaded = list;
        break;
      }
    }
    
    // 그 사이 학급이 바뀌었으면 늦게 온 응답은 버린다
    if (seq !== loadSeqRef.current) return;
    
    setContacts(loaded || []);
    setContactsLoadedKey(`${userId}_${grade}_${classNum}`);
  }, [userId, grade, classNum]);

  useEffect(() => {
    loadHomeroomContacts();
  }, [loadHomeroomContacts]);

  const contactsLoading = contactsLoadedKey !== `${userId}_${grade}_${classNum}`;

  return (
    <div className="space-y-4 md:space-y-12 ui-enter pb-24 text-ink-strong">
      <section className="md:border border-line md:bg-surface md:rounded-card md:p-8 md:shadow-xl">
        <div className="flex flex-row justify-between items-center gap-3 md:gap-6 md:border-b border-line md:pb-6 mb-3 md:mb-6">
          <div>
            <div className="hidden md:flex items-center gap-2 mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399] animate-pulse"></span>
              <span className="font-semibold text-ink">HOMEROOM CONTROL MATRIX</span>
            </div>
            <h2 className="text-[20px] md:text-[32px] font-normal tracking-tight text-white leading-tight">
              {grade}학년 {classNum}반 담임
            </h2>
          </div>

          <button
            onClick={() => setIsClassModalOpen(true)}
            className="flex items-center gap-2.5 bg-well border border-line hover:border-emerald-400 text-ink px-3 md:px-5 py-1.5 md:py-2.5 shrink-0 rounded-full font-mono text-[12px] md:text-[13px] font-bold shadow-sm transition-all hover:-translate-y-0.5 active:scale-95"
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span><span className="md:hidden">학급 설정</span><span className="hidden md:inline">{grade}학년 {classNum}반 설정 ↗</span></span>
          </button>
        </div>

        <div className="grid grid-cols-5 md:flex md:flex-wrap gap-1.5 md:gap-2.5">
          {SUBTABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubtab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubtab(tab.id)}
                className={`flex items-center justify-center gap-2 px-1 md:px-5 py-2 md:py-2.5 rounded-full text-[12px] md:text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.15)] font-bold"
                    : "bg-well hover:bg-raised text-ink-muted border border-line"
                }`}
              >
                <Icon className={`hidden md:block w-3.5 h-3.5 ${isActive ? tab.color : "text-ink-faint"}`} />
                <span>{tab.shortLabel ? (<><span className="md:hidden">{tab.shortLabel}</span><span className="hidden md:inline">{tab.label}</span></>) : tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section key={activeSubtab} className="ui-enter">
        {activeSubtab === "contacts" && <SubtabContacts userId={userId} grade={grade} classNum={classNum} contacts={contacts} loading={contactsLoading} currentUser={currentUser} onContactsUpdated={loadHomeroomContacts} />}
        {activeSubtab === "seating" && <SubtabSeating userId={userId} grade={grade} classNum={classNum} contacts={contacts} excludedStudentNums={excludedStudentNums} setExcludedStudentNums={setExcludedStudentNums} contactsLoading={contactsLoading} currentUser={currentUser} />}
        {activeSubtab === "cleaning" && <SubtabCleaning userId={userId} grade={grade} classNum={classNum} contacts={contacts} currentUser={currentUser} />}
        {activeSubtab === "records" && <SubtabRecords userId={userId} grade={grade} classNum={classNum} contacts={contacts} currentUser={currentUser} />}
        {activeSubtab === "classroom" && <SubtabClassroom grade={grade} classNum={classNum} />}
      </section>

      {isClassModalOpen && (
        <div className="ui-fade ui-scrim fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-8 max-w-md w-full shadow-2xl border border-line ui-pop">
            <div className="flex justify-between items-start border-b border-line pb-4 mb-6">
              <div>
                <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block mb-1">// HOMEROOM TARGET ROUTE</span>
                <h3 className="text-[22px] font-normal tracking-tight text-white">담당 학급을 선택하세요</h3>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
              {Array.from({ length: 3 }, (_, gIdx) =>
                Array.from({ length: 10 }, (_, cIdx) => {
                  const g = gIdx + 1; const c = cIdx + 1; const isSelected = grade === g && classNum === c;
                  return (
                    <button
                      key={`${g}-${c}`}
                      onClick={() => { setGrade(g); setClassNum(c); localStorage.setItem("homeroom_grade", g); localStorage.setItem("homeroom_class", c); setIsClassModalOpen(false); }}
                      className={`p-3 rounded-field font-mono text-[13px] border transition-all ${isSelected ? "bg-white border-white text-black font-bold shadow-[0_0_10px_rgba(255,255,255,0.3)]" : "border-line bg-well text-ink-muted hover:bg-raised"}`}
                    >
                      {g}-{c}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex justify-end pt-5 border-t border-line mt-6">
              <button onClick={() => setIsClassModalOpen(false)} className="px-5 py-2 text-[13px] text-ink-muted hover:text-white font-medium">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}