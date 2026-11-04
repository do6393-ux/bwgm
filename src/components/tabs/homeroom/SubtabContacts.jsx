import React, { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { saveLocal } from "@/lib/syncedStorage";
import { Phone, UserPlus, ClipboardPaste, X } from "lucide-react";

function parseBulkStudentText(rawText) {
  if (!rawText || !rawText.trim()) return [];
  const cleanText = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const headerKeywords = ["성명", "학생명", "전화번호", "핸드폰", "보호자", "학부모", "집전화", "연락처", "비고"];
  const extractStdPhones = (str) => {
    const matches = str.match(/01[0-9][-\s\.]?[0-9]{3,4}[-\s\.]?[0-9]{4}/g) || [];
    return matches.map((p) => {
      const digits = p.replace(/\D/g, "");
      if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
      if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      return p;
    });
  };

  const rowParsed = [];
  lines.forEach((line, idx) => {
    if (headerKeywords.some((k) => line.includes(k)) && idx <= 1) return;
    let tokens = [];
    if (line.includes("\t")) tokens = line.split("\t").map((t) => t.trim()).filter(Boolean);
    else if (line.includes(",")) tokens = line.split(",").map((t) => t.trim()).filter(Boolean);
    else tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);

    if (tokens.length >= 2) {
      let num = null; let name = "";
      const numMatch0 = tokens[0].match(/\d+/); const numMatch1 = tokens[1].match(/\d+/);
      if (numMatch0 && tokens[0].length <= 5) { num = parseInt(numMatch0[0], 10); name = tokens[1]; } 
      else if (numMatch1 && tokens[1].length <= 5) { name = tokens[0]; num = parseInt(numMatch1[0], 10); } 
      else { num = idx + 1; name = tokens[0]; }

      name = name.replace(/[^가-힣a-zA-Z0-9]/g, "");
      if (!name) return;
      const phones = extractStdPhones(line);
      rowParsed.push({
        id: `st_${Date.now()}_${idx}`, num: num, name: name,
        phone: phones[0] || "", parentPhone: phones[1] || "", parent2Phone: phones[2] || "",
      });
    }
  });
  if (rowParsed.length > 0) return rowParsed;

  const allTokens = [];
  lines.forEach((l) => {
    const parts = l.split(/[\t,]+|\s{2,}/).map((t) => t.trim()).filter(Boolean);
    allTokens.push(...parts);
  });

  const streamParsed = [];
  let i = 0;
  while (i < allTokens.length) {
    const tok = allTokens[i];
    if (headerKeywords.some((k) => tok.includes(k))) { i++; continue; }
    if (/^\d{1,4}$/.test(tok)) {
      const num = parseInt(tok, 10);
      if (i + 1 < allTokens.length) {
        const name = allTokens[i + 1].replace(/[^가-힣a-zA-Z0-9]/g, "");
        i += 2;
        const phones = [];
        while (i < allTokens.length && !/^\d{1,4}$/.test(allTokens[i])) {
          const found = extractStdPhones(allTokens[i]);
          if (found.length > 0) phones.push(...found);
          i++;
        }
        if (name) {
          streamParsed.push({
            id: `st_${Date.now()}_${streamParsed.length}`, num: num, name: name,
            phone: phones[0] || "", parentPhone: phones[1] || "", parent2Phone: phones[2] || "",
          });
        }
        continue;
      }
    }
    i++;
  }
  return streamParsed;
}

export default function SubtabContacts({ userId, grade, classNum, contacts, currentUser, onContactsUpdated }) {
  const [selectedContact, setSelectedContact] = useState(null);
  const [editingContact, setEditingContact] = useState(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [form, setForm] = useState({ num: "", name: "", phone: "", parentPhone: "", parent2Phone: "" });

  const persistContacts = async (updatedList) => {
    updatedList.sort((a, b) => a.num - b.num);
    const key = `${userId}_${grade}_${classNum}`;
    const updatedAt = saveLocal(`contacts_${key}`, updatedList);
    try {
      await setDoc(doc(db, "homeroom_contacts", key), { userId, grade, classNum, list: updatedList, updatedAt });
    } catch (e) { console.error(e); }
    onContactsUpdated();
  };

  const handleOpenAddModal = () => {
    setEditingContact("new");
    setForm({ num: contacts.length + 1, name: "", phone: "", parentPhone: "", parent2Phone: "" });
  };

  const handleOpenEditModal = (c) => {
    setSelectedContact(null); setEditingContact(c.id);
    setForm({ num: c.num, name: c.name, phone: c.phone || "", parentPhone: c.parentPhone || "", parent2Phone: c.parent2Phone || "" });
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("학생 이름을 입력해주세요.");
    let updated = [...contacts];
    if (editingContact === "new") {
      updated.push({ id: `st_${Date.now()}`, num: Number(form.num) || updated.length + 1, name: form.name.trim(), phone: form.phone.trim(), parentPhone: form.parentPhone.trim(), parent2Phone: form.parent2Phone.trim() });
    } else {
      const idx = updated.findIndex((c) => c.id === editingContact);
      if (idx !== -1) updated[idx] = { ...updated[idx], num: Number(form.num), name: form.name.trim(), phone: form.phone.trim(), parentPhone: form.parentPhone.trim(), parent2Phone: form.parent2Phone.trim() };
    }
    await persistContacts(updated);
    setEditingContact(null);
  };

  const handleDeleteContact = async (id) => {
    if (!confirm("해당 학생 연락처를 삭제하시겠습니까?")) return;
    const updated = contacts.filter((c) => c.id !== id);
    await persistContacts(updated);
    setSelectedContact(null); setEditingContact(null);
  };

  const handleSaveBulk = async () => {
    if (!bulkText.trim()) return alert("데이터를 입력해주세요.");
    const parsed = parseBulkStudentText(bulkText);
    if (parsed.length === 0) return alert("유효한 데이터를 찾지 못했습니다.");
    await persistContacts(parsed);
    setIsBulkModalOpen(false); setBulkText("");
    alert(`총 ${parsed.length}명 DB 등록 완료.`);
  };

  const handleDeleteAll = async () => {
    if (!confirm("모든 학생 연락처를 삭제하시겠습니까?")) return;
    await persistContacts([]);
  };

  return (
    <div className="space-y-6 text-[#F5F5F5]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#666666] pb-4">
        <div>
          <span className="text-[11px] font-mono text-rose-400 uppercase tracking-widest block mb-0.5">
            // TELEPHONY DIRECTORY
          </span>
          <h3 className="text-[22px] font-normal tracking-tight text-white">{grade}학년 {classNum}반 비상연락망</h3>
        </div>

        {currentUser && (
          <div className="flex items-center gap-2">
            <button onClick={handleDeleteAll} className="px-4 py-2 rounded-full text-[12px] font-medium bg-[#333333] border border-[#666666] hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-400 text-[#E0E0E0] transition-colors">
              전체 초기화
            </button>
            <button onClick={() => setIsBulkModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium bg-[#333333] border border-[#666666] hover:bg-[#555555] text-[#E0E0E0] transition-colors">
              <ClipboardPaste className="w-3.5 h-3.5" /><span>명렬표 붙여넣기</span>
            </button>
            <button onClick={handleOpenAddModal} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold bg-white text-black hover:bg-neutral-200 transition-colors">
              <UserPlus className="w-3.5 h-3.5" /><span>개별 추가</span>
            </button>
          </div>
        )}
      </div>

      {/* 🎯 모바일 4열(grid-cols-4) 강제 적용 및 간격 조절 */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 sm:gap-3">
        {contacts.length === 0 ? (
          <div className="col-span-full py-20 text-center font-mono text-[#A0A0A0] text-sm border border-dashed border-[#666666] rounded-3xl bg-[#444444]">
            등록된 연락처가 없습니다. 명렬표 일괄 붙여넣기로 추가하세요.
          </div>
        ) : (
          contacts.map((c) => (
            <div key={c.id} onClick={() => setSelectedContact(c)} className="group flex flex-col items-center justify-center p-2 sm:p-3.5 bg-[#444444] border border-[#666666] hover:border-rose-400 rounded-xl sm:rounded-2xl shadow-sm transition-all cursor-pointer text-center">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-rose-300 bg-rose-500/20 px-1.5 sm:px-2 py-0.5 rounded-full mb-1">{c.num}번</span>
              <span className="text-[12px] sm:text-[14px] font-medium text-white group-hover:text-rose-300 transition-colors w-full whitespace-nowrap overflow-hidden text-ellipsis">{c.name}</span>
            </div>
          ))
        )}
      </div>

      {selectedContact && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#444444] rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-[#666666]">
            <div className="flex justify-between items-center border-b border-[#666666] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full">{selectedContact.num}번</span>
                <h4 className="text-[18px] font-medium text-white">{selectedContact.name}</h4>
              </div>
              <button onClick={() => setSelectedContact(null)} className="text-[#A0A0A0] hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-2.5">
              <a href={selectedContact.phone ? `tel:${selectedContact.phone}` : undefined} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${selectedContact.phone ? "bg-sky-500/10 border-sky-400/30 text-sky-300 hover:bg-sky-500/20" : "bg-[#333333] border-[#555555] text-[#888888] pointer-events-none"}`}>
                <div className="flex items-center gap-2"><Phone className="w-4 h-4" /><span className="text-[13px] font-medium">학생 본인</span></div>
                <span className="text-[12px] font-mono">{selectedContact.phone || "번호 없음"}</span>
              </a>
              <a href={selectedContact.parentPhone ? `tel:${selectedContact.parentPhone}` : undefined} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${selectedContact.parentPhone ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/20" : "bg-[#333333] border-[#555555] text-[#888888] pointer-events-none"}`}>
                <div className="flex items-center gap-2"><Phone className="w-4 h-4" /><span className="text-[13px] font-medium">보호자 1</span></div>
                <span className="text-[12px] font-mono">{selectedContact.parentPhone || "번호 없음"}</span>
              </a>
              <a href={selectedContact.parent2Phone ? `tel:${selectedContact.parent2Phone}` : undefined} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${selectedContact.parent2Phone ? "bg-amber-500/10 border-amber-400/30 text-amber-300 hover:bg-amber-500/20" : "bg-[#333333] border-[#555555] text-[#888888] pointer-events-none"}`}>
                <div className="flex items-center gap-2"><Phone className="w-4 h-4" /><span className="text-[13px] font-medium">보호자 2</span></div>
                <span className="text-[12px] font-mono">{selectedContact.parent2Phone || "번호 없음"}</span>
              </a>
            </div>

            {currentUser && (
              <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-[#666666] text-[12px] font-mono">
                <button onClick={() => handleOpenEditModal(selectedContact)} className="text-[#A0A0A0] hover:text-white">[ 수정 ]</button>
                <button onClick={() => handleDeleteContact(selectedContact.id)} className="text-rose-400 hover:text-rose-300">[ 삭제 ]</button>
              </div>
            )}
          </div>
        </div>
      )}

      {editingContact && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveContact} className="bg-[#444444] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#666666] space-y-4">
            <h4 className="text-[20px] font-normal tracking-tight text-white border-b border-[#666666] pb-3">
              {editingContact === "new" ? "학생 연락처 추가" : "학생 연락처 수정"}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">출석 번호</label>
                <input type="number" value={form.num} onChange={(e) => setForm({ ...form, num: e.target.value })} className="w-full bg-[#333333] border border-[#666666] text-white rounded-xl p-2.5 text-[14px] outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">학생 이름</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-[#333333] border border-[#666666] text-white rounded-xl p-2.5 text-[14px] outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">학생 본인 휴대전화</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-[#333333] border border-[#666666] text-white rounded-xl p-2.5 text-[14px] outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">보호자 1 연락처</label>
              <input type="text" value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} className="w-full bg-[#333333] border border-[#666666] text-white rounded-xl p-2.5 text-[14px] outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#A0A0A0] mb-1">보호자 2 연락처</label>
              <input type="text" value={form.parent2Phone} onChange={(e) => setForm({ ...form, parent2Phone: e.target.value })} className="w-full bg-[#333333] border border-[#666666] text-white rounded-xl p-2.5 text-[14px] outline-none" />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-[#666666]">
              <button type="button" onClick={() => setEditingContact(null)} className="px-4 py-2 text-[13px] text-[#A0A0A0]">취소</button>
              <button type="submit" className="bg-white text-black px-5 py-2 rounded-full font-bold text-[13px]">저장하기</button>
            </div>
          </form>
        </div>
      )}

      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#444444] rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-[#666666] space-y-4">
            <div>
              <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-widest block mb-0.5">// BULK STREAM INGESTION</span>
              <h4 className="text-[20px] font-normal tracking-tight text-white">엑셀 / 한글 명렬표 일괄 등록</h4>
              <p className="text-[12px] text-[#A0A0A0] mt-1">엑셀이나 나이스에서 복사한 학생 번호, 이름, 연락처 표를 아래 영역에 붙여넣으세요.</p>
            </div>
            <textarea rows={9} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="1  강하늘  010-1234-5678&#10;2  김민지  010-2345-6789" className="w-full bg-[#333333] border border-[#666666] text-[#E0E0E0] rounded-2xl p-3.5 text-[13px] font-mono outline-none" />
            <div className="flex justify-end gap-3 pt-2 border-t border-[#666666]">
              <button type="button" onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 text-[13px] text-[#A0A0A0]">취소</button>
              <button onClick={handleSaveBulk} className="bg-emerald-500 text-black px-5 py-2 rounded-full font-bold text-[13px] shadow-[0_0_10px_rgba(16,185,129,0.3)]">파싱 및 동기화</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}