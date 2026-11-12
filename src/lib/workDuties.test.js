import { describe, expect, it } from "vitest";
import {
  DUTIES,
  ROLE_PARTS,
  ROLE_TOOLS,
  TOOLS,
  WHEN_OPTIONS,
  dutyDocId,
  findDuty,
  groupCards,
  isBlankDutyDoc,
  isLate,
  matchesQuery,
  monthTodos,
  nextTodo,
  patchTodo,
  sortTodos,
  takenDutyKeys,
  todoProgress,
  validateTodo,
  visibleParts,
  whenIndex,
} from "./workDuties";
import { PARTS } from "./workParts";

const todo = (id, when, done = false) => ({ id, when, text: `${when} 할 일 ${id}`, done });

describe("업무분장 목록", () => {
  it("보직 4개가 모두 업무분장 파트에 있다", () => {
    const partIds = PARTS.map((p) => p.id);
    for (const part of ROLE_PARTS) {
      expect(partIds).toContain(part);
      expect(DUTIES[part].length).toBeGreaterThan(0);
    }
  });

  it("업무분장 파일의 세부 업무 수 그대로다 (10 · 8 · 7 · 5)", () => {
    expect(ROLE_PARTS.map((p) => DUTIES[p].length)).toEqual([10, 8, 7, 5]);
  });

  it("key 는 전체에서 겹치지 않고 문서 ID 로 쓸 수 있는 글자만 쓴다", () => {
    const keys = ROLE_PARTS.flatMap((p) => DUTIES[p].map((x) => x.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(dutyDocId(key)).toMatch(/^duty_[a-z0-9-]+$/);
  });

  it("도구 이름은 TOOLS 에 있는 것만 쓴다", () => {
    for (const part of ROLE_PARTS) {
      for (const tool of ROLE_TOOLS[part]) expect(TOOLS[tool]).toBeTruthy();
      for (const duty of DUTIES[part]) if (duty.tool) expect(TOOLS[duty.tool]).toBeTruthy();
    }
  });

  it("key 로 항목과 보직을 찾는다", () => {
    expect(findDuty("device-ip")).toMatchObject({ part: "device", title: "IP 주소 관리 및 내PC지킴이 실행 통계" });
    expect(findDuty("없는값")).toBeNull();
    expect(findDuty(undefined)).toBeNull();
  });
});

describe("보이는 보직 탭", () => {
  it("관리자 · 부장 · 보직 미정은 4개 다", () => {
    expect(visibleParts({ admin: true, workRole: "plan" })).toEqual(ROLE_PARTS);
    expect(visibleParts({ admin: false, workRole: "head" })).toEqual(ROLE_PARTS);
    expect(visibleParts({ admin: false, workRole: undefined })).toEqual(ROLE_PARTS);
    expect(visibleParts({ admin: false, workRole: "이상한값" })).toEqual(ROLE_PARTS);
  });

  it("다른 보직은 자기 것 하나", () => {
    expect(visibleParts({ admin: false, workRole: "nais" })).toEqual(["nais"]);
  });
});

describe("해야 할 일", () => {
  it("시기는 학년도 순서 (3월이 처음, 2월 다음 수시)", () => {
    expect(WHEN_OPTIONS[0]).toBe("3월");
    expect(whenIndex("2월")).toBe(11);
    expect(whenIndex("수시")).toBe(12);
    expect(whenIndex("모름")).toBe(12);
  });

  it("학년도 순서로 늘어놓고, 같은 시기는 적은 순서대로", () => {
    const list = [todo("a", "수시"), todo("b", "1월"), todo("c", "3월"), todo("d", "1월")];
    expect(sortTodos(list).map((t) => t.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("진행 정도", () => {
    expect(todoProgress([todo("a", "3월", true), todo("b", "4월")])).toEqual({ done: 1, total: 2 });
    expect(todoProgress(undefined)).toEqual({ done: 0, total: 0 });
  });

  it("이번 달보다 앞선 달에 안 한 일은 지난 일 (수시 · 다음 학년도 1~2월은 아님)", () => {
    expect(isLate(todo("a", "10월"), 11)).toBe(true);
    expect(isLate(todo("a", "10월", true), 11)).toBe(false);
    expect(isLate(todo("a", "11월"), 11)).toBe(false);
    expect(isLate(todo("a", "수시"), 11)).toBe(false);
    expect(isLate(todo("a", "2월"), 11)).toBe(false);
    expect(isLate(todo("a", "12월"), 1)).toBe(true); // 1월에 보면 12월은 지났다
  });

  it("다음 할 일: 지난 일이 먼저, 없으면 가장 가까운 일", () => {
    const list = [todo("a", "3월", true), todo("b", "12월"), todo("c", "10월"), todo("d", "수시")];
    expect(nextTodo(list, 11)).toMatchObject({ todo: { id: "c" }, late: true });
    expect(nextTodo(list.slice(0, 2), 11)).toMatchObject({ todo: { id: "b" }, late: false });
    expect(nextTodo([todo("a", "3월", true)], 11)).toBeNull();
  });

  it("이번 달에 할 일: 지난 일 + 이번 달 일만, 지난 일이 위로", () => {
    const cards = [
      { title: "카드1", task: { id: "1", todos: [todo("a", "11월"), todo("b", "12월"), todo("c", "11월", true)] } },
      { title: "카드2", duty: { key: "k2" }, task: { id: "2", todos: [todo("d", "9월"), todo("e", "수시")] } },
      { title: "아직 없는 카드", task: null },
    ];
    const rows = monthTodos(cards, 11);
    expect(rows.map((r) => [r.todo.id, r.late, r.title])).toEqual([
      ["d", true, "카드2"],
      ["a", false, "카드1"],
    ]);
    expect(rows[0].duty).toEqual({ key: "k2" }); // 줄을 눌렀을 때 어느 카드를 열지 알 수 있게 같이 넘긴다
  });

  it("하나만 고친다", () => {
    const list = [todo("a", "3월"), todo("b", "4월")];
    expect(patchTodo(list, "b", { done: true })).toEqual([todo("a", "3월"), todo("b", "4월", true)]);
  });

  it("입력 점검", () => {
    expect(validateTodo({ when: "3월", text: "공문 확인" })).toBeNull();
    expect(validateTodo({ when: "", text: "공문 확인" })).toMatch(/시기/);
    expect(validateTodo({ when: "3월", text: "   " })).toMatch(/적어/);
    expect(validateTodo({ when: "3월", text: "가".repeat(201) })).toMatch(/200자/);
    expect(validateTodo({ when: "3월", text: "공문" }, 60)).toMatch(/60개/);
  });
});

describe("카드 나누기", () => {
  // 최근 것이 앞 (createdAt 내림차순)
  const tasks = [
    { id: "new1", part: "device", title: "새로 등록한 카드" },
    { id: "dup", part: "device", duty: "device-ip", title: "같은 항목을 또 고른 카드" },
    { id: dutyDocId("device-ip"), part: "device", duty: "device-ip", title: "IP 주소 관리", todos: [todo("a", "3월")] },
    { id: "old", part: "device", duty: "device-pad", title: "예전 패드 매뉴얼" },
    { id: "com", part: "common", title: "부서 공통" },
    { id: "legacy", part: "devices", title: "예전 분류 값" },
    { id: "planCard", part: "plan", duty: "plan-homepage", title: "홈페이지" },
  ];

  it("항목마다 카드를 붙이고, 남은 것은 그 밖의 카드 · 공통으로", () => {
    const g = groupCards(tasks, "device");
    expect(g.duties).toHaveLength(7);
    expect(g.duties.find((x) => x.key === "device-ip").task.id).toBe(dutyDocId("device-ip"));
    expect(g.duties.find((x) => x.key === "device-pad").task.id).toBe("old");
    expect(g.duties.find((x) => x.key === "device-laptop").task).toBeNull();
    expect(g.others.map((t) => t.id)).toEqual(["new1", "dup"]);
    // 모르는 파트 값은 공통으로 본다 (findPart 와 같다)
    expect(g.common.map((t) => t.id)).toEqual(["com", "legacy"]);
  });

  it("duty_ 문서가 없으면 먼저 만든 카드가 그 자리에 들어간다", () => {
    const g = groupCards(
      [
        { id: "later", part: "plan", duty: "plan-board" },
        { id: "earlier", part: "plan", duty: "plan-board" },
      ],
      "plan"
    );
    expect(g.duties.find((x) => x.key === "plan-board").task.id).toBe("earlier");
    expect(g.others.map((t) => t.id)).toEqual(["later"]);
  });

  it("열어 보기만 한 빈 duty_ 문서는 예전 카드에 자리를 내주고 숨는다", () => {
    const g = groupCards(
      [
        { id: "oldNac", part: "head", duty: "head-nac", title: "NAC 매뉴얼", content: "<p>예외 등록</p>" },
        { id: dutyDocId("head-nac"), part: "head", duty: "head-nac", title: "네트워크", todos: [], content: "" },
      ],
      "head"
    );
    expect(g.duties.find((x) => x.key === "head-nac").task.id).toBe("oldNac");
    expect(g.others).toEqual([]);
    expect(isBlankDutyDoc({ id: dutyDocId("head-nac"), content: "<p><br></p>" })).toBe(true);
    expect(isBlankDutyDoc({ id: dutyDocId("head-nac"), content: '<p><img src="x"></p>' })).toBe(false);
    expect(isBlankDutyDoc({ id: "oldNac" })).toBe(false);
    // 빈 duty_ 문서만 있으면 그 항목은 아직 비어 있는 것으로 본다
    expect(takenDutyKeys([{ id: dutyDocId("head-nac"), part: "head", duty: "head-nac" }]).has("head-nac")).toBe(false);
  });

  it("이미 카드가 있는 항목 (지금 고치는 카드는 빼고)", () => {
    const taken = takenDutyKeys(tasks, "old");
    expect(taken.has("device-ip")).toBe(true);
    expect(taken.has("plan-homepage")).toBe(true);
    expect(taken.has("device-pad")).toBe(false);
  });

  it("검색: 제목 · 본문 · 첨부 이름 · 할 일까지", () => {
    const task = {
      title: "카드",
      content: "<p>NAC <b>예외</b> 등록</p>",
      attachments: [{ name: "IP배정표.xlsx" }],
      todos: [todo("a", "3월")],
    };
    expect(matchesQuery(task, "업무분장 이름", "")).toBe(true);
    expect(matchesQuery(task, "업무분장 이름", "분장")).toBe(true);
    expect(matchesQuery(task, "", "예외")).toBe(true);
    expect(matchesQuery(task, "", "ip배정")).toBe(true);
    expect(matchesQuery(task, "", "할 일 a")).toBe(true);
    expect(matchesQuery(task, "", "없는말")).toBe(false);
    expect(matchesQuery(null, "홈페이지 관리", "홈페이지")).toBe(true);
  });
});
