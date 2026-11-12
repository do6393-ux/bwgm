import { useState } from "react";
import { Lock } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import EquipModal from "../equipment/EquipModal";
import { LINK_MAX, LINK_PARTS, emptyForm, partLabel, toDoc, toForm, validateLink } from "@/lib/workLinks";
import { deleteLink, saveLink } from "@/lib/workLinksApi";

const field = "w-full min-h-[44px] bg-neutral-50 border border-neutral-200 rounded-field px-3 text-[14px] text-neutral-900 outline-none focus:border-accent transition-colors";
const labelCls = "block text-[13px] font-medium text-neutral-700 mb-1.5";

/**
 * 사이트 · 연락처 넣기 / 고치기 창.
 * link 가 있으면 고치기(지우기 버튼도 보임), 없으면 kind · defaultPart 로 새로 넣기.
 */
export default function LinkModal({ link, kind, defaultPart, onClose }) {
  const { toast, confirm } = useDialog();
  const [form, setForm] = useState(() => (link ? toForm(link) : emptyForm(kind, defaultPart)));
  const [busy, setBusy] = useState(false);
  const isSite = form.kind === "site";
  const editing = !!link;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateLink(form);
    if (problem) return toast(problem, "info");
    setBusy(true);
    try {
      await saveLink(link?.id, toDoc(form));
      toast(editing ? "고쳤어요." : "넣었어요.", "success");
      onClose();
    } catch (err) {
      console.error("work link save:", err);
      toast("저장하지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm(`"${link.name}"을(를) 지울까요?`, { danger: true, confirmText: "지우기" }))) return;
    setBusy(true);
    try {
      await deleteLink(link.id);
      toast("지웠어요.", "success");
      onClose();
    } catch (err) {
      console.error("work link delete:", err);
      toast("지우지 못했습니다. 권한이나 연결을 확인해 주세요.", "error");
      setBusy(false);
    }
  };

  const title = `${isSite ? "사이트" : "연락처"} ${editing ? "고치기" : "넣기"}`;

  return (
    <EquipModal eyebrow={`바로가기 · 연락처 › ${isSite ? "사이트" : "연락처"}`} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="link-part" className={labelCls}>분류</label>
          <select id="link-part" value={form.part} onChange={set("part")} className={field}>
            {LINK_PARTS.map((p) => (
              <option key={p} value={p}>
                {partLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="link-name" className={labelCls}>{isSite ? "이름" : "이름 · 기관"}</label>
          <input
            id="link-name"
            value={form.name}
            onChange={set("name")}
            maxLength={LINK_MAX.name}
            autoFocus={!editing}
            placeholder={isSite ? "예) 업무포털" : "예) 교육청 정보화 담당 ○○○ 주무관"}
            className={field}
          />
        </div>

        {isSite ? (
          <div>
            <label htmlFor="link-url" className={labelCls}>주소</label>
            <input
              id="link-url"
              value={form.url}
              onChange={set("url")}
              maxLength={LINK_MAX.url}
              inputMode="url"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="예) www.ice.go.kr"
              className={`${field} font-mono text-[13px]`}
            />
            <p className="mt-1 text-[12px] text-neutral-500">https:// 를 빼고 적어도 저절로 붙여요.</p>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="link-role" className={labelCls}>하는 일 (언제 연락하는지)</label>
              <input id="link-role" value={form.role} onChange={set("role")} maxLength={LINK_MAX.role} placeholder="예) 인터넷 끊김 · 느려짐" className={field} />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex-[1_1_200px] min-w-0">
                <label htmlFor="link-phone" className={labelCls}>전화</label>
                <input id="link-phone" value={form.phone} onChange={set("phone")} maxLength={LINK_MAX.phone} inputMode="tel" placeholder="예) 032-000-0000" className={`${field} font-mono text-[13px]`} />
              </div>
              <div className="flex-[1_1_200px] min-w-0">
                <label htmlFor="link-email" className={labelCls}>이메일 (없으면 비워 두기)</label>
                <input
                  id="link-email"
                  value={form.email}
                  onChange={set("email")}
                  maxLength={LINK_MAX.email}
                  inputMode="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={field}
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label htmlFor="link-memo" className={labelCls}>{isSite ? "메모 (무엇을 하는 곳인지)" : "메모"}</label>
          <textarea
            id="link-memo"
            value={form.memo}
            onChange={set("memo")}
            maxLength={LINK_MAX.memo}
            rows={3}
            placeholder={isSite ? "예) 나이스 · 에듀파인 · 공문" : "예) 학교 회선 번호를 먼저 말해요 · 평일 9~6시"}
            className={`${field} py-2.5 resize-y`}
          />
        </div>

        <p className="flex gap-2 px-3 py-2.5 rounded-field bg-amber-50 border border-amber-200 text-[12px] leading-relaxed text-amber-900">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          {isSite
            ? "아이디 · 비밀번호는 적지 마세요. 정보 업무를 보는 선생님이 모두 볼 수 있어요."
            : "업무 연락처만 적어 주세요. 정보 업무를 보는 선생님이 모두 볼 수 있어요."}
        </p>

        <label className="flex items-center gap-2.5 min-h-[44px] text-[14px] text-neutral-800 cursor-pointer">
          <input type="checkbox" checked={form.pinned} onChange={set("pinned")} className="w-[18px] h-[18px] accent-[rgb(var(--c-accent))]" />
          ★ 맨 앞에 고정 (자주 쓰는 것)
        </label>

        <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-black/[0.06]">
          {editing ? (
            <button type="button" onClick={remove} disabled={busy} className="min-h-[44px] px-3 rounded-full text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-50">
              지우기
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className="min-h-[44px] px-5 rounded-full border border-black/[0.12] bg-white text-[13px] font-medium text-neutral-800 hover:border-black/30">
              취소
            </button>
            <button type="submit" disabled={busy} className="min-h-[44px] px-6 rounded-full bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong disabled:opacity-50">
              {editing ? "저장" : "넣기"}
            </button>
          </span>
        </div>
      </form>
    </EquipModal>
  );
}
