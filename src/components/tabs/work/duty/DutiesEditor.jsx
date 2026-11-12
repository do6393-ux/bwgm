import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardPaste, Plus } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import EquipModal from "../equipment/EquipModal";
import { findPart } from "@/lib/workParts";
import {
  DUTIES_PER_PART_MAX,
  DUTY_TITLE_MAX,
  ROLE_META,
  ROLE_PARTS,
  TOOLS,
  cardSummary,
  diffDuties,
  groupCards,
  isBlankDutyDoc,
  newDutyKey,
  parsePastedDuties,
  partFixes,
} from "@/lib/workDuties";
import { saveDuties } from "@/lib/workDutiesApi";

const fieldBox = "bg-white border border-black/[0.15] rounded-field px-3 text-[14px] text-neutral-900 outline-none focus:border-accent transition-colors";
const ghostBtn = "inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border border-black/[0.12] bg-white text-neutral-800 text-[13px] font-medium hover:border-black/30 transition-colors disabled:opacity-50";
const pill = (active) =>
  `flex items-center gap-2 px-4 py-2 rounded-full text-[13px] transition-all ${
    active ? "bg-white text-neutral-900 shadow-sm font-semibold" : "text-neutral-600 hover:text-neutral-900 font-medium"
  }`;

const BADGE = {
  moved: "bg-blue-100 text-blue-800",
  added: "bg-emerald-100 text-emerald-800",
  renamed: "bg-amber-100 text-amber-900",
  removed: "bg-red-100 text-red-800",
  reordered: "bg-neutral-200 text-neutral-700",
};
const CHANGE_LABEL = { moved: "옮김", added: "새 업무", renamed: "이름 바꿈", removed: "뺌", reordered: "순서" };
const tabName = (part) => ROLE_META[part]?.tab || findPart(part).label;

/** 고치는 중인 줄: { key, title, tool?, removed? } */
const toDraft = (duties) => Object.fromEntries(ROLE_PARTS.map((p) => [p, (duties[p] || []).map((x) => ({ ...x }))]));

/** 고치는 중인 줄 → 저장할 목록 (뺀 줄은 빼고, 이름은 다듬고, 도구는 있을 때만) */
const toParts = (draft) =>
  Object.fromEntries(
    ROLE_PARTS.map((p) => [
      p,
      draft[p]
        .filter((x) => !x.removed)
        .map((x) => (x.tool ? { key: x.key, title: x.title.trim(), tool: x.tool } : { key: x.key, title: x.title.trim() })),
    ])
  );

/**
 * 업무분장 고치기 창 (관리자 · 부장). 보직 작은 탭마다 업무 줄을 고치고, 저장 전에 바뀐 것을 한 번 더 보여 준다.
 * 업무를 옮기거나 이름을 바꿔도 key 는 그대로라서 카드(할 일 · 매뉴얼 · 서식)가 따라간다.
 */
export default function DutiesEditor({ duties, tasks, initialPart, email, onClose }) {
  const { toast, confirm } = useDialog();
  const [base] = useState(duties); // 창을 연 순간의 목록과 비교한다
  const [draft, setDraft] = useState(() => toDraft(duties));
  const [tab, setTab] = useState(initialPart);
  const [step, setStep] = useState("edit"); // edit | confirm
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [focusKey, setFocusKey] = useState(null);
  const [saving, setSaving] = useState(false);

  // key → 고치기 전 { title, part, tool? }
  const prev = useMemo(() => {
    const m = new Map();
    for (const p of ROLE_PARTS) for (const x of base[p] || []) m.set(x.key, { ...x, part: p });
    return m;
  }, [base]);
  // key → 그 자리 카드 (할 일 · 매뉴얼 · 서식이 얼마나 있는지 보여 주려고)
  const cards = useMemo(() => {
    const m = new Map();
    for (const p of ROLE_PARTS) for (const d of groupCards(tasks, p, base).duties) if (d.task) m.set(d.key, d.task);
    return m;
  }, [tasks, base]);

  const after = toParts(draft);
  const changes = diffDuties(base, after);
  const changedParts = new Set(changes.flatMap((c) => [c.part, c.from, c.to].filter(Boolean)));
  const activeCount = (p) => draft[p].filter((x) => !x.removed).length;
  const full = (p) => {
    if (activeCount(p) < DUTIES_PER_PART_MAX) return false;
    toast(`${tabName(p)}에는 업무를 ${DUTIES_PER_PART_MAX}개까지 넣을 수 있어요.`, "info");
    return true;
  };

  const update = (part, fn) => setDraft((d) => ({ ...d, [part]: fn(d[part]) }));
  const rename = (key, title) => update(tab, (list) => list.map((x) => (x.key === key ? { ...x, title } : x)));
  const shift = (i, dir) =>
    update(tab, (list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const moveTo = (key, to) => {
    if (to === tab || full(to)) return;
    setDraft((d) => {
      const row = d[tab].find((x) => x.key === key);
      return { ...d, [tab]: d[tab].filter((x) => x.key !== key), [to]: [...d[to], row] };
    });
    toast(`${tabName(to)} 탭 맨 아래로 옮겼어요.`, "success");
  };
  // 원래 있던 업무는 "뺌" 표시만 해 두고 (되살리기), 이 창에서 새로 넣은 줄은 바로 없앤다
  const remove = (key) =>
    update(tab, (list) => (prev.has(key) ? list.map((x) => (x.key === key ? { ...x, removed: true } : x)) : list.filter((x) => x.key !== key)));
  const restore = (key) => {
    if (full(tab)) return;
    update(tab, (list) => list.map((x) => (x.key === key ? { ...x, removed: false } : x)));
  };
  const add = () => {
    if (full(tab)) return;
    const key = newDutyKey();
    update(tab, (list) => [...list, { key, title: "" }]);
    setFocusKey(key);
  };
  const paste = () => {
    const have = new Set(draft[tab].filter((x) => !x.removed).map((x) => x.title.trim()));
    const titles = parsePastedDuties(pasteText).filter((t) => !have.has(t));
    if (!titles.length) return toast("넣을 새 업무가 없어요. 한 줄에 하나씩 붙여 넣어 주세요.", "info");
    const room = DUTIES_PER_PART_MAX - activeCount(tab);
    if (room <= 0) return full(tab);
    const take = titles.slice(0, room);
    update(tab, (list) => [...list, ...take.map((title) => ({ key: newDutyKey(), title }))]);
    setPasteText("");
    setPasteOpen(false);
    toast(
      take.length < titles.length
        ? `${take.length}개 넣었어요. (${DUTIES_PER_PART_MAX}개까지라 ${titles.length - take.length}개는 못 넣었어요)`
        : `${take.length}개 넣었어요.`,
      "success"
    );
  };

  const check = () => {
    for (const p of ROLE_PARTS) {
      const names = draft[p].filter((x) => !x.removed).map((x) => x.title.trim());
      if (names.some((n) => !n)) {
        setTab(p);
        return toast(`${tabName(p)} 탭에 이름이 빈 업무가 있어요. 이름을 적거나 빼 주세요.`, "info");
      }
      const dup = names.find((n, i) => names.indexOf(n) !== i);
      if (dup) {
        setTab(p);
        return toast(`${tabName(p)} 탭에 "${dup}"이(가) 두 번 있어요.`, "info");
      }
    }
    setStep("confirm");
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveDuties(after, partFixes(tasks, after), email);
      toast("업무분장을 바꿨어요.", "success");
      onClose();
    } catch (err) {
      console.error("duties save:", err);
      toast("저장하지 못했습니다. 관리자 · 부장 선생님만 고칠 수 있어요. 권한이나 연결을 확인해 주세요.", "error");
      setSaving(false);
    }
  };

  const close = async () => {
    if (saving) return;
    if (changes.length && !(await confirm("고친 것을 저장하지 않고 닫을까요?", { danger: true, confirmText: "닫기" }))) return;
    onClose();
  };

  // 뺀 업무의 카드가 어떻게 되는지 ("그 밖의 업무 카드"로 내려가는지, 빈 카드라 없어지는지)
  const removedNote = (key) => {
    const card = cards.get(key);
    if (!card || isBlankDutyDoc(card)) return "아직 적힌 게 없는 카드라 그냥 없어져요.";
    const s = cardSummary(card);
    return `카드는 "그 밖의 업무 카드"로 내려가요${s ? ` (${s})` : ""}.`;
  };

  const counts = changes.reduce((m, c) => ({ ...m, [c.type]: (m[c.type] || 0) + 1 }), {});
  const countText = Object.keys(CHANGE_LABEL)
    .filter((t) => counts[t])
    .map((t) => `${CHANGE_LABEL[t]} ${counts[t]}`)
    .join(" · ");

  const describe = (c) => {
    const s = cardSummary(cards.get(c.key));
    switch (c.type) {
      case "moved":
        return { title: c.title, detail: `${tabName(c.from)} → ${tabName(c.to)}. ${s ? `적어 둔 것(${s})이 같이 가요.` : "카드에 적힌 건 아직 없어요."}` };
      case "added":
        return { title: c.title, detail: `${tabName(c.part)} 탭에 빈 카드가 생겨요.` };
      case "renamed":
        return { title: `${c.oldTitle} → ${c.title}`, detail: `${tabName(c.part)}. 적어 둔 내용은 그대로예요.` };
      case "removed":
        return { title: c.title, detail: `${tabName(c.part)}. ${removedNote(c.key)}` };
      default:
        return { title: `${tabName(c.part)} 탭`, detail: "업무 순서가 바뀌어요." };
    }
  };

  if (step === "confirm") {
    return (
      <EquipModal eyebrow="업무분장 고치기 › 저장 전에 확인" title="이렇게 바꿀까요?" onClose={() => !saving && setStep("edit")} size="max-w-2xl">
        <div className="space-y-5">
          <ul className="space-y-2.5">
            {changes.map((c, i) => {
              const { title, detail } = describe(c);
              return (
                <li key={`${c.type}-${c.key || c.part}-${i}`} className="flex gap-3 p-3.5 rounded-field bg-neutral-50 border border-black/[0.06]">
                  <span className={`shrink-0 self-start min-w-[64px] px-2 py-0.5 rounded-md text-center text-[12px] font-semibold ${BADGE[c.type]}`}>{CHANGE_LABEL[c.type]}</span>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[14px] font-medium text-neutral-900 break-keep">{title}</span>
                    <span className="text-[13px] text-neutral-600 leading-relaxed break-keep">{detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-[12px] text-neutral-500 leading-relaxed">
            할 일 · 매뉴얼 · 서식이 적힌 카드는 지워지지 않아요. 선생님 보직(누가 어느 탭을 보는지)은 교사 계정 화면에서 따로 골라요.
          </p>
          <div className="flex flex-wrap justify-end gap-2 border-t border-black/[0.06] pt-5">
            <button type="button" onClick={() => setStep("edit")} disabled={saving} className={ghostBtn}>
              다시 고치기
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="min-h-[44px] px-5 rounded-full bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong disabled:opacity-50"
            >
              {saving ? "저장하는 중…" : "바꾸기"}
            </button>
          </div>
        </div>
      </EquipModal>
    );
  }

  const rows = draft[tab];

  return (
    <EquipModal eyebrow="정보 업무 › 업무분장" title="업무분장 고치기" onClose={close} size="max-w-3xl">
      <div className="space-y-6">
        <p className="text-[13px] text-neutral-600 leading-relaxed">
          새 학년에 업무분장이 바뀌면 여기서 고쳐요. 업무를 <b className="font-semibold text-neutral-800">다른 보직으로 옮기거나 이름을 바꿔도</b> 카드에 적어 둔
          할 일 · 매뉴얼 · 서식은 그대로 따라가요. 뺀 업무의 카드는 지워지지 않고 그 보직 탭 "그 밖의 업무 카드"로 내려가요.
        </p>

        <div role="tablist" aria-label="보직" className="flex flex-wrap w-fit max-w-full gap-1 rounded-full bg-black/[0.06] p-1">
          {ROLE_PARTS.map((p) => (
            <button key={p} type="button" role="tab" aria-selected={tab === p} onClick={() => setTab(p)} className={pill(tab === p)}>
              <span className={`w-2 h-2 rounded-full ${findPart(p).dot}`} aria-hidden="true" />
              {tabName(p)}
              <span className="font-mono text-[12px] text-neutral-500">{activeCount(p)}</span>
              {changedParts.has(p) && <span className="w-1.5 h-1.5 rounded-full bg-accent" title="바뀐 것 있음" aria-label="바뀐 것 있음" />}
            </button>
          ))}
        </div>

        <section className="space-y-2">
          {rows.length === 0 && (
            <p className="rounded-field bg-neutral-50 border border-dashed border-neutral-300 px-4 py-5 text-[13px] text-neutral-500">
              이 보직에 업무가 없어요. 아래 "업무 추가"로 넣어 주세요.
            </p>
          )}
          <ul className="space-y-2">
            {rows.map((x, i) => {
              const p = prev.get(x.key);
              const name = x.title.trim() || "새 업무";
              const badges = [];
              if (x.removed) badges.push(["removed", "뺌"]);
              else if (!p) badges.push(["added", "새 업무"]);
              else {
                if (p.part !== tab) badges.push(["moved", `${tabName(p.part)}에서 옮겨 옴`]);
                if (p.title !== x.title.trim()) badges.push(["renamed", `이름 바뀜 · 예전: ${p.title}`]);
              }
              const meta = x.removed ? removedNote(x.key) : !p ? "빈 카드가 새로 생겨요" : cardSummary(cards.get(x.key)) || "아직 비어 있음";
              const rowCls = x.removed
                ? "bg-neutral-50 border-black/[0.06]"
                : !p
                  ? "bg-emerald-50/60 border-emerald-200"
                  : p.part !== tab
                    ? "bg-blue-50/60 border-blue-200"
                    : "bg-white border-black/[0.08]";
              return (
                <li key={x.key} className={`flex flex-wrap items-center gap-x-2.5 gap-y-2 py-2 pl-1 pr-2 rounded-field border ${rowCls}`}>
                  <span className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => shift(i, -1)}
                      disabled={i === 0}
                      aria-label={`${name} 위로`}
                      className="w-10 h-6 flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-black/[0.04] disabled:opacity-30"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => shift(i, 1)}
                      disabled={i === rows.length - 1}
                      aria-label={`${name} 아래로`}
                      className="w-10 h-6 flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-black/[0.04] disabled:opacity-30"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </span>
                  <div className="flex-[999_1_200px] min-w-0 flex flex-col gap-1">
                    {x.removed ? (
                      <span className="min-h-[40px] flex items-center px-3 text-[14px] text-neutral-500 line-through break-keep">{x.title}</span>
                    ) : (
                      <input
                        value={x.title}
                        onChange={(e) => rename(x.key, e.target.value)}
                        autoFocus={x.key === focusKey}
                        maxLength={DUTY_TITLE_MAX}
                        aria-label={`${name} 업무 이름`}
                        placeholder="업무 이름"
                        className={`${fieldBox} h-10 w-full`}
                      />
                    )}
                    <span className="flex flex-wrap items-center gap-1.5 px-1 text-[12px] text-neutral-500">
                      {badges.map(([type, text]) => (
                        <span key={text} className={`px-2 py-0.5 rounded-md font-semibold ${BADGE[type]}`}>
                          {text}
                        </span>
                      ))}
                      {x.tool && TOOLS[x.tool] && <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600">도구: {TOOLS[x.tool].label}</span>}
                      <span className="break-keep">{meta}</span>
                    </span>
                  </div>
                  <select
                    value={tab}
                    disabled={x.removed}
                    onChange={(e) => moveTo(x.key, e.target.value)}
                    aria-label={`${name} 보직`}
                    className={`${fieldBox} h-10 disabled:opacity-50`}
                  >
                    {ROLE_PARTS.map((rp) => (
                      <option key={rp} value={rp}>
                        {tabName(rp)}
                      </option>
                    ))}
                  </select>
                  {x.removed ? (
                    <button type="button" onClick={() => restore(x.key)} className="min-h-[40px] px-3 rounded-full border border-black/[0.12] bg-white text-[13px] text-neutral-800 hover:border-black/30">
                      되살리기
                    </button>
                  ) : (
                    <button type="button" onClick={() => remove(x.key)} aria-label={`${name} 빼기`} className="min-h-[40px] px-3 rounded-full text-[13px] text-red-600 hover:bg-red-50">
                      빼기
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={add} className={ghostBtn}>
              <Plus className="w-4 h-4" />
              업무 추가
            </button>
            <button type="button" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen} className={ghostBtn}>
              <ClipboardPaste className="w-4 h-4" />
              여러 개 붙여 넣기
            </button>
          </div>

          {pasteOpen && (
            <div className="space-y-2 rounded-field bg-neutral-50 border border-black/[0.08] p-3.5">
              <label htmlFor="duty-paste" className="block text-[13px] text-neutral-700">
                한 줄에 업무 하나씩 붙여 넣어 주세요. 한글 표에서 "세부 업무" 칸을 복사해 오면 돼요. 앞의 점(•)이나 번호는 저절로 떼요.
              </label>
              <textarea
                id="duty-paste"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={"예)\n홈페이지 관리\nAIEP 및 MS 계정 관리"}
                className={`${fieldBox} w-full py-2.5 resize-y`}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setPasteOpen(false)} className="min-h-[44px] px-4 rounded-full text-[13px] text-neutral-500 hover:text-neutral-900">
                  취소
                </button>
                <button type="button" onClick={paste} className="min-h-[44px] px-4 rounded-full bg-neutral-900 text-white text-[13px] font-semibold">
                  {tabName(tab)}에 넣기
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-between items-center gap-3 border-t border-black/[0.06] pt-5">
          <span className="text-[13px] text-neutral-600">
            {changes.length ? (
              <>
                바뀐 것 <b className="font-semibold text-accent">{changes.length}개</b> · {countText}
              </>
            ) : (
              "아직 바뀐 것이 없어요."
            )}
          </span>
          <span className="flex flex-wrap gap-2">
            <button type="button" onClick={close} className={ghostBtn}>
              취소
            </button>
            <button
              type="button"
              onClick={check}
              disabled={!changes.length}
              className="min-h-[44px] px-5 rounded-full bg-accent text-white text-[13px] font-semibold hover:bg-accent-strong disabled:opacity-40"
            >
              저장 전에 확인
            </button>
          </span>
        </div>
      </div>
    </EquipModal>
  );
}
