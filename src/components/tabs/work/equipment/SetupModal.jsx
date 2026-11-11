import { useState } from "react";
import { Plus } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import {
  KINDS_MAX,
  KIND_NAME_MAX,
  allItemIds,
  busyIds,
  fillRange,
  newId,
  parseLines,
  planKindEdit,
  saveErrorText,
  validateKindName,
} from "@/lib/equipment";
import { deleteKind, saveKind } from "@/lib/equipmentApi";
import EquipModal from "./EquipModal";

const NEW = "__new__";
const fieldLabel = "block text-[14px] font-semibold text-neutral-900 mb-2";
const fieldBox = "w-full bg-neutral-50 border border-neutral-200 rounded-field p-3 text-[14px] outline-none focus:border-accent transition-colors";
const smallBox = "h-10 bg-white border border-neutral-300 rounded-lg font-mono text-[13px] outline-none focus:border-accent";

const textOf = (kind) => (kind?.items || []).map((it) => it.label).join("\n");
const preview = (list) => list.slice(0, 8).map((it) => it.label).join(", ") + (list.length > 8 ? " …" : "");

/**
 * 기자재 등록 · 고치기 창. 종류 하나씩 이름과 목록(한 줄에 한 대)을 고친다.
 * 같은 번호는 같은 기자재로 남고(빌려준 기록 유지), 새 줄은 새 기자재, 빠진 줄은 지운다.
 */
export default function SetupModal({ kinds, states, onClose }) {
  const { confirm, toast } = useDialog();
  const [kindId, setKindId] = useState(() => kinds[0]?.id ?? NEW);
  const kind = kindId === NEW ? null : kinds.find((k) => k.id === kindId) || null;
  const [name, setName] = useState(() => kind?.name ?? "");
  const [text, setText] = useState(() => textOf(kind));
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pad, setPad] = useState(false);
  const [saving, setSaving] = useState(false);

  const lines = parseLines(text);
  const busy = busyIds(states);
  const plan = planKindEdit(kind?.items || [], lines, busy, allItemIds(kinds));
  const nameProblem = validateKindName(name, kinds, kind?.id ?? null);
  const dirty = name.trim() !== (kind?.name ?? "").trim() || lines.join("\n") !== textOf(kind);

  const leaveOk = async () => !dirty || (await confirm("저장하지 않은 내용이 있어요. 버리고 넘어갈까요?", { confirmText: "버리기" }));

  const switchTo = async (id) => {
    if (id === kindId || !(await leaveOk())) return;
    if (id === NEW && kinds.length >= KINDS_MAX) return toast(`종류는 ${KINDS_MAX}개까지 만들 수 있어요.`, "info");
    const next = id === NEW ? null : kinds.find((k) => k.id === id);
    setKindId(id);
    setName(next?.name ?? "");
    setText(textOf(next));
  };

  const close = async () => {
    if (await leaveOk()) onClose();
  };

  const fill = () => {
    const r = fillRange({ prefix, from, to, pad });
    if (r.error) return toast(r.error, "info");
    const have = new Set(lines);
    const add = r.lines.filter((l) => !have.has(l));
    const skipped = r.lines.length - add.length;
    if (add.length === 0) return toast("모두 이미 목록에 있는 번호예요.", "info");
    setText([...lines, ...add].join("\n"));
    toast(`${add.length}줄을 목록 아래에 붙였어요.${skipped ? ` 이미 있는 ${skipped}개는 건너뛰었어요.` : ""} 저장을 눌러야 반영돼요.`, "info");
  };

  const save = async () => {
    if (nameProblem) return toast(nameProblem, "info");
    if (plan.error) return toast(plan.error, "info");
    if (plan.blocked.length) return toast(`빌려 가 있는 번호는 목록에서 지울 수 없어요: ${preview(plan.blocked)}. 반납한 뒤에 지워 주세요.`, "info");
    if (!kind && kinds.length >= KINDS_MAX) return toast(`종류는 ${KINDS_MAX}개까지 만들 수 있어요.`, "info");
    if (
      plan.removed.length &&
      !(await confirm(`${plan.removed.length}대를 목록에서 지울까요? (${preview(plan.removed)})\n지난 대여 기록은 그대로 남아요.`, {
        danger: true,
        confirmText: "지우고 저장",
      }))
    )
      return;
    setSaving(true);
    try {
      const id = kind ? kind.id : newId(new Set(kinds.map((k) => k.id)));
      await saveKind({ id, name: name.trim(), items: plan.items });
      toast(kind ? `${name.trim()} 목록을 저장했어요. (${plan.items.length}대)` : `"${name.trim()}" 종류를 만들었어요. (${plan.items.length}대)`, "success");
      onClose();
    } catch (err) {
      console.error("equipment kind save:", err);
      toast(saveErrorText(err), "error");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!kind) return;
    const out = kind.items.filter((it) => busy.has(it.id));
    if (out.length) return toast(`빌려 가 있는 ${out.length}대가 있어서 지울 수 없어요. 반납한 뒤에 지워 주세요.`, "info");
    if (!(await confirm(`"${kind.name}" 종류와 번호 ${kind.items.length}개를 모두 지울까요?\n지난 대여 기록은 남아요.`, { danger: true, confirmText: "지우기" }))) return;
    try {
      await deleteKind(kind.id);
      toast(`"${kind.name}" 종류를 지웠어요.`, "success");
      onClose();
    } catch (err) {
      console.error("equipment kind delete:", err);
      toast(saveErrorText(err), "error");
    }
  };

  const listTitle = name.trim() || (kind ? kind.name : "새 종류");

  return (
    <EquipModal eyebrow="// EQUIPMENT SETUP" title="기자재 등록 · 고치기" onClose={close}>
      <div className="space-y-6">
        <div>
          <span className={fieldLabel}>종류</span>
          <div className="flex flex-wrap items-center gap-2">
            {kinds.length > 0 && (
              <div role="tablist" aria-label="기자재 종류" className="flex flex-wrap gap-1 rounded-full bg-black/[0.06] p-1">
                {kinds.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    role="tab"
                    aria-selected={k.id === kindId}
                    onClick={() => switchTo(k.id)}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all ${k.id === kindId ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`}
                  >
                    {k.name} <span className={`font-mono text-[11px] ${k.id === kindId ? "text-white/80" : "text-neutral-500"}`}>{k.items.length}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => switchTo(NEW)}
              aria-pressed={kindId === NEW}
              className={`flex items-center gap-1 min-h-[40px] px-4 rounded-full text-[13px] font-medium border border-dashed transition-colors ${
                kindId === NEW ? "border-accent text-accent bg-accent/[0.06]" : "border-neutral-400 text-neutral-700 hover:border-neutral-700"
              }`}
            >
              <Plus className="w-3.5 h-3.5" /> 새 종류
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="setup-name" className={fieldLabel}>종류 이름</label>
          <input
            id="setup-name"
            type="text"
            value={name}
            maxLength={KIND_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 태블릿, 노트북, 빔프로젝터"
            className={fieldBox}
          />
        </div>

        <div>
          <div className="flex justify-between items-baseline gap-2 mb-2">
            <label htmlFor="setup-list" className="text-[14px] font-semibold text-neutral-900">
              {listTitle} 목록 <span className="font-normal text-[12px] text-neutral-500">· 한 줄에 한 대</span>
            </label>
            <span className="font-mono text-[12px] font-bold text-accent">{lines.length}줄</span>
          </div>
          <textarea
            id="setup-list"
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"1\n2\n3\n…"}
            spellCheck={false}
            className={`${fieldBox} font-mono text-[13px] leading-relaxed resize-y`}
          />
          <p className="mt-2 text-[12px] text-neutral-600 leading-relaxed break-keep">
            학교에서 붙인 번호를 그대로 적으면 돼요. 숫자든 글자든(예: 3-1반 01, 크롬북 A12) 다 돼요. 엑셀에서 한 열을 복사해 붙여 넣어도 한 줄에 한 대로 들어가요.
          </p>
        </div>

        <div className="p-4 rounded-panel bg-well border border-black/[0.06] space-y-3">
          <p className="text-[13px] font-semibold text-neutral-900">
            번호로 한꺼번에 채우기 <span className="font-normal text-neutral-500">(목록 아래에 붙어요)</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-neutral-700">
            <label className="flex items-center gap-1.5">
              앞 글자
              <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="없음" className={`${smallBox} w-20 px-2`} />
            </label>
            <label className="flex items-center gap-1.5">
              번호
              <input value={from} onChange={(e) => setFrom(e.target.value)} inputMode="numeric" aria-label="시작 번호" placeholder="1" className={`${smallBox} w-16 text-center`} />
            </label>
            <span>~</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} inputMode="numeric" aria-label="끝 번호" placeholder="40" className={`${smallBox} w-16 text-center`} />
            <label className="flex items-center gap-1.5 text-[12px] cursor-pointer select-none">
              <input type="checkbox" checked={pad} onChange={(e) => setPad(e.target.checked)} className="w-4 h-4 accent-[rgb(var(--c-accent))]" />
              자릿수 맞추기 (01, 02…)
            </label>
            <button
              type="button"
              onClick={fill}
              className="min-h-[40px] px-4 rounded-full text-[13px] font-medium bg-white border border-black/[0.14] text-neutral-800 hover:border-black/30 transition-colors"
            >
              채우기
            </button>
          </div>
        </div>

        <div
          aria-live="polite"
          className={`p-4 rounded-panel border text-[13px] space-y-1.5 ${
            plan.error || plan.blocked?.length ? "bg-red-50 border-red-200 text-red-800" : "bg-accent/[0.05] border-accent/20 text-neutral-800"
          }`}
        >
          <p className="font-semibold">저장하면</p>
          {plan.error ? (
            <p>{plan.error}</p>
          ) : !dirty ? (
            <p className="text-neutral-600">아직 바뀐 것이 없어요.</p>
          ) : (
            <>
              <p className="flex flex-wrap gap-x-4 gap-y-1">
                <span>그대로 <strong className="font-mono">{plan.kept}</strong>대</span>
                <span>새로 <strong className="font-mono text-accent">{plan.added.length}</strong>대</span>
                <span>지움 <strong className={`font-mono ${plan.removed.length ? "text-red-700" : ""}`}>{plan.removed.length}</strong>대</span>
                {plan.reordered && <span className="text-neutral-600">순서 바뀜</span>}
              </p>
              {plan.blocked.length > 0 ? (
                <p>빌려 가 있는 번호({preview(plan.blocked)})는 지울 수 없어요. 반납한 뒤에 지워 주세요.</p>
              ) : (
                plan.removed.length > 0 && <p className="text-neutral-600">지울 번호: {preview(plan.removed)} (지난 대여 기록은 남아요)</p>
              )}
            </>
          )}
          {nameProblem && name.trim() && <p className="text-red-700">{nameProblem}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-black/[0.06]">
          {kind ? (
            <button type="button" onClick={remove} className="min-h-[44px] px-2 text-[13px] text-red-700 hover:text-red-800 hover:underline">
              이 종류 지우기
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button type="button" onClick={close} className="px-5 py-2.5 rounded-full text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors">
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="bg-accent text-white px-6 py-2.5 rounded-full font-medium text-[13px] hover:bg-accent-strong transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {saving ? "저장 중…" : `저장 (${lines.length}대)`}
            </button>
          </div>
        </div>
      </div>
    </EquipModal>
  );
}
