import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DialogContext } from "@/components/ui/dialogContext";
import { dateKey } from "@/lib/workCalendar";
import WorkCalendar from "./WorkCalendar";
import EventModal from "./EventModal";

// 화면이 에러 없이 그려지는지만 보는 스모크 테스트 (Firebase 는 가짜로 대체, 효과(effect)는 서버 렌더링에서 돌지 않는다)
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
}));

const render = (element) =>
  renderToStaticMarkup(<DialogContext.Provider value={{ toast: vi.fn(), confirm: vi.fn() }}>{element}</DialogContext.Provider>);

const tasks = [
  { id: "t1", title: "NAC 관리", part: "head" },
  { id: "t2", title: "학생노트북 점검", part: "device" },
  { id: "t3", title: "예전 카드", part: undefined }, // part 없는 카드는 공통
];

describe("WorkCalendar", () => {
  it("이번 달 달력과 파트 필터, 일정 추가 버튼을 그린다", () => {
    const html = render(<WorkCalendar tasks={tasks} canEdit />);
    const today = dateKey(new Date());
    expect(html).toContain(`${today.slice(0, 4)}년 ${Number(today.slice(5, 7))}월`);
    for (const w of ["일", "월", "화", "수", "목", "금", "토"]) expect(html).toContain(`>${w}<`);
    expect(html).toContain("일정 추가");
    for (const label of ["전체", "부장", "정보기획", "정보화기기·소모품", "나이스·정보공시", "공통"]) expect(html).toContain(label);
    expect(html).toContain("마감 임박"); // 첫 응답 전에는 숫자 대신 자리 표시
    expect(html).toMatch(/aria-pressed="true" title="나이스에 학교가 넣은 학사일정/); // 학사일정은 처음에 켜져 있다
    expect(html).toContain("학사일정 · 나이스"); // 그달 학사일정 목록 (받기 전에는 자리 표시)
  });

  it("권한이 없으면 일정 추가 버튼이 없고 날짜 칸이 눌리지 않는다", () => {
    const html = render(<WorkCalendar tasks={tasks} canEdit={false} />);
    expect(html).not.toContain("일정 추가");
    expect(html).toContain("disabled");
  });
});

describe("EventModal", () => {
  it("카드에서 넣을 때: 카드가 선택돼 있고 이름이 채워지며, 카드는 파트별로 묶인다", () => {
    const html = render(<EventModal initial={{ taskId: "t1", title: "NAC 관리", part: "head" }} tasks={tasks} onClose={() => {}} />);
    expect(html).toContain("달력에 넣기");
    expect(html).toMatch(/<option value="t1" selected/);
    expect(html).toContain('value="NAC 관리"');
    expect(html).toContain("🧭 부장"); // optgroup 라벨
    expect(html).toContain("학생노트북 점검");
    expect(html).toContain("예전 카드"); // part 없는 카드도 목록에서 사라지지 않는다
    expect(html).toContain("(자동)"); // 시작일은 아직 안 골랐으니 자동 표시
    expect(html).not.toContain("완료했음");
    expect(html).not.toContain("[ DEL ]");
    expect(html).toContain("카드 열기");
  });

  it("수정할 때: 완료 체크와 삭제가 있고 시작일은 저장된 값을 쓴다", () => {
    const html = render(
      <EventModal
        initial={{ id: "e1", taskId: "gone", title: "파기 보고", part: "nais", start: "2026-11-02", end: "2026-11-27", note: "공문 123호", done: false }}
        tasks={tasks}
        onClose={() => {}}
      />
    );
    expect(html).toContain("일정 수정");
    expect(html).toContain("완료했음");
    expect(html).toContain("[ DEL ]");
    expect(html).toContain("(삭제된 카드)"); // 카드가 지워진 일정도 열린다
    expect(html).toContain('value="2026-11-02"');
    expect(html).toContain('value="2026-11-27"');
    expect(html).not.toContain("(자동)");
    expect(html).not.toContain("카드 열기"); // 없는 카드는 열 수 없다
  });
});
