import React, { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Copy, Check, Sparkles, AlertCircle, Trash2, Plus, Edit3, Type, ListPlus, Database } from "lucide-react";
import { DEFAULT_STYLES } from "./defaultPresets";

const FORBIDDEN_WORDS = [
  "대회", "수상", "금상", "은상", "동상", "대상", "장려상", 
  "토익", "토플", "텝스", "교외", "모의고사", "인증", 
  "부모", "아버지", "어머니", "직업", "올림피아드", "영재"
];

const NEIS_RULES = {
  calculateBytes(text) {
    if (!text) return 0;
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 10) bytes += 2;
      else if (code <= 0x007f) bytes += 1;
      else bytes += 3;
    }
    return bytes;
  }
};

const KoreanGrammar = {
  attachSituationJosa(situationText) {
    if (!situationText) return "";
    const clean = situationText.trim();
    if (clean.endsWith('에') || clean.endsWith('에서') || clean.endsWith('시') || clean.endsWith('때') || clean.endsWith('로서') || clean.endsWith('로')) return clean;
    if (clean.endsWith('도우미') || clean.endsWith('지킴이') || clean.endsWith('담당자') || clean.endsWith('회장') || clean.endsWith('부회장') || clean.endsWith('부원')) return `${clean}로서`;
    if (clean.endsWith('시간')) return `${clean}에`;
    if (clean.endsWith('활동') || clean.endsWith('수업') || clean.endsWith('회의') || clean.endsWith('과정')) return `${clean}에서`;
    if (clean.endsWith('상황') || clean.endsWith('경우')) return `${clean}에서`;
    return `${clean} 시,`;
  },
  formatActionConnective(actionText) {
    if (!actionText) return "";
    let text = actionText.trim().replace(/\.+$/, '');
    const verbMap = [
      { from: /자원함$/, to: '자원하여 솔선하고' },
      { from: /도와줌$/, to: '따뜻하게 도와주며' },
      { from: /챙김$/, to: '세심하게 챙길 줄 알며' },
      { from: /동행함$/, to: '기꺼이 동행해 주며' },
      { from: /경청함$/, to: '성심껏 경청하고' },
      { from: /청소함$/, to: '야무지고 깔끔하게 청소하며' },
      { from: /관리함$/, to: '철저히 관리하여' },
      { from: /수거함$/, to: '책임감 있게 수거하여' },
      { from: /단속함$/, to: '철저히 확인하여' },
      { from: /완수함$/, to: '묵묵히 끝까지 마무리하고' },
      { from: /노력함$/, to: '개선하고자 부단히 노력하며' },
      { from: /소통함$/, to: '원활하게 소통하며' },
      { from: /필기함$/, to: '정자로 또박또박 필기하며' },
      { from: /참여함$/, to: '적극적으로 참여하며' },
      { from: /해결함$/, to: '합리적으로 해결해 내며' },
      { from: /실천함$/, to: '꾸준히 실천하여' },
      { from: /배움$/, to: '배우게 되었으며' },
      { from: /비워냄$/, to: '적절한 시기에 비워내며' },
      { from: /안내함$/, to: '친절하게 안내하고' },
      { from: /세척함$/, to: '깨끗이 세척하며' },
      { from: /점검함$/, to: '꼼꼼하게 점검하고' },
      { from: /지원함$/, to: '원활하게 지원하며' },
      { from: /정돈함$/, to: '항상 제자리에 정돈하고' }
    ];
    for (const item of verbMap) {
      if (item.from.test(text)) return text.replace(item.from, item.to);
    }
    if (text.endsWith('함')) return text.replace(/함$/, '하고');
    if (text.endsWith('음') || text.endsWith('슴')) return text.replace(/[음슴]$/, '으며');
    if (!text.endsWith('고') && !text.endsWith('며') && !text.endsWith('하여')) return `${text}하며`;
    return text;
  }
};

export default function SubtabRecords({ userId, grade, classNum, contacts, currentUser }) {
  const [activeInnerTab, setActiveInnerTab] = useState("engine"); // engine | archive
  const [selectedStudentNum, setSelectedStudentNum] = useState(1);
  const [studentRecords, setStudentRecords] = useState({});
  const [archiveText, setArchiveText] = useState("");

  const [behaviorPresets, setBehaviorPresets] = useState({});
  const [selectedCategoryKey, setSelectedCategoryKey] = useState("");
  const [selectedSituation, setSelectedSituation] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState("none");
  const [assembledResults, setAssembledResults] = useState([]); 

  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presetModalTab, setPresetModalTab] = useState("add"); // add | manage
  const [presetType, setPresetType] = useState("situation"); // category | situation | action
  const [presetInputText, setPresetInputText] = useState("");
  const [presetNewCategory, setPresetNewCategory] = useState("");
  const [presetTargetCat, setPresetTargetCat] = useState("");

  const [copySuccess, setCopySuccess] = useState(false);

  const loadGlobalPresets = async () => {
    try {
      const snap = await getDoc(doc(db, "shared_records_presets", "global_presets"));
      if (snap.exists() && snap.data().presets) {
        setBehaviorPresets(snap.data().presets);
        if (!selectedCategoryKey) setSelectedCategoryKey(Object.keys(snap.data().presets)[0]);
      }
    } catch (e) { console.error("Global Preset Load Error:", e); }
  };

  const loadAccumulatedRecords = useCallback(async () => {
    const key = `${userId}_${grade}_${classNum}`;
    let loaded = null;
    const local = localStorage.getItem(`records_${key}`);
    if (local) { try { loaded = JSON.parse(local); } catch {} }
    if (!loaded) {
      try {
        const snap = await getDoc(doc(db, "homeroom_records", key));
        if (snap.exists() && snap.data().records) loaded = snap.data().records;
      } catch (e) {}
    }
    if (loaded) {
      setStudentRecords(loaded);
      setArchiveText(loaded[selectedStudentNum] || "");
    }
  }, [userId, grade, classNum, selectedStudentNum]);

  useEffect(() => {
    loadGlobalPresets();
    loadAccumulatedRecords();
  }, [loadAccumulatedRecords]);

  useEffect(() => {
    if (activeInnerTab === "archive") {
      setArchiveText(studentRecords[selectedStudentNum] || "");
    } else {
      setAssembledResults([]);
    }
  }, [selectedStudentNum, activeInnerTab, studentRecords]);

  const handleAssemble = () => {
    if (!selectedAction) return alert("구체적 행동/변화를 반드시 선택해주세요.");
    const student = contacts.find(c => c.num === selectedStudentNum) || { name: "" };
    
    const sitWithJosa = KoreanGrammar.attachSituationJosa(selectedSituation);
    const actConnective = KoreanGrammar.formatActionConnective(selectedAction);
    
    let actTerminal = selectedAction.trim().replace(/\.+$/, '');
    if (!actTerminal.endsWith('함') && !actTerminal.endsWith('음') && !actTerminal.endsWith('됨') && !actTerminal.endsWith('임')) {
      actTerminal += '함.';
    } else { actTerminal += '.'; }

    const prefix = sitWithJosa ? `${sitWithJosa} ` : "";
    let finalSentence = "";
    const targetStyle = DEFAULT_STYLES.find(s => s.id === selectedStyleId) || DEFAULT_STYLES[0];

    if (targetStyle.id === "none") {
      finalSentence = `${prefix}${actTerminal}`.replace(/함함\./g, '함.').replace(/음함\./g, '음.');
    } else {
      finalSentence = `${prefix}${actConnective}, ${targetStyle.text}`;
    }

    const bytes = NEIS_RULES.calculateBytes(finalSentence);
    const forbidden = FORBIDDEN_WORDS.filter(w => finalSentence.includes(w));

    setAssembledResults([{
      id: Date.now(),
      studentName: student.name,
      style: targetStyle.name,
      sentence: finalSentence,
      bytes,
      isValid: forbidden.length === 0 && bytes <= 1500
    }]);
  };

  const handleAddToArchive = async (sentence) => {
    const current = studentRecords[selectedStudentNum] || "";
    const updatedText = current ? `${current} ${sentence}` : sentence;
    
    const updated = { ...studentRecords, [selectedStudentNum]: updatedText };
    setStudentRecords(updated);
    if (activeInnerTab === "archive") setArchiveText(updatedText);

    const key = `${userId}_${grade}_${classNum}`;
    localStorage.setItem(`records_${key}`, JSON.stringify(updated));
    try { await setDoc(doc(db, "homeroom_records", key), { userId, grade, classNum, records: updated, updatedAt: new Date().toISOString() }); } catch (e) {}
    
    setAssembledResults([]);
  };

  const handleSaveArchiveDirectly = async (text) => {
    setArchiveText(text);
    const updated = { ...studentRecords, [selectedStudentNum]: text };
    setStudentRecords(updated);
    const key = `${userId}_${grade}_${classNum}`;
    localStorage.setItem(`records_${key}`, JSON.stringify(updated));
    try { await setDoc(doc(db, "homeroom_records", key), { userId, grade, classNum, records: updated, updatedAt: new Date().toISOString() }); } catch (e) {}
  };

  const handleCopyArchive = async () => {
    if (!archiveText.trim()) return;
    await navigator.clipboard.writeText(archiveText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Custom Preset Handlers
  const handleSavePreset = async () => {
    if (!presetInputText.trim()) return alert("추가할 내용을 입력해주세요.");
    try {
      const docRef = doc(db, "shared_records_presets", "global_presets");
      const snap = await getDoc(docRef);
      let data = snap.exists() && snap.data().presets ? snap.data().presets : {};

      if (presetType === 'category') {
        if (!presetNewCategory.trim()) return alert("새 카테고리 이름을 입력하세요.");
        const newKey = `custom_${Date.now()}`;
        data[newKey] = { category: presetNewCategory.trim(), situations: [presetInputText.trim()], actions: [], outcomes: [] };
      } else {
        const catKey = presetTargetCat || Object.keys(data)[0];
        if (!data[catKey]) data[catKey] = { category: catKey, situations: [], actions: [], outcomes: [] };
        if (presetType === 'situation') data[catKey].situations.push(presetInputText.trim());
        if (presetType === 'action') data[catKey].actions.push(presetInputText.trim());
      }

      await setDoc(docRef, { presets: data, updatedAt: new Date().toISOString() });
      setBehaviorPresets(data);
      setIsPresetModalOpen(false);
      setPresetInputText(""); setPresetNewCategory("");
      alert("✅ 공용 데이터베이스에 추가되었습니다.");
    } catch (e) { alert("저장 오류"); }
  };

  const handleDeletePreset = async (catKey, type, text) => {
    if (!confirm("이 문구를 정말 삭제하시겠습니까?")) return;
    try {
      const docRef = doc(db, "shared_records_presets", "global_presets");
      const snap = await getDoc(docRef);
      let data = snap.data().presets;
      data[catKey][type] = data[catKey][type].filter(t => t !== text);
      await setDoc(docRef, { presets: data, updatedAt: new Date().toISOString() });
      setBehaviorPresets(data);
    } catch (e) {}
  };

  const studentList = contacts.length > 0 ? contacts : Array.from({ length: 30 }, (_, i) => ({ num: i + 1, name: `${i + 1}번 학생` }));
  const currentCategory = behaviorPresets[selectedCategoryKey] || { situations: [], actions: [] };
  const currentStudentName = studentList.find(s => s.num === selectedStudentNum)?.name || "";
  const archiveBytes = NEIS_RULES.calculateBytes(archiveText);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#666666] pb-4">
        <div>
          <span className="text-[11px] font-mono text-purple-400 uppercase tracking-widest block mb-0.5">
            // RECORD ASSEMBLY ENGINE
          </span>
          <h3 className="text-[22px] font-normal tracking-tight text-white">
            {grade}학년 {classNum}반 행발 / 세특 문장 조립기
          </h3>
        </div>
        <div className="flex gap-2 p-1 bg-[#333333] rounded-xl border border-[#666666]">
          <button onClick={() => setActiveInnerTab("engine")} className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-all ${activeInnerTab === "engine" ? "bg-white text-purple-600 shadow-sm" : "text-[#A0A0A0] hover:text-white"}`}>조립 엔진</button>
          <button onClick={() => setActiveInnerTab("archive")} className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-all ${activeInnerTab === "archive" ? "bg-white text-purple-600 shadow-sm" : "text-[#A0A0A0] hover:text-white"}`}>누적 보관함</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 명렬표 */}
        <div className="lg:col-span-3 border border-[#666666] bg-[#444444] rounded-3xl p-4 shadow-sm space-y-2 max-h-[720px] overflow-y-auto">
          <span className="block text-[11px] font-mono text-[#A0A0A0] uppercase tracking-wider px-2 mb-2">STUDENT LIST</span>
          {studentList.map((s) => {
            const hasRecord = !!studentRecords[s.num]?.trim();
            const isSelected = selectedStudentNum === s.num;
            return (
              <button key={s.num} onClick={() => setSelectedStudentNum(s.num)} className={`w-full flex items-center justify-between p-2.5 rounded-2xl text-[13px] font-medium transition-all ${isSelected ? "bg-purple-500 text-white shadow-sm" : "hover:bg-[#555555] text-[#E0E0E0]"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isSelected ? "bg-white/20" : "bg-[#333333] text-[#A0A0A0]"}`}>{s.num}번</span>
                  <span>{s.name}</span>
                </div>
                {hasRecord && <Check className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-emerald-400"}`} />}
              </button>
            );
          })}
        </div>

        {/* 메인 뷰 */}
        <div className="lg:col-span-9 space-y-6">
          {activeInnerTab === "engine" ? (
            // 조립 엔진 뷰
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 셀렉터 영역 */}
              <div className="border border-[#666666] bg-[#444444] rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-[#666666] pb-3">
                  <h4 className="text-[17px] font-medium text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400"/> 문장 0초 조립기</h4>
                  <button onClick={() => { setPresetTargetCat(selectedCategoryKey); setIsPresetModalOpen(true); }} className="text-[12px] text-[#A0A0A0] hover:text-white flex items-center gap-1"><Database className="w-3.5 h-3.5"/> 프리셋 관리</button>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">CATEGORY</label>
                  <select value={selectedCategoryKey} onChange={(e) => { setSelectedCategoryKey(e.target.value); setSelectedSituation(""); setSelectedAction(""); }} className="w-full bg-[#333333] border border-[#666666] text-[#E0E0E0] rounded-xl p-2.5 text-[13px] outline-none focus:border-purple-400">
                    {Object.keys(behaviorPresets || {}).map((key) => <option key={key} value={key}>{behaviorPresets[key].category}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">1. 관찰 상황 (SITUATION)</label>
                  <select value={selectedSituation} onChange={(e) => setSelectedSituation(e.target.value)} className="w-full bg-[#333333] border border-[#666666] text-[#E0E0E0] rounded-xl p-2.5 text-[13px] outline-none focus:border-purple-400">
                    <option value="">(상황 생략)</option>
                    {currentCategory?.situations?.map((sit, i) => <option key={i} value={sit}>{sit}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">2. 구체적 행동 (ACTION)</label>
                  <select value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)} className="w-full bg-[#333333] border border-[#666666] text-[#E0E0E0] rounded-xl p-2.5 text-[13px] outline-none focus:border-purple-400">
                    <option value="">-- 행동 선택 --</option>
                    {currentCategory?.actions?.map((act, i) => <option key={i} value={act}>{act}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">3. 맺음말 (ENDING)</label>
                  <select value={selectedStyleId} onChange={(e) => setSelectedStyleId(e.target.value)} className="w-full bg-[#333333] border border-[#666666] text-[#E0E0E0] rounded-xl p-2.5 text-[13px] outline-none focus:border-purple-400">
                    {DEFAULT_STYLES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </div>
                <button onClick={handleAssemble} className="w-full py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-[13px] transition-all flex justify-center gap-1.5 mt-2"><Type className="w-4 h-4" /> 문장 생성하기</button>
              </div>

              {/* 생성 결과 영역 */}
              <div className="border border-[#666666] bg-[#333333] rounded-3xl p-6 shadow-sm">
                <span className="text-[11px] font-mono text-[#A0A0A0] uppercase tracking-wider block mb-3">ASSEMBLY RESULT</span>
                {assembledResults.length === 0 ? (
                  <div className="py-20 text-center text-[#888888] text-[12px] border border-dashed border-[#666666] rounded-2xl">좌측 조립기에서 문장을 생성하세요.</div>
                ) : (
                  assembledResults.map(res => (
                    <div key={res.id} className="p-4 bg-[#444444] border border-[#666666] rounded-2xl relative">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[11px] font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full">{res.style}</span>
                        <span className={`text-[11px] font-mono ${res.isValid ? 'text-emerald-400' : 'text-rose-400'}`}>{res.bytes} / 1500 Byte</span>
                      </div>
                      <p className="text-[14px] text-white leading-relaxed mb-4 break-keep">
                        <span className="font-bold text-purple-300">[{res.studentName}]</span> {res.sentence}
                      </p>
                      <div className="flex justify-end pt-3 border-t border-[#666666]">
                        <button onClick={() => handleAddToArchive(res.sentence)} className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-4 py-2 rounded-xl text-[12px] flex items-center gap-1.5 transition-colors"><Plus className="w-3.5 h-3.5" /> 누적 기록에 추가</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            // 누적 보관함 뷰
            <div className="border border-[#666666] bg-[#444444] rounded-3xl p-6 shadow-sm flex flex-col h-[720px]">
              <div className="flex justify-between items-center border-b border-[#666666] pb-4 mb-4">
                <h4 className="text-[18px] font-medium text-white"><span className="text-purple-400 font-bold">[{currentStudentName}]</span> 누적 기록 보관함</h4>
                <div className="text-[12px] font-mono bg-[#333333] px-3 py-1.5 rounded-full border border-[#666666]">
                  <span className={archiveBytes > 1500 ? "text-rose-400" : "text-emerald-400"}>{archiveBytes}</span><span className="text-[#A0A0A0]"> / 1500 Byte</span>
                </div>
              </div>
              <textarea value={archiveText} onChange={(e) => handleSaveArchiveDirectly(e.target.value)} className="flex-1 w-full bg-[#333333] border border-[#666666] rounded-2xl p-5 text-[14px] text-[#E0E0E0] outline-none focus:border-purple-400 resize-none" placeholder="누적된 기록이 없습니다..." />
              <div className="flex justify-between items-center pt-4 border-t border-[#666666] mt-4">
                <button onClick={() => { if(confirm("초기화하시겠습니까?")) handleSaveArchiveDirectly(""); }} className="text-[#888888] hover:text-rose-400 text-[12px] flex gap-1"><Trash2 className="w-3.5 h-3.5"/> 지우기</button>
                <button onClick={handleCopyArchive} className={`flex items-center gap-1.5 px-6 py-2.5 rounded-full text-[13px] font-bold ${copySuccess ? "bg-emerald-500 text-black" : "bg-white text-black hover:bg-neutral-200"}`}>{copySuccess ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>} 복사하기</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 프리셋 관리 모달 */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#444444] rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-[#666666]">
            <div className="flex justify-between items-center border-b border-[#666666] pb-3 mb-4">
              <h4 className="text-[18px] text-white font-medium">프리셋 DB 관리</h4>
              <div className="flex gap-2">
                <button onClick={() => setPresetModalTab("add")} className={`text-[12px] px-3 py-1.5 rounded-lg font-bold ${presetModalTab === "add" ? "bg-purple-500 text-white" : "bg-[#333333] text-[#A0A0A0]"}`}>추가</button>
                <button onClick={() => setPresetModalTab("manage")} className={`text-[12px] px-3 py-1.5 rounded-lg font-bold ${presetModalTab === "manage" ? "bg-purple-500 text-white" : "bg-[#333333] text-[#A0A0A0]"}`}>목록/삭제</button>
              </div>
            </div>
            
            {presetModalTab === "add" ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button onClick={() => setPresetType("category")} className={`flex-1 py-2 text-[12px] rounded-xl border ${presetType === "category" ? "bg-purple-500/20 border-purple-400 text-purple-300" : "border-[#666666] text-[#A0A0A0]"}`}>카테고리 생성</button>
                  <button onClick={() => setPresetType("situation")} className={`flex-1 py-2 text-[12px] rounded-xl border ${presetType === "situation" ? "bg-purple-500/20 border-purple-400 text-purple-300" : "border-[#666666] text-[#A0A0A0]"}`}>상황 추가</button>
                  <button onClick={() => setPresetType("action")} className={`flex-1 py-2 text-[12px] rounded-xl border ${presetType === "action" ? "bg-purple-500/20 border-purple-400 text-purple-300" : "border-[#666666] text-[#A0A0A0]"}`}>행동 추가</button>
                </div>
                {presetType !== "category" ? (
                  <select value={presetTargetCat} onChange={(e) => setPresetTargetCat(e.target.value)} className="w-full bg-[#333333] border border-[#666666] text-white rounded-xl p-2.5 text-[12px]">
                    {Object.keys(behaviorPresets).map(k => <option key={k} value={k}>{behaviorPresets[k].category}</option>)}
                  </select>
                ) : (
                  <input type="text" placeholder="새 카테고리 이름" value={presetNewCategory} onChange={(e) => setPresetNewCategory(e.target.value)} className="w-full bg-[#333333] border border-[#666666] text-white rounded-xl p-2.5 text-[12px] outline-none" />
                )}
                <input type="text" placeholder="추가할 문구 입력" value={presetInputText} onChange={(e) => setPresetInputText(e.target.value)} className="w-full bg-[#333333] border border-[#666666] text-white rounded-xl p-2.5 text-[12px] outline-none" />
                <button onClick={handleSavePreset} className="w-full py-2.5 bg-white text-black font-bold rounded-xl text-[13px]">저장하기</button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                <div className="flex gap-2">
                  <select value={presetTargetCat} onChange={(e) => setPresetTargetCat(e.target.value)} className="w-1/2 bg-[#333333] border border-[#666666] text-white rounded-xl p-2 text-[12px]">
                    {Object.keys(behaviorPresets).map(k => <option key={k} value={k}>{behaviorPresets[k].category}</option>)}
                  </select>
                  <select value={presetType} onChange={(e) => setPresetType(e.target.value)} className="w-1/2 bg-[#333333] border border-[#666666] text-white rounded-xl p-2 text-[12px]">
                    <option value="situations">상황 문구</option><option value="actions">행동 문구</option>
                  </select>
                </div>
                {behaviorPresets[presetTargetCat]?.[presetType]?.map((txt, i) => (
                  <div key={i} className="flex justify-between items-center bg-[#333333] p-2.5 rounded-xl border border-[#666666]">
                    <span className="text-[12px] text-[#E0E0E0] truncate pr-2">{txt}</span>
                    <button onClick={() => handleDeletePreset(presetTargetCat, presetType, txt)} className="text-rose-400 hover:text-rose-300 text-[11px] shrink-0">삭제</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-4 mt-4 border-t border-[#666666]"><button onClick={() => setIsPresetModalOpen(false)} className="text-[12px] text-[#A0A0A0]">닫기</button></div>
          </div>
        </div>
      )}
    </div>
  );
}