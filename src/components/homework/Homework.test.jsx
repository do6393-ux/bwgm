import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DialogContext } from "@/components/ui/dialogContext";
import { buildClassGrid } from "@/lib/homework";
import ClassGrid from "./ClassGrid";
import HomeworkForm from "./HomeworkForm";
import HomeworkSection from "./HomeworkSection";
import HomeworkManager from "./HomeworkManager";
import HomeworkView from "./HomeworkView";
import LinkifiedText from "./LinkifiedText";

// 화면이 에러 없이 그려지는지만 보는 스모크 테스트 (Firebase 는 가짜, effect 는 서버 렌더링에서 돌지 않는다)
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => {
  const fn = () => vi.fn();
  return {
    addDoc: fn(), collection: fn(), doc: fn(), getDocs: fn(), orderBy: fn(), query: fn(),
    serverTimestamp: fn(), setDoc: fn(), updateDoc: fn(), writeBatch: fn(),
    onSnapshot: vi.fn(() => () => {}),
  };
});

const render = (el) => renderToStaticMarkup(<DialogContext.Provider value={{ toast: vi.fn(), confirm: vi.fn() }}>{el}</DialogContext.Provider>);
const theme = { activeText: "text-nav-active" };

describe("과제 화면들", () => {
  it("수업 탭 과제 칸: 학생에게는 올리기·관리 버튼이 없다", () => {
    const student = render(<HomeworkSection currentUser={null} currentTheme={theme} />);
    expect(student).toContain(">과제<");
    expect(student).not.toContain("[ + add ]");
    expect(student).not.toContain("manage");
    const teacher = render(<HomeworkSection currentUser={{ uid: "t" }} currentTheme={theme} />);
    expect(teacher).toContain("[ + add ]");
    expect(teacher).toContain("?manage=assignments");
  });

  it("과제 화면은 불러오는 동안 자리 표시를 보여 준다", () => {
    expect(render(<HomeworkView homeworkId="h1" currentUser={null} />)).toContain("불러오는 중");
  });

  it("관리 화면 탭", () => {
    const html = render(<HomeworkManager />);
    for (const t of ["과제 관리", "과제별 현황", "누적 현황", "반 설정"]) expect(html).toContain(t);
  });

  it("과제 입력: 반 설정이 있으면 학년별로 반을 고른다", () => {
    const html = render(<HomeworkForm classOptions={[{ id: "1-1", size: 3 }, { id: "1-2", size: 3 }, { id: "2-1", size: 3 }]} initial={{ classes: ["1-2"] }} onSubmit={() => {}} />);
    expect(html).toContain("1학년 전체");
    expect(html).toContain("2학년 전체");
    expect(html).toMatch(/aria-pressed="true"[^>]*>1-2</);
    const empty = render(<HomeworkForm onSubmit={() => {}} />);
    expect(empty).toContain("반 설정");
  });

  it("반별 칸: 제출·지각·미제출 칸과 미제출 번호", () => {
    const grid = buildClassGrid([{ id: "1-3", size: 3 }], [
      { id: "a", studentNum: "10301", at: new Date(2026, 10, 1).getTime() },
      { id: "b", studentNum: "10303", at: new Date(2026, 10, 30).getTime() },
    ], "2026-11-20");
    const html = render(<ClassGrid grid={grid} />);
    expect(html).toContain("1학년 3반");
    expect(html).toContain('aria-label="1번 제출"');
    expect(html).toContain('aria-label="2번 미제출"');
    expect(html).toContain('aria-label="3번 기한 후 제출"');
    expect(html).toMatch(/미제출 1명 <\/span>2번/);
  });

  it("링크는 누를 수 있게, HTML 은 글자 그대로", () => {
    const html = render(<LinkifiedText text={"제출: https://forms.gle/abc. <b>굵게</b>"} />);
    expect(html).toContain('href="https://forms.gle/abc"');
    expect(html).toContain("&lt;b&gt;");
  });
});
