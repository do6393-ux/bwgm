// 교사용 과제 관리 화면 (?manage=assignments, 새 탭)
//   과제별 현황: 과제를 고르면 반별 칸 + 제출물
//   누적 현황:   한 반의 학생 × 과제 표. 자주 안 내는 학생을 찾는다
//   반 설정:     반과 인원 (빈 칸 개수가 여기서 정해진다)
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import {
  CLASS_SIZE_MAX,
  STATE_LABEL,
  buildClassGrid,
  classLabel,
  classRange,
  cumulativeTable,
  normalizeClassSettings,
  sortClassIds,
  targetClasses,
  toCsv,
} from "@/lib/homework";
import { copyText, downloadText, saveClassSettings, useAllRosters, useClassSettings, useHomeworkList, useHomeworkMarks } from "@/lib/homeworkApi";
import { GridLegend } from "./ClassGrid";
import HomeworkReport from "./HomeworkReport";
import { DueBadge } from "./HomeworkView";

const VIEWS = [
  { id: "each", label: "과제별 현황" },
  { id: "total", label: "누적 현황" },
  { id: "classes", label: "반 설정" },
];
const CELL = { ok: "bg-ok", late: "bg-warn", lacking: "bg-accent", none: "border border-line-strong" };

function EachView({ homeworks, rosters, settings }) {
  const { toast } = useDialog();
  const [selectedId, setSelectedId] = useState(null);
  const selected = homeworks.find((h) => h.id === selectedId) || homeworks[0];

  if (homeworks.length === 0) return <p className="py-12 font-mono text-[14px] opacity-50">아직 올린 과제가 없어요. 정보 수업 탭의 과제 칸에서 [ + add ] 로 올려 주세요.</p>;

  const copyLink = async (h) => {
    const url = `${window.location.origin}${window.location.pathname}?assignment=${h.id}`;
    const ok = await copyText(url);
    toast(ok ? "학생에게 보낼 주소를 복사했어요." : "복사하지 못했어요.", ok ? "success" : "error");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-8 lg:gap-12">
      <nav aria-label="과제 목록" className="lg:sticky lg:top-6 self-start border-t border-line max-h-[40vh] lg:max-h-[80vh] overflow-y-auto custom-scrollbar">
        {homeworks.map((h) => {
          const roster = rosters[h.id];
          const t = roster ? buildClassGrid(targetClasses(h, settings, roster), roster, h.due).totals : null;
          const pct = t && t.size ? Math.round((t.done / t.size) * 100) : null;
          const on = selected?.id === h.id;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => setSelectedId(h.id)}
              aria-current={on}
              className={`w-full text-left border-b border-line p-4 space-y-2 transition-colors ${on ? "bg-ink text-page" : "hover:bg-surface"}`}
            >
              <div className="text-[15px] font-medium leading-snug line-clamp-2">{h.title}</div>
              <div className="flex items-center justify-between gap-2 text-[12px] font-mono">
                <span className={on ? "opacity-70" : "opacity-50"}>{t ? (t.size ? `${t.done}/${t.size}명` : `${t.done}명 제출`) : "…"}</span>
                {h.open === false ? <span className="opacity-60">마감</span> : h.due && <span className="opacity-60">~{Number(h.due.slice(5, 7))}.{Number(h.due.slice(8, 10))}</span>}
              </div>
              {pct !== null && (
                <div className={`h-0.5 ${on ? "bg-page/30" : "bg-line"}`} aria-hidden="true">
                  <div className="h-0.5 bg-ok" style={{ width: `${pct}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {selected && (
        <div className="space-y-8 min-w-0">
          <div className="space-y-3 border-b border-line pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <DueBadge due={selected.due} open={selected.open} />
              {(selected.classes || []).length > 0 && <span className="text-[13px] font-mono opacity-60">{selected.classes.join(" · ")}</span>}
            </div>
            <h2 className="text-[30px] font-normal tracking-tight leading-tight">{selected.title}</h2>
            <div className="flex flex-wrap gap-4 font-mono text-[13px] uppercase">
              <a href={`?assignment=${selected.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-accent">
                [ 과제 열기 <ArrowUpRight className="w-3 h-3" /> ]
              </a>
              <button type="button" onClick={() => copyLink(selected)} className="hover:text-accent">[ 학생용 주소 복사 ]</button>
            </div>
          </div>
          <HomeworkReport key={selected.id} homework={selected} settings={settings} />
        </div>
      )}
    </div>
  );
}

function TotalView({ homeworks, rosters, settings, lacking }) {
  // 오래된 과제부터 왼쪽에
  const ordered = useMemo(() => [...homeworks].reverse(), [homeworks]);
  const classIds = useMemo(
    () => sortClassIds([...settings.map((c) => c.id), ...homeworks.flatMap((h) => h.classes || [])]),
    [settings, homeworks]
  );
  const [classId, setClassId] = useState(null);
  const [sort, setSort] = useState("num");
  const current = classId && classIds.includes(classId) ? classId : classIds[0];

  if (!current) return <p className="py-12 font-mono text-[14px] opacity-50">반 설정을 하거나, 대상 반을 고른 과제를 올리면 누적 현황을 볼 수 있어요.</p>;

  const size = settings.find((c) => c.id === current)?.size || 0;
  const table = cumulativeTable(current, size, ordered, rosters, lacking);
  const rows = sort === "missing" ? [...table.rows].sort((a, b) => b.missing - a.missing || a.num - b.num) : table.rows;
  const n = table.columns.length;

  const exportCsv = () => {
    const mark = { ok: "O", late: "△", lacking: "부족", none: "X" };
    const out = [["번호", "학번", ...table.columns.map((h) => h.title), "제출", "미제출"]];
    for (const r of table.rows) out.push([r.num, r.studentNum, ...r.cells.map((c) => mark[c]), r.done, r.missing]);
    downloadText(`${classLabel(current)}_과제누적.csv`, toCsv(out));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {classIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setClassId(id)}
            aria-pressed={current === id}
            className={`min-w-[52px] px-3 py-2 border font-mono text-[14px] transition-colors ${current === id ? "bg-ink text-page border-ink" : "border-line hover:border-ink"}`}
          >
            {id}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <GridLegend />
        <div className="flex items-center gap-4 text-[14px]">
          {[["num", "번호순"], ["missing", "미제출 많은 순"]].map(([id, l]) => (
            <button key={id} type="button" onClick={() => setSort(id)} aria-pressed={sort === id} className={`pb-0.5 ${sort === id ? "border-b border-ink" : "text-ink-muted hover:text-ink"}`}>
              {l}
            </button>
          ))}
          <button type="button" onClick={exportCsv} className="border border-line px-3 py-1.5 font-mono text-[13px] uppercase hover:border-ink">[ csv ]</button>
        </div>
      </div>

      {n === 0 ? (
        <p className="py-8 font-mono text-[14px] opacity-50">{classLabel(current)}이(가) 대상인 과제가 아직 없어요.</p>
      ) : rows.length === 0 ? (
        <p className="py-8 font-mono text-[14px] opacity-50">인원이 설정되지 않았고 제출도 없어요. "반 설정"에서 인원을 넣어 주세요.</p>
      ) : (
        <>
          <ol className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] opacity-70">
            {table.columns.map((h, i) => (
              <li key={h.id}><span className="font-mono">#{i + 1}</span> {h.title}</li>
            ))}
          </ol>
          <div className="overflow-x-auto border border-line custom-scrollbar">
            <table className="text-[13px] font-mono border-collapse min-w-full">
              <thead className="bg-surface">
                <tr>
                  <th className="sticky left-0 bg-surface text-left font-normal px-3 py-2 border-b border-line">번호</th>
                  {table.columns.map((h, i) => (
                    <th key={h.id} title={h.title} className="font-normal px-1 py-2 border-b border-line w-9">#{i + 1}</th>
                  ))}
                  <th className="font-normal px-3 py-2 border-b border-line text-right whitespace-nowrap">제출</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.num} className={`border-b border-line last:border-0 ${r.missing >= 2 ? "bg-danger/5" : ""}`}>
                    <td className="sticky left-0 bg-page px-3 py-1.5 whitespace-nowrap">
                      {r.num}번 <span className="opacity-40">{r.studentNum}</span>
                    </td>
                    {r.cells.map((c, i) => (
                      <td key={i} className="px-1 py-1.5 text-center">
                        <span title={`${table.columns[i].title}: ${STATE_LABEL[c]}`} className={`inline-block w-5 h-5 align-middle ${CELL[c]}`} />
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-right whitespace-nowrap ${r.missing >= 2 ? "text-danger font-bold" : ""}`}>
                      {r.done}/{n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] font-mono opacity-50">두 번 이상 안 낸 학생은 줄이 붉게 표시돼요. 기한 후 제출과 내용 부족도 제출로 셉니다.</p>
        </>
      )}
    </div>
  );
}

function ClassSettingsView({ settings }) {
  const { toast } = useDialog();
  const [rows, setRows] = useState(settings);
  const [range, setRange] = useState({ grade: "1", from: "1", to: "9", size: "28" });
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(normalizeClassSettings(rows)) !== JSON.stringify(settings);

  const addRange = () => {
    const added = classRange(range.grade, range.from, range.to, range.size);
    if (added.length === 0) return toast("학년(1~9)·반·인원을 확인해 주세요.", "error");
    setRows(normalizeClassSettings([...rows, ...added]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveClassSettings(rows);
      toast("반 설정을 저장했어요.", "success");
    } catch (err) {
      console.error("save class settings:", err);
      toast("저장하지 못했어요. 보안 규칙 게시 여부를 확인해 주세요.", "error");
    } finally {
      setSaving(false);
    }
  };

  const input = "bg-transparent border border-line px-2 py-2 font-mono text-[14px] outline-none focus:border-ink w-16 text-center";
  return (
    <div className="max-w-2xl space-y-8">
      <p className="text-[14px] opacity-70 leading-relaxed">
        수업하는 반과 인원을 넣어 두면 과제마다 번호 칸이 인원만큼 생기고, 과제를 올릴 때 대상 반을 고를 수 있어요. 학생은 이 설정을 볼 수 없어요.
      </p>

      <div className="border border-line bg-surface p-5 space-y-3">
        <div className="text-[13px] font-mono opacity-60 uppercase tracking-widest">한꺼번에 추가</div>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <input aria-label="학년" className={input} value={range.grade} onChange={(e) => setRange({ ...range, grade: e.target.value })} />학년
          <input aria-label="시작 반" className={input} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />반 ~
          <input aria-label="끝 반" className={input} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />반, 각
          <input aria-label="인원" className={input} value={range.size} onChange={(e) => setRange({ ...range, size: e.target.value })} />명
          <button type="button" onClick={addRange} className="ml-2 bg-black text-white px-4 py-2 font-mono text-[13px] uppercase hover:bg-accent">add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="font-mono text-[14px] opacity-50">아직 설정한 반이 없어요.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 border border-line px-3 py-2">
              <span className="font-mono text-[15px]">{c.id}</span>
              <span className="flex items-center gap-1 text-[13px]">
                <input
                  aria-label={`${classLabel(c.id)} 인원`}
                  type="number" min={1} max={CLASS_SIZE_MAX}
                  className={`${input} w-14 py-1`}
                  value={c.size}
                  onChange={(e) => setRows(rows.map((r) => (r.id === c.id ? { ...r, size: e.target.value } : r)))}
                />
                명
                <button type="button" aria-label={`${c.id} 삭제`} onClick={() => setRows(rows.filter((r) => r.id !== c.id))} className="ml-1 text-danger font-mono">×</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-4">
        <button type="button" onClick={save} disabled={!dirty || saving} className="bg-black text-white px-8 py-3 font-mono text-[14px] uppercase hover:bg-accent disabled:opacity-40 disabled:hover:bg-black">
          {saving ? "saving..." : "save"}
        </button>
        {dirty && <span className="text-[13px] font-mono text-accent">저장하지 않은 변경이 있어요</span>}
      </div>
    </div>
  );
}

export default function HomeworkManager() {
  const { list: homeworks, loaded } = useHomeworkList();
  const { classes: settings, loaded: settingsLoaded } = useClassSettings(true);
  const rosters = useAllRosters(homeworks.map((h) => h.id));
  const { lacking } = useHomeworkMarks(true);
  const [view, setView] = useState("each");

  return (
    <div className="min-h-screen bg-page text-ink font-sans font-light selection:bg-accent selection:text-white pb-32">
      <header className="w-full border-b border-line px-4 md:px-8 py-6 flex justify-between items-center gap-4">
        <button onClick={() => window.close()} className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-widest hover:text-accent transition-colors">
          <ArrowLeft className="w-4 h-4" /> close window
        </button>
        <span className="font-mono text-[13px] uppercase tracking-widest opacity-50">assignments</span>
      </header>

      <main className="max-w-[1360px] mx-auto px-4 md:px-10 pt-10 md:pt-14 w-full space-y-10 ui-enter">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-line pb-6">
          <h1 className="text-[34px] md:text-[42px] font-normal tracking-tight">과제 관리</h1>
          <div className="flex gap-8 text-[18px] tracking-tight overflow-x-auto whitespace-nowrap">
            {VIEWS.map((v) => (
              <button key={v.id} onClick={() => setView(v.id)} aria-pressed={view === v.id} className={`pb-1 transition-colors ${view === v.id ? "border-b border-ink text-ink" : "text-nav hover:text-nav-active"}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {!loaded || !settingsLoaded ? (
          <p className="font-mono text-[14px] opacity-40 uppercase tracking-widest">loading...</p>
        ) : view === "each" ? (
          <EachView homeworks={homeworks} rosters={rosters} settings={settings} />
        ) : view === "total" ? (
          <TotalView homeworks={homeworks} rosters={rosters} settings={settings} lacking={lacking} />
        ) : (
          <ClassSettingsView key={JSON.stringify(settings)} settings={settings} />
        )}
      </main>
    </div>
  );
}
