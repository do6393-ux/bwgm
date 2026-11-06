// 과제 화면 (?assignment=ID, 새 탭).
//   학생: 과제 내용 → 제출 칸 → 제출 확인 목록(학번·가린 이름·시각만, 내용은 안 보임)
//   교사: 과제 고치기·마감, 반별 제출 현황과 제출물 원본 (HomeworkReport)
import { useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { useDialog } from "@/components/ui/dialogContext";
import DetailPlaceholder from "@/components/editor/DetailPlaceholder";
import {
  NAME_MAX,
  TEXT_MAX,
  classLabel,
  dueInfo,
  formatTime,
  isLate,
  normalizeStudentNum,
  parseStudentNum,
  sortSubmissions,
  validateSubmission,
} from "@/lib/homework";
import { saveHomework, setHomeworkOpen, submitHomework, useClassSettings, useHomework, useHomeworkEntries } from "@/lib/homeworkApi";
import HomeworkForm from "./HomeworkForm";
import HomeworkReport from "./HomeworkReport";
import LinkifiedText from "./LinkifiedText";

const label = "block text-[13px] font-mono opacity-60 mb-3 uppercase tracking-widest";
const underline = "w-full bg-transparent border-b border-line py-3 text-[18px] outline-none focus:border-ink transition-colors";

export function DueBadge({ due, open }) {
  const info = dueInfo(due);
  if (open === false) return <span className="px-2 py-1 text-[11px] font-mono uppercase tracking-widest border border-line opacity-60">마감</span>;
  if (!info) return <span className="px-2 py-1 text-[11px] font-mono uppercase tracking-widest border border-ok text-ok-strong">제출 중</span>;
  const tone = info.days < 0 ? "border-line opacity-60" : info.days <= 2 ? "bg-accent border-accent text-white" : "border-ink";
  return (
    <span className={`px-2 py-1 text-[11px] font-mono uppercase tracking-widest border whitespace-nowrap ${tone}`}>
      ~{info.date} · {info.label}
    </span>
  );
}

function SubmitForm({ homework, onDone }) {
  const { toast } = useDialog();
  const [studentNum, setStudentNum] = useState("");
  const [studentName, setStudentName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const parsed = parseStudentNum(studentNum);
  const wrongClass = parsed && homework.classes?.length > 0 && !homework.classes.includes(parsed.classId);
  const info = dueInfo(homework.due);

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateSubmission({ studentNum, studentName, text });
    if (problem) return setError(problem);
    setError(null);
    setSending(true);
    try {
      const entry = await submitHomework(homework.id, { studentNum, studentName, text });
      setText("");
      onDone(entry);
      toast("과제를 제출했어요.", "success");
    } catch (err) {
      console.error("homework submit:", err);
      setError(
        err?.code === "permission-denied"
          ? "제출할 수 없어요. 과제가 마감됐거나 입력 형식이 맞지 않아요."
          : "제출하지 못했어요. 잠시 후 다시 시도해 주세요. (쓴 내용은 그대로 남아 있어요)"
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-line bg-surface p-6 md:p-10 space-y-8">
      <div className="grid grid-cols-2 gap-6 md:gap-8">
        <div>
          <label htmlFor="sub-id" className={label}>학번</label>
          <input
            id="sub-id" type="text" inputMode="numeric" autoComplete="off" placeholder="예: 10307" maxLength={7}
            value={studentNum} onChange={(e) => setStudentNum(normalizeStudentNum(e.target.value))} className={`${underline} font-mono`}
          />
          {parsed && <p className={`mt-2 text-[12px] font-mono ${wrongClass ? "text-danger" : "opacity-50"}`}>{classLabel(parsed.classId)} {parsed.num}번{wrongClass && " · 이 과제 대상 반이 아니에요"}</p>}
        </div>
        <div>
          <label htmlFor="sub-name" className={label}>이름</label>
          <input id="sub-name" type="text" autoComplete="off" placeholder="홍길동" maxLength={NAME_MAX} value={studentName} onChange={(e) => setStudentName(e.target.value)} className={underline} />
        </div>
      </div>
      <div>
        <label htmlFor="sub-text" className={label}>과제 내용</label>
        <textarea
          id="sub-text" placeholder="과제를 여기에 적으세요..." maxLength={TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)}
          className="w-full bg-page border border-line p-4 text-[16px] outline-none focus:border-ink transition-colors h-48 resize-y leading-relaxed"
        />
        <div className="text-right text-[12px] font-mono opacity-40">{text.length} / {TEXT_MAX}</div>
      </div>
      {info && info.days < 0 && <p className="text-[13px] text-danger">마감일이 지났어요. 지금 내면 "기한 후 제출"로 표시돼요.</p>}
      {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
      <button type="submit" disabled={sending} className="bg-black text-white px-8 py-4 text-[15px] font-mono uppercase tracking-widest w-full hover:bg-accent transition-colors disabled:opacity-50">
        {sending ? "sending..." : "제출하기"}
      </button>
      <p className="text-[12px] font-mono opacity-50 leading-relaxed">
        제출한 내용은 선생님만 볼 수 있어요. 아래 목록에는 학번과 가린 이름만 보여요. 고칠 내용이 있으면 다시 제출하면 돼요(선생님은 마지막 것까지 모두 봐요).
      </p>
    </form>
  );
}

function RosterList({ homework, mine }) {
  const { list, loaded, error } = useHomeworkEntries(homework.id, "roster");
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const q = normalizeStudentNum(search);
    const l = q ? list.filter((s) => s.studentNum.startsWith(q)) : list;
    return sortSubmissions(l, "new");
  }, [list, search]);
  const mineIds = new Set(mine.map((m) => m.id));

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <h3 className="text-[24px] font-normal tracking-tight">
          제출 확인 <span className="font-mono text-[14px] opacity-50">[{list.length}]</span>
        </h3>
        <input
          type="search" inputMode="numeric" placeholder="내 학번으로 찾기" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-44 bg-transparent border-b border-line py-1.5 text-[14px] font-mono outline-none focus:border-ink"
        />
      </div>
      {error ? (
        <p className="text-[14px] font-mono opacity-50">목록을 불러오지 못했어요.</p>
      ) : !loaded ? (
        <p className="text-[14px] font-mono opacity-40 uppercase tracking-widest">loading...</p>
      ) : shown.length === 0 ? (
        <p className="text-[14px] font-mono opacity-40">{search ? "이 학번으로 낸 제출이 없어요." : "아직 아무도 내지 않았어요."}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((s) => (
            <li key={s.id} className={`flex items-center justify-between gap-3 py-3 px-2 text-[15px] ${mineIds.has(s.id) ? "bg-ok/10" : ""}`}>
              <span className="flex items-center gap-3">
                <Check className="w-4 h-4 text-ok-strong shrink-0" aria-hidden="true" />
                <span className="font-mono">{s.studentNum}</span>
                <span>{s.maskedName}</span>
                {mineIds.has(s.id) && <span className="text-[11px] font-mono text-ok-strong">방금 제출</span>}
              </span>
              <span className="text-[12px] font-mono opacity-50 flex items-center gap-2">
                {isLate(s.at, homework.due) && <span className="px-1 bg-warn text-black opacity-100">기한 후</span>}
                {formatTime(s.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function HomeworkView({ homeworkId, currentUser }) {
  const { toast } = useDialog();
  const { homework, error } = useHomework(homeworkId);
  const isTeacher = !!currentUser;
  const { classes: settings } = useClassSettings(isTeacher);
  const [editing, setEditing] = useState(false);
  const [mine, setMine] = useState([]); // 이 창에서 방금 낸 제출 (목록에서 표시)

  if (!homework) return <DetailPlaceholder error={error} />;

  const toggleOpen = async () => {
    try {
      await setHomeworkOpen(homework.id, homework.open === false);
      toast(homework.open === false ? "다시 제출을 받아요." : "제출을 마감했어요.", "success");
    } catch (err) {
      console.error("toggle open:", err);
      toast("바꾸지 못했어요.", "error");
    }
  };

  return (
    <div className="min-h-screen bg-page text-ink font-sans font-light selection:bg-accent selection:text-white pb-32">
      <header className="w-full border-b border-line px-4 md:px-8 py-6 flex justify-between items-center gap-4">
        <button onClick={() => window.close()} className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-widest hover:text-accent transition-colors">
          <ArrowLeft className="w-4 h-4" /> close window
        </button>
        {isTeacher && !editing && (
          <div className="flex flex-wrap justify-end gap-4 font-mono text-[13px] uppercase tracking-widest">
            <button onClick={toggleOpen} className="hover:text-accent">{homework.open === false ? "[ 다시 열기 ]" : "[ 마감하기 ]"}</button>
            <button onClick={() => setEditing(true)} className="hover:text-accent">[ edit ]</button>
            <a href="?manage=assignments" target="_blank" rel="noreferrer" className="hover:text-accent">[ manage ]</a>
          </div>
        )}
      </header>

      <main className="max-w-[1000px] mx-auto px-4 md:px-6 pt-12 md:pt-16 w-full space-y-16 ui-enter">
        {editing ? (
          <HomeworkForm
            initial={homework}
            classOptions={settings}
            showOpen
            submitLabel="save"
            onCancel={() => setEditing(false)}
            onSubmit={async (data) => {
              await saveHomework(homework.id, data);
              setEditing(false);
              toast("저장했어요.", "success");
            }}
          />
        ) : (
          <article className="space-y-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-1 text-[11px] font-mono uppercase tracking-widest bg-black text-white">assignment</span>
                <DueBadge due={homework.due} open={homework.open} />
                {(homework.classes || []).length > 0 && (
                  <span className="text-[13px] font-mono opacity-60">{homework.classes.join(" · ")}</span>
                )}
              </div>
              <h1 className="text-[32px] md:text-[42px] font-normal tracking-tight leading-tight">{homework.title}</h1>
            </div>
            {homework.body ? (
              <LinkifiedText text={homework.body} className="text-[17px] leading-[1.8]" />
            ) : (
              <p className="text-[14px] font-mono opacity-40">과제 안내가 없어요.</p>
            )}
          </article>
        )}

        {isTeacher ? (
          <section className="space-y-6">
            <h3 className="text-[24px] font-normal tracking-tight border-b border-line pb-4">제출 현황</h3>
            <HomeworkReport homework={homework} settings={settings} />
          </section>
        ) : (
          <>
            {homework.open === false ? (
              <p className="border border-line p-8 text-center font-mono text-[14px] opacity-60">제출이 마감된 과제예요.</p>
            ) : (
              <section className="space-y-6">
                <h3 className="text-[24px] font-normal tracking-tight border-b border-line pb-4">과제 제출</h3>
                {mine.length > 0 && (
                  <div role="status" className="border border-ok bg-ok/10 p-5 flex items-center gap-3 text-[15px]">
                    <Check className="w-5 h-5 text-ok-strong shrink-0" />
                    <span>
                      <b className="font-mono">{mine[0].studentNum} {mine[0].maskedName}</b> 제출 완료 · {formatTime(mine[0].at)}
                    </span>
                  </div>
                )}
                <SubmitForm homework={homework} onDone={(entry) => setMine((m) => [entry, ...m])} />
              </section>
            )}
            <RosterList homework={homework} mine={mine} />
          </>
        )}
      </main>
    </div>
  );
}
