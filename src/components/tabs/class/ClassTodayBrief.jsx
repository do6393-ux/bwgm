// 정보 수업 홈의 "오늘 한눈에" (학생용): 지금 낼 과제 · 최근 올라온 자료.
// 과제를 누르면 새 탭에서 제출 화면(?assignment=ID), 자료를 누르면 자료 화면(?lesson=ID)이 열린다.
// "과제 →", "자료실 →" 은 같은 화면의 작은 탭으로 옮긴다.
import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useHomeworkList } from "@/lib/homeworkApi";
import { dateKey } from "@/lib/workCalendar";
import { openHomework } from "@/lib/homework";
import { recentLessons, unitLabel } from "@/lib/lessons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { DueBadge } from "@/components/homework/HomeworkView";

const HOMEWORK_LIMIT = 3;
const LESSON_LIMIT = 4;
const NEW_DAYS = 7; // 이 기간 안에 올라온 자료에 NEW 표시

function Panel({ title, action, children }) {
  return (
    <section className="space-y-4 min-w-0">
      <div className="flex items-end justify-between gap-3 border-b border-line pb-3">
        <h3 className="text-[20px] md:text-[22px] font-normal tracking-tight">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoreButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 font-mono text-[13px] opacity-50 hover:opacity-100 hover:text-accent transition">
      {children} <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}

export default function ClassTodayBrief({ lessons, lessonsLoaded, onOpenSubtab }) {
  const [openedAt] = useState(() => Date.now()); // 화면을 연 시각 (오늘 날짜·NEW 기준)
  const today = dateKey(new Date(openedAt));
  const { list, loaded } = useHomeworkList();
  const homework = useMemo(() => openHomework(list, today), [list, today]);
  const recent = useMemo(() => recentLessons(lessons, LESSON_LIMIT), [lessons]);
  const newSince = openedAt - NEW_DAYS * 86400000;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
      <Panel title="지금 낼 과제" action={<MoreButton onClick={() => onOpenSubtab("homework")}>과제</MoreButton>}>
        {!loaded ? (
          <SkeletonGroup label="과제를 불러오는 중" className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </SkeletonGroup>
        ) : homework.length === 0 ? (
          <p className="py-8 text-center text-[14px] font-mono opacity-40">지금 받는 과제가 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {homework.slice(0, HOMEWORK_LIMIT).map((h) => (
              <li key={h.id}>
                <a
                  href={`?assignment=${h.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 border border-line px-4 py-3.5 hover:border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                >
                  <span className="min-w-0 flex-1 truncate text-[16px] font-medium group-hover:text-accent transition-colors">{h.title}</span>
                  <DueBadge due={h.due} open={h.open} />
                  <ArrowUpRight className="w-4 h-4 shrink-0 opacity-30 group-hover:opacity-100 transition-opacity" />
                </a>
              </li>
            ))}
            {homework.length > HOMEWORK_LIMIT && (
              <li className="pt-1 font-mono text-[12px] opacity-50">외 {homework.length - HOMEWORK_LIMIT}개는 과제 탭에서 볼 수 있어요.</li>
            )}
          </ul>
        )}
      </Panel>

      <Panel title="최근 올라온 자료" action={<MoreButton onClick={() => onOpenSubtab("lessons")}>자료실</MoreButton>}>
        {!lessonsLoaded ? (
          <SkeletonGroup label="자료를 불러오는 중" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </SkeletonGroup>
        ) : recent.length === 0 ? (
          <p className="py-8 text-center text-[14px] font-mono opacity-40">아직 올라온 자료가 없어요.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recent.map((l) => {
              const at = l.createdAt?.toMillis?.();
              const isNew = Number.isFinite(at) && at >= newSince;
              return (
                <li key={l.id}>
                  <a
                    href={`?lesson=${l.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col gap-2 h-full border border-line bg-surface p-4 hover:border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                  >
                    <span className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="px-1.5 py-0.5 bg-black text-white uppercase tracking-widest">{l.unit || "unit"}</span>
                      {isNew && <span className="px-1.5 py-0.5 bg-accent text-white">NEW</span>}
                      <span className="ml-auto opacity-40 truncate">{l.lessonNum}</span>
                    </span>
                    <span className="text-[16px] font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors">{l.title}</span>
                    <span className="mt-auto text-[12px] opacity-40 truncate">{unitLabel(l.unit)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
