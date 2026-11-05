import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { loadSynced } from "@/lib/syncedStorage";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Users, PhoneCall, Grid, Sparkles, RefreshCw } from "lucide-react";

import { DEFAULT_BEHAVIOR_PRESETS } from "./defaultPresets";

import SubtabContacts from "./SubtabContacts";
import SubtabCleaning from "./SubtabCleaning";
import SubtabSeating from "./SubtabSeating";
import SubtabRecords from "./SubtabRecords";

const SUBTABS = [
  { id: "contacts", label: "비상연락망", icon: PhoneCall, color: "text-rose-400" },
  { id: "seating", label: "자리배치", icon: Grid, color: "text-indigo-400" },
  { id: "cleaning", label: "청소구역", icon: Sparkles, color: "text-emerald-400" },
  { id: "records", label: "행발세특 조립기", icon: RefreshCw, color: "text-purple-400" },
];

export default function TabHomeroom({ currentUser }) {
  const userId = currentUser?.uid || "default_teacher";

  const [activeSubtab, setActiveSubtab] = useState("contacts");
  const [grade, setGrade] = useState(() => Number(localStorage.getItem("homeroom_grade")) || 1);
  const [classNum, setClassNum] = useState(() => Number(localStorage.getItem("homeroom_class")) || 7);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);

  const [contacts, setContacts] = useState([]);
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
  }, [userId, grade, classNum]);

  useEffect(() => {
    loadHomeroomContacts();
  }, [loadHomeroomContacts]);

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-24 text-[#F5F5F5]">
      <section className="border border-[#666666] bg-[#444444] rounded-3xl p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-[#666666] pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2 font-mono text-[11px] uppercase tracking-wider text-[#A0A0A0]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399] animate-pulse"></span>
              <span className="font-semibold text-[#E0E0E0]">HOMEROOM CONTROL MATRIX</span>
            </div>
            <h2 className="text-[32px] font-normal tracking-tight text-white leading-tight">
              {grade}학년 {classNum}반 담임 교무 관제
            </h2>
          </div>

          <button
            onClick={() => setIsClassModalOpen(true)}
            className="flex items-center gap-2.5 bg-[#333333] border border-[#666666] hover:border-emerald-400 text-[#E0E0E0] px-5 py-2.5 rounded-full font-mono text-[13px] font-bold shadow-sm transition-all hover:-translate-y-0.5 active:scale-95"
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span>{grade}학년 {classNum}반 설정 ↗</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {SUBTABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubtab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubtab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.15)] font-bold"
                    : "bg-[#333333] hover:bg-[#555555] text-[#A0A0A0] border border-[#666666]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? tab.color : "text-[#888888]"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="transition-all duration-300">
        {activeSubtab === "contacts" && <SubtabContacts userId={userId} grade={grade} classNum={classNum} contacts={contacts} currentUser={currentUser} onContactsUpdated={loadHomeroomContacts} />}
        {activeSubtab === "seating" && <SubtabSeating userId={userId} grade={grade} classNum={classNum} contacts={contacts} excludedStudentNums={excludedStudentNums} setExcludedStudentNums={setExcludedStudentNums} currentUser={currentUser} />}
        {activeSubtab === "cleaning" && <SubtabCleaning userId={userId} grade={grade} classNum={classNum} contacts={contacts} currentUser={currentUser} />}
        {activeSubtab === "records" && <SubtabRecords userId={userId} grade={grade} classNum={classNum} contacts={contacts} currentUser={currentUser} />}
      </section>

      {isClassModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#444444] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-[#666666] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-[#666666] pb-4 mb-6">
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
                      className={`p-3 rounded-xl font-mono text-[13px] border transition-all ${isSelected ? "bg-white border-white text-black font-bold shadow-[0_0_10px_rgba(255,255,255,0.3)]" : "border-[#666666] bg-[#333333] text-[#A0A0A0] hover:bg-[#555555]"}`}
                    >
                      {g}-{c}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex justify-end pt-5 border-t border-[#666666] mt-6">
              <button onClick={() => setIsClassModalOpen(false)} className="px-5 py-2 text-[13px] text-[#A0A0A0] hover:text-white font-medium">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}