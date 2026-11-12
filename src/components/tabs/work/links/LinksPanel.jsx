import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Copy, Mail, Pencil, Phone, Plus, Search, Star, X } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import LinkModal from "./LinkModal";
import { findPart } from "@/lib/workParts";
import { LINK_PARTS, countByPart, dialNumber, filterLinks, hostOf, partLabel, sortLinks } from "@/lib/workLinks";
import { watchLinks } from "@/lib/workLinksApi";

const chip = (on) =>
  `inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-full border text-[13px] transition-colors ${
    on ? "bg-neutral-900 border-neutral-900 text-white font-semibold" : "bg-white border-black/[0.12] text-neutral-700 hover:border-black/30"
  }`;
const addBtn = "flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-white hover:border-black/30 border border-black/[0.12] text-neutral-800 px-4 min-h-[44px] rounded-full text-[13px] font-medium transition-all";
const iconBtn = "w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-neutral-500 hover:text-accent hover:bg-black/[0.04] transition-colors";

const Dot = ({ part }) => <span className={`w-2 h-2 shrink-0 rounded-full ${findPart(part).dot}`} aria-hidden="true" />;
const Pin = () => <Star role="img" aria-label="고정" className="w-3.5 h-3.5 shrink-0 fill-amber-400 text-amber-500" />;
const isWebUrl = (url) => /^https?:\/\//i.test(url || "");

/**
 * 정보 업무 › 바로가기·연락처 작은 탭. 정보부가 같이 쓰는 사이트 바로가기와 업무 연락처.
 * PC 는 사이트 → 연락처, 휴대폰은 연락처 → 사이트 순서로 보인다 (휴대폰에서는 전화를 더 자주 건다).
 */
export default function LinksPanel({ canEdit, defaultPart }) {
  const { toast } = useDialog();
  const [links, setLinks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [part, setPart] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // { kind, link? }

  useEffect(
    () =>
      watchLinks((list, err) => {
        setLinks(list);
        setFailed(!!err);
        setLoaded(true);
      }),
    []
  );

  const counts = useMemo(() => countByPart(links), [links]);
  const shown = useMemo(() => sortLinks(filterLinks(links, { part, query })), [links, part, query]);
  const sites = shown.filter((x) => x.kind === "site");
  const contacts = shown.filter((x) => x.kind === "contact");
  const hasSites = links.some((x) => x.kind === "site");
  const hasContacts = links.some((x) => x.kind === "contact");
  const filtering = part !== "all" || !!query.trim();

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("번호를 복사했어요.", "success");
    } catch {
      toast("복사하지 못했어요. 번호를 길게 눌러 직접 복사해 주세요.", "info");
    }
  };

  const emptyNote = (has, kindLabel, addLabel) => {
    if (!loaded) return "불러오는 중…";
    if (failed) return "목록을 불러오지 못했어요. 연결을 확인해 주세요.";
    if (!has) return canEdit ? `아직 넣은 ${kindLabel}가 없어요. 위 "${addLabel}"로 넣어 보세요.` : `아직 넣은 ${kindLabel}가 없어요.`;
    return filtering ? `맞는 ${kindLabel}가 없어요.` : "";
  };

  return (
    <div className="flex flex-col gap-12">
      <section className="border border-black/[0.08] bg-well rounded-card p-5 md:p-8 shadow-sm space-y-6">
        <div>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-neutral-600 font-semibold">Links &amp; Contacts</div>
          <h2 className="text-[26px] md:text-[32px] font-normal tracking-tight text-neutral-900 leading-tight">바로가기 · 연락처</h2>
          <p className="mt-2 text-[13px] text-neutral-600 break-keep">
            정보부가 같이 쓰는 사이트와 연락처예요. 정보 업무를 볼 수 있는 선생님은 누구나 넣고 고칠 수 있어요.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-6">
          <div className="relative flex items-center w-full sm:w-auto">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="바로가기 · 연락처 검색"
              placeholder="이름 · 하는 일 · 번호 · 메모 검색..."
              className="pl-9 pr-8 py-2.5 rounded-full text-[13px] bg-white/90 border border-black/[0.08] text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/15 transition-all w-full sm:w-72 shadow-sm"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기" className="absolute right-2 w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-neutral-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-2 w-full sm:w-auto">
              <button type="button" onClick={() => setModal({ kind: "site" })} className={`${addBtn} order-2 md:order-1`}>
                <Plus className="w-4 h-4" />
                사이트 추가
              </button>
              <button type="button" onClick={() => setModal({ kind: "contact" })} className={`${addBtn} order-1 md:order-2`}>
                <Plus className="w-4 h-4" />
                연락처 추가
              </button>
            </div>
          )}
        </div>

        <div role="group" aria-label="분류" className="flex flex-wrap gap-1.5">
          {["all", ...LINK_PARTS].map((p) => (
            <button key={p} type="button" aria-pressed={part === p} onClick={() => setPart(p)} className={chip(part === p)}>
              {p !== "all" && <Dot part={p} />}
              {p === "all" ? "전체" : partLabel(p)}
              <span className={`font-mono text-[12px] ${part === p ? "text-neutral-300" : "text-neutral-500"}`}>{loaded ? counts[p] : "–"}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 사이트 바로가기 (휴대폰에서는 연락처 아래) */}
      <section className="order-2 md:order-1 space-y-5">
        <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-black/[0.06] pb-3">
          <h3 className="text-[20px] font-semibold text-neutral-900">
            사이트 바로가기 <span className="font-mono text-[13px] font-normal text-neutral-500">{loaded ? sites.length : ""}</span>
          </h3>
          <span className="text-[12px] text-neutral-500">누르면 새 창으로 열려요 · ★ 고정한 것이 맨 앞</span>
        </div>
        {sites.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-neutral-500">{emptyNote(hasSites, "사이트", "사이트 추가")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {sites.map((x) => (
              <div key={x.id} className="flex flex-col gap-2.5 p-4 pl-5 rounded-panel bg-white border border-black/[0.08] hover:border-black/20 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                    <Dot part={x.part} />
                    {partLabel(x.part)}
                    {x.pinned && <Pin />}
                  </span>
                  {canEdit && (
                    <button type="button" onClick={() => setModal({ kind: "site", link: x })} aria-label={`${x.name} 고치기`} title="고치기" className={`${iconBtn} -m-2.5`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {isWebUrl(x.url) ? (
                  <a href={x.url} target="_blank" rel="noopener noreferrer" className="group flex flex-col gap-1">
                    <span className="flex items-start gap-1.5 text-[17px] font-semibold leading-snug text-neutral-900 group-hover:text-accent transition-colors break-keep">
                      {x.name}
                      <ArrowUpRight className="w-4 h-4 mt-1 shrink-0 text-accent" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-[12px] text-accent break-all">{hostOf(x.url)}</span>
                  </a>
                ) : (
                  <span className="text-[17px] font-semibold text-neutral-900 break-keep">{x.name}</span>
                )}
                {x.memo && <p className="text-[13px] leading-relaxed text-neutral-600 whitespace-pre-line break-keep">{x.memo}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 연락처 (휴대폰에서는 맨 위) */}
      <section className="order-1 md:order-2 space-y-5">
        <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-black/[0.06] pb-3">
          <h3 className="text-[20px] font-semibold text-neutral-900">
            연락처 <span className="font-mono text-[13px] font-normal text-neutral-500">{loaded ? contacts.length : ""}</span>
          </h3>
          <span className="text-[12px] text-neutral-500">휴대폰에서 번호를 누르면 바로 전화가 걸려요</span>
        </div>
        {contacts.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-neutral-500">{emptyNote(hasContacts, "연락처", "연락처 추가")}</p>
        ) : (
          <ul className="space-y-2.5">
            {contacts.map((x) => {
              const dial = dialNumber(x.phone);
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 pl-5 rounded-panel bg-white border border-black/[0.08]">
                  <div className="flex-[999_1_260px] min-w-0 space-y-0.5">
                    <p className="flex items-center gap-1.5 text-[15px] font-semibold text-neutral-900 break-keep">
                      {x.name}
                      {x.pinned && <Pin />}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-neutral-600">
                      <span className="flex items-center gap-1.5">
                        <Dot part={x.part} />
                        {partLabel(x.part)}
                      </span>
                      {x.role && (
                        <>
                          <span aria-hidden="true" className="text-neutral-400">·</span>
                          <span className="break-keep">{x.role}</span>
                        </>
                      )}
                    </p>
                    {x.memo && <p className="pt-0.5 text-[12px] text-neutral-500 whitespace-pre-line break-keep">{x.memo}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
                    {x.phone &&
                      (dial ? (
                        // 휴대폰: 전화 버튼 + 복사 버튼이 한 줄을 다 쓰고, 이메일 · 고치기는 다음 줄로
                        <a
                          href={`tel:${dial}`}
                          className="grow basis-[calc(100%-3.25rem)] md:grow-0 md:basis-auto min-w-0 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-full bg-accent text-white font-mono text-[13px] font-bold hover:bg-accent-strong transition-colors"
                        >
                          <Phone className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{x.phone}</span>
                          <span className="md:hidden shrink-0 font-sans font-medium">전화 걸기</span>
                        </a>
                      ) : (
                        <span className="grow basis-[calc(100%-3.25rem)] md:grow-0 md:basis-auto px-2 font-mono text-[13px] text-neutral-800">{x.phone}</span>
                      ))}
                    {x.phone && (
                      <button type="button" onClick={() => copy(x.phone)} aria-label={`${x.name} 번호 복사`} title="번호 복사" className={`${iconBtn} border border-black/[0.1]`}>
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    {x.email && (
                      <a
                        href={`mailto:${x.email}`}
                        className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border border-black/[0.1] text-[13px] text-neutral-800 hover:border-black/30 break-all"
                      >
                        <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                        {x.email}
                      </a>
                    )}
                    {canEdit && (
                      <button type="button" onClick={() => setModal({ kind: "contact", link: x })} aria-label={`${x.name} 고치기`} title="고치기" className={iconBtn}>
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {modal && <LinkModal link={modal.link} kind={modal.kind} defaultPart={part !== "all" ? part : defaultPart} onClose={() => setModal(null)} />}
    </div>
  );
}
