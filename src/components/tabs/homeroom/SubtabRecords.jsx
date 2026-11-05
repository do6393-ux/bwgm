import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { loadSynced, saveLocal } from "@/lib/syncedStorage";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Copy, Check, Sparkles, Trash2, Plus, Type, Database } from "lucide-react";
import { DEFAULT_STYLES } from "./defaultPresets";
import { useDialog } from "@/components/ui/dialogContext";

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

export default function SubtabRecords({ userId, grade, classNum, contacts }) {
  const { confirm, toast } = useDialog();
  const [activeInnerTab, setActiveInnerTab] = useState("engine"); // engine | archive
  const [selectedStudentNum, setSelectedStudentNum] = useState(1);
  const [studentRecords, setStudentRecords] = useState({});
  // 누적 보관함의 글은 학생별 기록에서 바로 가져온다 (따로 상태를 두지 않는다)
  const archiveText = studentRecords[selectedStudentNum] || "";

  const [behaviorPresets, setBehaviorPresets] = useState({});
  const [selectedCategoryKey, setSelectedCategoryKey] = useState("");
  const [selectedSituation, setSelectedSituation] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState("none");
  const [assembledResults, setAssembledResults] = useState([]); 

  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presetModalTab, setPresetModalTab] = useState("add"); // add | manage
  const [presetType, setPresetType] = useState("situation"); // "추가" 탭: category | situation | action
  const [manageType, setManageType] = useState("situations"); // "목록/삭제" 탭: situations | actions (추가 탭과 값이 달라서 따로 둔다)
  const [presetInputText, setPresetInputText] = useState("");
  const [presetNewCategory, setPresetNewCategory] = useState("");
  const [presetTargetCat, setPresetTargetCat] = useState("");

  const [copySuccess, setCopySuccess] = useState(false);

  const recordsKey = `${userId}_${grade}_${classNum}`;

  // 공용 프리셋은 처음 한 번만 불러온다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shared_records_presets", "global_presets"));
        if (cancelled || !snap.exists() || !snap.data().presets) return;
        const presets = snap.data().presets;
        setBehaviorPresets(presets);
        setSelectedCategoryKey((prev) => prev || Object.keys(presets)[0]);
      } catch (e) { console.error("Global Preset Load Error:", e); }
    })();
    return () => { cancelled = true; };
  }, []);

  // 누적 기록은 Firestore 를 기준으로 불러온다 (다른 기기에서 고친 내용이 반영되도록).
  // 학생 번호를 바꿀 때마다 다시 불러오지 않고, 학급이 바뀔 때만 불러온다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadSynced(`records_${recordsKey}`, doc(db, "homeroom_records", recordsKey), (d) => d.records);
      if (!cancelled) setStudentRecords(loaded || {});
    })();
    return () => { cancelled = true; };
  }, [recordsKey]);

  // 누적 기록 저장: 이 기기(localStorage)에는 바로, Firestore 에는 입력이 멈춘 뒤 한 번만 쓴다.
  // (예전에는 타자 한 글자마다 Firestore 에 썼다)
  const pendingSaveRef = useRef(null); // { key, payload }
  const saveTimerRef = useRef(null);

  const flushRecordsSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    setDoc(doc(db, "homeroom_records", pending.key), pending.payload).catch((e) => console.error("Records save error:", e));
  }, []);

  const queueRecordsSave = useCallback((records, immediate = false) => {
    const updatedAt = saveLocal(`records_${recordsKey}`, records);
    pendingSaveRef.current = { key: recordsKey, payload: { userId, grade, classNum, records, updatedAt } };
    clearTimeout(saveTimerRef.current);
    if (immediate) flushRecordsSave();
    else saveTimerRef.current = setTimeout(flushRecordsSave, 1000);
  }, [recordsKey, userId, grade, classNum, flushRecordsSave]);

  // 학급을 바꾸거나 화면을 떠날 때, 탭이 가려질 때 밀린 저장을 바로 마친다.
  useEffect(() => flushRecordsSave, [recordsKey, flushRecordsSave]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flushRecordsSave(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [flushRecordsSave]);


  const handleAssemble = () => {
    if (!selectedAction) return toast("구체적 행동/변화를 먼저 선택해 주세요.", "info");
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

    queueRecordsSave(updated, true); // 버튼으로 추가하는 경우는 바로 저장
    
    setAssembledResults([]);
  };

  const handleSaveArchiveDirectly = async (text) => {
    const updated = { ...studentRecords, [selectedStudentNum]: text };
    setStudentRecords(updated);
    queueRecordsSave(updated); // 입력이 멈춘 뒤 Firestore 에 저장
  };

  const handleCopyArchive = async () => {
    if (!archiveText.trim()) return;
    await navigator.clipboard.writeText(archiveText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // 프리셋을 넣거나 지울 대상 카테고리. 아직 고르지 않았거나(빈 값) 사라진 카테고리면 첫 번째를 기본으로 쓴다.
  const activeTargetCat = behaviorPresets[presetTargetCat] ? presetTargetCat : (Object.keys(behaviorPresets)[0] || "");

  // Custom Preset Handlers
  const handleSavePreset = async () => {
    if (!presetInputText.trim()) return toast("추가할 내용을 입력해 주세요.", "info");
    try {
      const docRef = doc(db, "shared_records_presets", "global_presets");
      const snap = await getDoc(docRef);
      let data = snap.exists() && snap.data().presets ? snap.data().presets : {};

      if (presetType === 'category') {
        if (!presetNewCategory.trim()) return toast("새 카테고리 이름을 입력해 주세요.", "info");
        const newKey = `custom_${Date.now()}`;
        data[newKey] = { category: presetNewCategory.trim(), situations: [presetInputText.trim()], actions: [], outcomes: [] };
      } else {
        const catKey = activeTargetCat || Object.keys(data)[0];
        if (!catKey) return toast("먼저 카테고리를 만들어 주세요.", "info");
        if (!data[catKey]) data[catKey] = { category: catKey, situations: [], actions: [], outcomes: [] };
        if (presetType === 'situation') data[catKey].situations.push(presetInputText.trim());
        if (presetType === 'action') data[catKey].actions.push(presetInputText.trim());
      }

      await setDoc(docRef, { presets: data, updatedAt: new Date().toISOString() });
      setBehaviorPresets(data);
      setIsPresetModalOpen(false);
      setPresetInputText(""); setPresetNewCategory("");
      toast("공용 문구에 추가했습니다.", "success");
    } catch (e) { console.error("Preset save error:", e); toast("저장하지 못했습니다. 연결을 확인해 주세요.", "error"); }
  };

  const handleDeletePreset = async (catKey, type, text) => {
    if (!(await confirm("이 문구를 삭제하시겠습니까?\n모든 교사가 함께 쓰는 공용 문구입니다.", { danger: true, confirmText: "삭제" }))) return;
    try {
      const docRef = doc(db, "shared_records_presets", "global_presets");
      const snap = await getDoc(docRef);
      let data = snap.data().presets;
      data[catKey][type] = data[catKey][type].filter(t => t !== text);
      await setDoc(docRef, { presets: data, updatedAt: new Date().toISOString() });
      setBehaviorPresets(data);
      toast("삭제했습니다.", "success");
    } catch (e) { console.error("Preset delete error:", e); toast("삭제하지 못했습니다. 연결을 확인해 주세요.", "error"); }
  };

  const studentList = contacts.length > 0 ? contacts : Array.from({ length: 30 }, (_, i) => ({ num: i + 1, name: `${i + 1}번 학생` }));
  const currentCategory = behaviorPresets[selectedCategoryKey] || { situations: [], actions: [] };
  const currentStudentName = studentList.find(s => s.num === selectedStudentNum)?.name || "";
  const archiveBytes = NEIS_RULES.calculateBytes(archiveText);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-line pb-4">
        <div>
          <span className="text-[11px] font-mono text-purple-400 uppercase tracking-widest block mb-0.5">
            // RECORD ASSEMBLY ENGINE
          </span>
          <h3 className="text-[22px] font-normal tracking-tight text-white">
            {grade}학년 {classNum}반 행발 / 세특 문장 조립기
          </h3>
        </div>
        <div className="flex gap-2 p-1 bg-well rounded-field border border-line">
          <button onClick={() => { setActiveInnerTab("engine"); setAssembledResults([]); }} className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-all ${activeInnerTab === "engine" ? "bg-white text-purple-600 shadow-sm" : "text-ink-muted hover:text-white"}`}>조립 엔진</button>
          <button onClick={() => setActiveInnerTab("archive")} className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-all ${activeInnerTab === "archive" ? "bg-white text-purple-600 shadow-sm" : "text-ink-muted hover:text-white"}`}>누적 보관함</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 명렬표 */}
        <div className="lg:col-span-3 border border-line bg-surface rounded-card p-4 shadow-sm space-y-2 max-h-[720px] overflow-y-auto">
          <span className="block text-[11px] font-mono text-ink-muted uppercase tracking-wider px-2 mb-2">STUDENT LIST</span>
          {studentList.map((s) => {
            const hasRecord = !!studentRecords[s.num]?.trim();
            const isSelected = selectedStudentNum === s.num;
            return (
              <button key={s.num} onClick={() => { setSelectedStudentNum(s.num); setAssembledResults([]); }} className={`w-full flex items-center justify-between p-2.5 rounded-panel text-[13px] font-medium transition-all ${isSelected ? "bg-purple-500 text-white shadow-sm" : "hover:bg-raised text-ink"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isSelected ? "bg-white/20" : "bg-well text-ink-muted"}`}>{s.num}번</span>
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
              <div className="border border-line bg-surface rounded-card p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-line pb-3">
                  <h4 className="text-[17px] font-medium text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400"/> 문장 0초 조립기</h4>
                  <button onClick={() => { setPresetTargetCat(selectedCategoryKey); setIsPresetModalOpen(true); }} className="text-[12px] text-ink-muted hover:text-white flex items-center gap-1"><Database className="w-3.5 h-3.5"/> 프리셋 관리</button>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-ink-muted mb-1">CATEGORY</label>
                  <select value={selectedCategoryKey} onChange={(e) => { setSelectedCategoryKey(e.target.value); setSelectedSituation(""); setSelectedAction(""); }} className="w-full bg-well border border-line text-ink rounded-field p-2.5 text-[13px] outline-none focus:border-purple-400">
                    {Object.keys(behaviorPresets || {}).map((key) => <option key={key} value={key}>{behaviorPresets[key].category}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-ink-muted mb-1">1. 관찰 상황 (SITUATION)</label>
                  <select value={selectedSituation} onChange={(e) => setSelectedSituation(e.target.value)} className="w-full bg-well border border-line text-ink rounded-field p-2.5 text-[13px] outline-none focus:border-purple-400">
                    <option value="">(상황 생략)</option>
                    {currentCategory?.situations?.map((sit, i) => <option key={i} value={sit}>{sit}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-ink-muted mb-1">2. 구체적 행동 (ACTION)</label>
                  <select value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)} className="w-full bg-well border border-line text-ink rounded-field p-2.5 text-[13px] outline-none focus:border-purple-400">
                    <option value="">-- 행동 선택 --</option>
                    {currentCategory?.actions?.map((act, i) => <option key={i} value={act}>{act}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-ink-muted mb-1">3. 맺음말 (ENDING)</label>
                  <select value={selectedStyleId} onChange={(e) => setSelectedStyleId(e.target.value)} className="w-full bg-well border border-line text-ink rounded-field p-2.5 text-[13px] outline-none focus:border-purple-400">
                    {DEFAULT_STYLES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </div>
                <button onClick={handleAssemble} className="w-full py-3 rounded-field bg-purple-500 hover:bg-purple-400 text-white font-bold text-[13px] transition-all flex justify-center gap-1.5 mt-2"><Type className="w-4 h-4" /> 문장 생성하기</button>
              </div>

              {/* 생성 결과 영역 */}
              <div className="border border-line bg-well rounded-card p-6 shadow-sm">
                <span className="text-[11px] font-mono text-ink-muted uppercase tracking-wider block mb-3">ASSEMBLY RESULT</span>
                {assembledResults.length === 0 ? (
                  <div className="py-20 text-center text-ink-faint text-[12px] border border-dashed border-line rounded-panel">좌측 조립기에서 문장을 생성하세요.</div>
                ) : (
                  assembledResults.map(res => (
                    <div key={res.id} className="p-4 bg-surface border border-line rounded-panel relative">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[11px] font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full">{res.style}</span>
                        <span className={`text-[11px] font-mono ${res.isValid ? 'text-emerald-400' : 'text-rose-400'}`}>{res.bytes} / 1500 Byte</span>
                      </div>
                      <p className="text-[14px] text-white leading-relaxed mb-4 break-keep">
                        <span className="font-bold text-purple-300">[{res.studentName}]</span> {res.sentence}
                      </p>
                      <div className="flex justify-end pt-3 border-t border-line">
                        <button onClick={() => handleAddToArchive(res.sentence)} className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-4 py-2 rounded-field text-[12px] flex items-center gap-1.5 transition-colors"><Plus className="w-3.5 h-3.5" /> 누적 기록에 추가</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            // 누적 보관함 뷰
            <div className="border border-line bg-surface rounded-card p-6 shadow-sm flex flex-col h-[720px]">
              <div className="flex justify-between items-center border-b border-line pb-4 mb-4">
                <h4 className="text-[18px] font-medium text-white"><span className="text-purple-400 font-bold">[{currentStudentName}]</span> 누적 기록 보관함</h4>
                <div className="text-[12px] font-mono bg-well px-3 py-1.5 rounded-full border border-line">
                  <span className={archiveBytes > 1500 ? "text-rose-400" : "text-emerald-400"}>{archiveBytes}</span><span className="text-ink-muted"> / 1500 Byte</span>
                </div>
              </div>
              <textarea value={archiveText} onChange={(e) => handleSaveArchiveDirectly(e.target.value)} className="flex-1 w-full bg-well border border-line rounded-panel p-5 text-[14px] text-ink outline-none focus:border-purple-400 resize-none" placeholder="누적된 기록이 없습니다..." />
              <div className="flex justify-between items-center pt-4 border-t border-line mt-4">
                <button onClick={async () => { if (await confirm("이 학생의 누적 기록을 모두 지우시겠습니까?", { danger: true, confirmText: "지우기" })) handleSaveArchiveDirectly(""); }} className="text-ink-faint hover:text-rose-400 text-[12px] flex gap-1"><Trash2 className="w-3.5 h-3.5"/> 지우기</button>
                <button onClick={handleCopyArchive} className={`flex items-center gap-1.5 px-6 py-2.5 rounded-full text-[13px] font-bold ${copySuccess ? "bg-emerald-500 text-black" : "bg-white text-black hover:bg-neutral-200"}`}>{copySuccess ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>} 복사하기</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 프리셋 관리 모달 */}
      {isPresetModalOpen && (
        <div className="ui-fade fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-lg w-full shadow-2xl border border-line ui-pop">
            <div className="flex justify-between items-center border-b border-line pb-3 mb-4">
              <h4 className="text-[18px] text-white font-medium">프리셋 DB 관리</h4>
              <div className="flex gap-2">
                <button onClick={() => setPresetModalTab("add")} className={`text-[12px] px-3 py-1.5 rounded-lg font-bold ${presetModalTab === "add" ? "bg-purple-500 text-white" : "bg-well text-ink-muted"}`}>추가</button>
                <button onClick={() => setPresetModalTab("manage")} className={`text-[12px] px-3 py-1.5 rounded-lg font-bold ${presetModalTab === "manage" ? "bg-purple-500 text-white" : "bg-well text-ink-muted"}`}>목록/삭제</button>
              </div>
            </div>
            
            {presetModalTab === "add" ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button onClick={() => setPresetType("category")} className={`flex-1 py-2 text-[12px] rounded-field border ${presetType === "category" ? "bg-purple-500/20 border-purple-400 text-purple-300" : "border-line text-ink-muted"}`}>카테고리 생성</button>
                  <button onClick={() => setPresetType("situation")} className={`flex-1 py-2 text-[12px] rounded-field border ${presetType === "situation" ? "bg-purple-500/20 border-purple-400 text-purple-300" : "border-line text-ink-muted"}`}>상황 추가</button>
                  <button onClick={() => setPresetType("action")} className={`flex-1 py-2 text-[12px] rounded-field border ${presetType === "action" ? "bg-purple-500/20 border-purple-400 text-purple-300" : "border-line text-ink-muted"}`}>행동 추가</button>
                </div>
                {presetType !== "category" ? (
                  <select value={activeTargetCat} onChange={(e) => setPresetTargetCat(e.target.value)} className="w-full bg-well border border-line text-white rounded-field p-2.5 text-[12px]">
                    {Object.keys(behaviorPresets).map(k => <option key={k} value={k}>{behaviorPresets[k].category}</option>)}
                  </select>
                ) : (
                  <input type="text" placeholder="새 카테고리 이름" value={presetNewCategory} onChange={(e) => setPresetNewCategory(e.target.value)} className="w-full bg-well border border-line text-white rounded-field p-2.5 text-[12px] outline-none" />
                )}
                <input type="text" placeholder="추가할 문구 입력" value={presetInputText} onChange={(e) => setPresetInputText(e.target.value)} className="w-full bg-well border border-line text-white rounded-field p-2.5 text-[12px] outline-none" />
                <button onClick={handleSavePreset} className="w-full py-2.5 bg-white text-black font-bold rounded-field text-[13px]">저장하기</button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                <div className="flex gap-2">
                  <select value={activeTargetCat} onChange={(e) => setPresetTargetCat(e.target.value)} className="w-1/2 bg-well border border-line text-white rounded-field p-2 text-[12px]">
                    {Object.keys(behaviorPresets).map(k => <option key={k} value={k}>{behaviorPresets[k].category}</option>)}
                  </select>
                  <select value={manageType} onChange={(e) => setManageType(e.target.value)} className="w-1/2 bg-well border border-line text-white rounded-field p-2 text-[12px]">
                    <option value="situations">상황 문구</option><option value="actions">행동 문구</option>
                  </select>
                </div>
                {behaviorPresets[activeTargetCat]?.[manageType]?.map((txt, i) => (
                  <div key={i} className="flex justify-between items-center bg-well p-2.5 rounded-field border border-line">
                    <span className="text-[12px] text-ink truncate pr-2">{txt}</span>
                    <button onClick={() => handleDeletePreset(activeTargetCat, manageType, txt)} className="text-rose-400 hover:text-rose-300 text-[11px] shrink-0">삭제</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-4 mt-4 border-t border-line"><button onClick={() => setIsPresetModalOpen(false)} className="text-[12px] text-ink-muted">닫기</button></div>
          </div>
        </div>
      )}
    </div>
  );
}