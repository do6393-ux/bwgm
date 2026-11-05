import { useState, useEffect } from "react";
import { createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from "firebase/auth";
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db, getSecondaryAuth } from "@/lib/firebase";
import { useDialog } from "@/components/ui/dialogContext";

// 헷갈리는 문자(0/O, 1/l/I)를 뺀 임시 비밀번호 생성
function generatePassword(length = 10) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function explainError(err) {
  switch (err?.code) {
    case "auth/invalid-email":
      return "이메일 형식이 올바르지 않습니다.";
    case "auth/weak-password":
      return "비밀번호가 너무 약합니다. 6자 이상으로 입력하세요.";
    case "auth/admin-restricted-operation":
    case "auth/operation-not-allowed":
      return "Firebase 콘솔 > Authentication 에서 이메일/비밀번호 가입(sign-up)이 꺼져 있습니다. 켜야 계정을 만들 수 있습니다.";
    case "auth/network-request-failed":
      return "네트워크 오류입니다. 연결을 확인하고 다시 시도하세요.";
    case "permission-denied":
      return "권한이 없습니다. 관리자 계정으로 로그인했는지, 새 Firestore 규칙(teachers 컬렉션)이 게시됐는지 확인하세요.";
    default:
      return `오류: ${err?.code || err?.message || "알 수 없음"}`;
  }
}

export default function TeacherAdminModal({ isOpen, onClose, currentUser }) {
  const { confirm } = useDialog();
  const [teachers, setTeachers] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null); // { email, password|null }
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(
      collection(db, "teachers"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.email || a.id).localeCompare(b.email || b.id));
        setTeachers(list);
      },
      (err) => setError(explainError(err))
    );
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail("");
    setName("");
    setPassword(generatePassword());
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setCreated(null);

    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError("이메일 형식이 올바르지 않습니다.");
    if (password.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.");
    if (addr === currentUser.email.toLowerCase()) return setError("관리자 본인은 이미 모든 권한이 있습니다.");

    setBusy(true);
    let accountCreated = false;
    try {
      const secAuth = getSecondaryAuth();
      try {
        const cred = await createUserWithEmailAndPassword(secAuth, addr, password);
        accountCreated = true;
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      } catch (err) {
        if (err.code !== "auth/email-already-in-use") throw err;
        const ok = await confirm(
          `${addr} 는 이미 가입된 계정입니다.\n\n이 계정을 만든 사람이 해당 교사 본인이 확실할 때만 권한을 부여하세요.\n계속할까요?`,
          { title: "이미 가입된 계정", confirmText: "권한 부여" }
        );
        if (!ok) return;
      } finally {
        await signOut(secAuth);
      }

      // 허용 목록(= 접근 권한). Firestore 규칙이 이 문서의 존재로 교사 여부를 판단한다.
      // merge: 이미 등록된 교사를 다시 추가해도 정보 업무 허용(canWork) 설정이 초기화되지 않게 한다.
      await setDoc(
        doc(db, "teachers", addr),
        {
          email: addr,
          name: name.trim(),
          addedBy: currentUser.email,
          addedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setCreated({ email: addr, password: accountCreated ? password : null });
      resetForm();
    } catch (err) {
      const extra = accountCreated
        ? `\n(계정은 이미 만들어졌습니다. 임시 비밀번호: ${password} — 같은 이메일로 다시 추가하면 권한만 부여됩니다.)`
        : "";
      setError(explainError(err) + extra);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (t) => {
    const ok = await confirm(`${t.email || t.id} 선생님의 접근 권한을 삭제하시겠습니까?\n(계정 자체는 남지만 데이터에는 접근할 수 없게 됩니다.)`, { danger: true, confirmText: "삭제" });
    if (!ok) return;
    setError("");
    setNotice("");
    try {
      await deleteDoc(doc(db, "teachers", t.id));
      setNotice(`${t.email || t.id} 권한을 삭제했습니다.`);
    } catch (err) {
      setError(explainError(err));
    }
  };

  // 정보 업무 접근(열람·수정) 허용/해제 (teachers/{이메일}.canWork)
  const handleToggleWork = async (t) => {
    setError("");
    setNotice("");
    try {
      await updateDoc(doc(db, "teachers", t.id), { canWork: !t.canWork });
      setNotice(`${t.email || t.id} 의 정보 업무 권한을 ${t.canWork ? "해제" : "허용"}했습니다.`);
    } catch (err) {
      setError(explainError(err));
    }
  };

  const handleResetMail = async (t) => {
    setError("");
    setNotice("");
    try {
      await sendPasswordResetEmail(auth, t.email || t.id);
      setNotice(`${t.email || t.id} 로 비밀번호 재설정 메일을 보냈습니다.`);
    } catch (err) {
      setError(explainError(err));
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("복사했습니다.");
    } catch {
      setNotice("복사에 실패했습니다. 직접 선택해서 복사하세요.");
    }
  };

  return (
    <div className="ui-fade fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-black">
      <div className="bg-white rounded-panel p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-black/[0.08] ui-pop">
        <div className="flex justify-between items-center border-b border-black/[0.06] pb-4 mb-6">
          <div>
            <h3 className="text-[20px] font-bold tracking-tight">Teacher Accounts</h3>
            <p className="text-[12px] text-neutral-500 mt-1 font-mono">관리자({currentUser.email})만 교사를 추가·삭제하고 정보 업무 권한을 줄 수 있습니다.</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-black transition-colors font-bold text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleAdd} className="space-y-3 font-mono">
          <div>
            <label className="block text-[11px] text-neutral-500 mb-1.5 uppercase tracking-widest">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@ice.go.kr"
              required
              className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-black transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1.5 uppercase tracking-widest">Name (선택)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-black transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1.5 uppercase tracking-widest">임시 비밀번호</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-w-0 flex-1 bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-black transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  title="새로 생성"
                  className="px-3 rounded-field border border-neutral-200 text-neutral-500 hover:text-black hover:border-black transition-colors"
                >
                  ↻
                </button>
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-black hover:bg-neutral-800 text-white font-bold py-3 rounded-full text-[14px] transition-all active:scale-95 disabled:opacity-50"
          >
            {busy ? "Creating..." : "교사 추가"}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-field p-3 whitespace-pre-line break-words">{error}</p>
        )}
        {notice && !error && (
          <p className="mt-4 text-[13px] text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-field p-3">{notice}</p>
        )}

        {created && (
          <div className="mt-4 text-[13px] bg-emerald-50 border border-emerald-200 rounded-field p-4 space-y-2">
            <p className="font-bold text-emerald-800">추가되었습니다. 아래 정보를 해당 선생님께 전달하세요.</p>
            <p className="font-mono break-all">
              ID: {created.email}
              <br />
              {created.password ? (
                <>PW: {created.password}</>
              ) : (
                <>이미 가입된 계정이라 비밀번호는 바뀌지 않았습니다. 모르면 &quot;재설정 메일&quot;을 보내세요.</>
              )}
            </p>
            {created.password && (
              <button
                onClick={() => copy(`ID: ${created.email}\nPW: ${created.password}`)}
                className="text-[12px] font-mono underline text-emerald-800"
              >
                [ 복사 ]
              </button>
            )}
            <p className="text-[12px] text-emerald-700">이 창을 닫으면 임시 비밀번호는 다시 볼 수 없습니다.</p>
          </div>
        )}

        <div className="mt-8">
          <h4 className="text-[11px] text-neutral-500 mb-2 uppercase tracking-widest font-mono">등록된 교사 ({teachers.length})</h4>
          {teachers.length === 0 ? (
            <p className="text-[13px] text-neutral-400 font-mono py-4 text-center border border-dashed border-neutral-200 rounded-field">아직 추가된 교사가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-black/[0.06] border border-black/[0.08] rounded-field">
              {teachers.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium truncate">{t.name || "(이름 없음)"}</p>
                    <p className="text-[12px] text-neutral-500 font-mono truncate">{t.email || t.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-3 shrink-0 text-[11px] font-mono">
                    <button
                      onClick={() => handleToggleWork(t)}
                      title="켜면 이 교사가 정보 업무 탭을 열람·수정할 수 있습니다"
                      className={t.canWork ? "text-emerald-700 hover:text-emerald-900 font-bold" : "text-neutral-400 hover:text-black"}
                    >
                      [ 정보 업무: {t.canWork ? "허용" : "차단"} ]
                    </button>
                    <button onClick={() => handleResetMail(t)} className="text-neutral-500 hover:text-black">
                      [ 재설정 메일 ]
                    </button>
                    <button onClick={() => handleRemove(t)} className="text-red-500 hover:text-red-700">
                      [ 삭제 ]
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
