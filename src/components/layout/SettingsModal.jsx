import { useState } from "react";
import { updateProfile } from "firebase/auth";
import { useDialog, toastAfterReload } from "@/components/ui/dialogContext";

// 모달이 열릴 때마다 폼을 새로 만들어서, 열 때 저장된 값으로 입력칸이 채워지게 한다.
export default function SettingsModal({ isOpen, onClose, currentUser }) {
  if (!isOpen) return null;
  return <SettingsForm onClose={onClose} currentUser={currentUser} />;
}

function SettingsForm({ onClose, currentUser }) {
  const { toast } = useDialog();
  const [name, setName] = useState(currentUser?.displayName || "");
  const [grade, setGrade] = useState(() => Number(localStorage.getItem("homeroom_grade")) || 1);
  const [classNum, setClassNum] = useState(() => Number(localStorage.getItem("homeroom_class")) || 7);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (currentUser && name.trim() !== currentUser.displayName) {
        await updateProfile(currentUser, { displayName: name.trim() });
      }
      
      // 🎯 교무실 시간표 조회용 디폴트 교사 이름도 함께 덮어쓰기!
      if (name.trim()) {
        localStorage.setItem("office_teacher_name", name.trim());
      }
      
      localStorage.setItem("homeroom_grade", grade);
      localStorage.setItem("homeroom_class", classNum);
      localStorage.setItem("office_grade", grade);
      localStorage.setItem("office_class", classNum);
      
      // 변경 사항을 화면에 적용하려고 새로고침한다. 안내는 새로고침된 첫 화면에서 보여 준다.
      toastAfterReload("설정을 저장했습니다.");
      window.location.reload();
    } catch (error) {
      console.error("Settings save error:", error);
      toast("설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ui-fade ui-scrim fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-black">
      <div className="bg-white rounded-panel p-8 max-w-sm w-full shadow-2xl border border-black/[0.08] ui-pop">
        <div className="flex justify-between items-center border-b border-black/[0.06] pb-4 mb-6">
          <h3 className="text-[20px] font-bold tracking-tight">System Settings</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-black transition-colors font-bold text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 font-mono">
          <div>
            <label className="block text-[11px] text-neutral-500 mb-1.5 uppercase tracking-widest">Teacher Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-black transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1.5 uppercase tracking-widest">Default Grade</label>
              <select 
                value={grade} 
                onChange={(e) => setGrade(Number(e.target.value))}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-black transition-colors"
              >
                {[1, 2, 3, 4, 5, 6].map(g => (
                  <option key={g} value={g}>{g}학년</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1.5 uppercase tracking-widest">Default Class</label>
              <select 
                value={classNum} 
                onChange={(e) => setClassNum(Number(e.target.value))}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-black transition-colors"
              >
                {Array.from({ length: 15 }, (_, i) => i + 1).map(c => (
                  <option key={c} value={c}>{c}반</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-black/[0.06] mt-2">
            <button 
              type="submit" 
              disabled={isSaving}
              className={`w-full bg-black hover:bg-neutral-800 text-white font-bold py-3.5 rounded-full text-[14px] transition-all active:scale-95 disabled:opacity-50`}
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}