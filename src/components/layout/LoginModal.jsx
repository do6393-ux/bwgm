import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useDialog } from "@/components/ui/dialogContext";

export default function LoginModal({ isOpen, onClose }) {
  const { toast } = useDialog();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!isOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
      onClose();
    } catch {
      toast("로그인하지 못했습니다. 이메일과 비밀번호를 확인해 주세요.", "error");
    }
  };

  return (
    <div className="ui-fade fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white text-black p-12 max-w-md w-full shadow-2xl ui-pop">
        <h3 className="text-[28px] font-normal mb-10 text-center tracking-tighter">교사 인증</h3>
        <form onSubmit={handleLogin} className="space-y-8">
          <input 
            type="email" 
            placeholder="이메일 (ID)" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            className="w-full bg-transparent border-b border-line py-3 text-[16px] outline-none focus:border-black transition-colors"
          />
          <input 
            type="password" 
            placeholder="비밀번호" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            className="w-full bg-transparent border-b border-line py-3 text-[16px] outline-none focus:border-black transition-colors"
          />
          <div className="flex gap-4 pt-6 font-mono">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 text-[13px] uppercase tracking-widest text-gray-500 hover:text-black transition-colors"
            >
              cancel
            </button>
            <button 
              type="submit" 
              className="flex-1 border border-black bg-black text-white text-[13px] uppercase tracking-widest py-3.5 hover:bg-accent hover:border-accent transition-colors"
            >
              login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}