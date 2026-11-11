import { describe, expect, it } from "vitest";
import {
  busyIds,
  countStates,
  describeItems,
  dueBadge,
  dueChoices,
  fillRange,
  itemStates,
  loanItemsFor,
  loanMatches,
  newId,
  normalizeKinds,
  parseLines,
  pickRange,
  planKindEdit,
  recentBorrowers,
  returnedText,
  sortOpenLoans,
  stateMatchesFilter,
  validateKindName,
  validateLabel,
  validateLoan,
} from "./equipment";

const items = (labels, prefix = "t") => labels.map((label, i) => ({ id: `${prefix}${i + 1}`, label, repair: false }));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

const tablets = { id: "k1", name: "태블릿", items: items(range(1, 40)) };
const laptops = { id: "k2", name: "노트북", items: items(range(1, 20).map((n) => n.padStart(2, "0")), "n") };
const kinds = [tablets, laptops];
const TODAY = "2026-11-11"; // 수요일

const loan = (id, ids, extra = {}) => ({
  id,
  items: ids.map((iid) => {
    const k = kinds.find((kk) => kk.items.some((x) => x.id === iid));
    const it = k.items.find((x) => x.id === iid);
    return { id: iid, kindId: k.id, kindName: k.name, label: it.label };
  }),
  borrower: "2학년 3반 수업",
  outDate: "2026-11-11",
  dueDate: "2026-11-11",
  memo: "",
  returned: {},
  open: true,
  ...extra,
});

describe("newId / normalizeKinds", () => {
  it("이미 쓰는 id 는 피한다", () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const id = newId(new Set(["aaaaaaaa"]), () => seq[i++]);
    expect(id).not.toBe("aaaaaaaa");
    expect(id).toHaveLength(8);
  });

  it("깨진 데이터는 버리고 모양을 맞춘다", () => {
    expect(normalizeKinds(null)).toEqual([]);
    expect(
      normalizeKinds([{ id: "k", name: "태블릿", items: [{ id: "a", label: "1", repair: 1 }, { label: "x" }, null] }, { name: "id 없음" }])
    ).toEqual([{ id: "k", name: "태블릿", items: [{ id: "a", label: "1", repair: true }] }]);
  });
});

describe("목록 칸 (한 줄에 한 대)", () => {
  it("빈 줄·앞뒤 빈칸을 버리고 엑셀 탭은 한 칸으로 줄인다", () => {
    expect(parseLines(" 1 \n\n2\r\n  \nA\t12 ")).toEqual(["1", "2", "A 12"]);
    expect(parseLines("")).toEqual([]);
  });

  it("번호로 채우기: 앞 글자와 자릿수 맞추기", () => {
    expect(fillRange({ from: "41", to: "43" }).lines).toEqual(["41", "42", "43"]);
    expect(fillRange({ prefix: "TAB-", from: 1, to: 3, pad: true }).lines).toEqual(["TAB-01", "TAB-02", "TAB-03"]);
    expect(fillRange({ from: 98, to: 100, pad: true }).lines).toEqual(["098", "099", "100"]);
    expect(fillRange({ from: "", to: "3" }).error).toBeTruthy();
    expect(fillRange({ from: "a", to: "3" }).error).toBeTruthy();
    expect(fillRange({ from: 5, to: 3 }).error).toBeTruthy();
    expect(fillRange({ from: 1, to: 301 }).error).toBeTruthy();
  });

  it("같은 번호는 같은 기자재로 두고, 새 번호만 새로 만든다", () => {
    const old = items(["1", "2", "3"]);
    const plan = planKindEdit(old, ["1", "2", "3", "4", "5"]);
    expect(plan.kept).toBe(3);
    expect(plan.added.map((x) => x.label)).toEqual(["4", "5"]);
    expect(plan.removed).toEqual([]);
    expect(plan.items.slice(0, 3)).toEqual(old);
    expect(new Set(plan.items.map((x) => x.id)).size).toBe(5);
    expect(plan.reordered).toBe(false);
  });

  it("빠진 번호는 지우고, 빌려 가 있는 번호를 지우려 하면 blocked 에 담는다", () => {
    const old = items(["1", "2", "3"]);
    const plan = planKindEdit(old, ["1", "3"], new Set(["t2"]));
    expect(plan.removed.map((x) => x.label)).toEqual(["2"]);
    expect(plan.blocked.map((x) => x.label)).toEqual(["2"]);
  });

  it("번호를 통째로 바꾸면 전부 새로 / 전부 지움, 수리 중 표시는 같은 번호에만 남는다", () => {
    const old = [{ id: "a", label: "1", repair: true }, { id: "b", label: "2", repair: false }];
    const plan = planKindEdit(old, ["A-01", "A-02", "1"]);
    expect(plan.removed.map((x) => x.id)).toEqual(["b"]);
    expect(plan.items[2]).toEqual({ id: "a", label: "1", repair: true });
    expect(plan.added).toHaveLength(2);
  });

  it("순서만 바꾸면 reordered", () => {
    const old = items(["1", "2", "3"]);
    expect(planKindEdit(old, ["3", "1", "2"]).reordered).toBe(true);
  });

  it("새 id 는 다른 종류의 id 와도 겹치지 않는다", () => {
    const plan = planKindEdit([], ["x"], new Set(), new Set(["n1"]));
    expect(plan.added[0].id).not.toBe("n1");
  });

  it("겹치는 번호·너무 긴 번호·너무 많은 줄은 오류", () => {
    expect(planKindEdit([], ["1", "2", "1"]).error).toContain("1");
    expect(planKindEdit([], ["x".repeat(31)]).error).toBeTruthy();
    expect(planKindEdit([], range(1, 301)).error).toBeTruthy();
  });

  it("종류 이름·번호 하나 고치기 점검", () => {
    expect(validateKindName("", kinds)).toBeTruthy();
    expect(validateKindName("태블릿", kinds)).toBeTruthy();
    expect(validateKindName("태블릿", kinds, "k1")).toBeNull();
    expect(validateKindName("크롬북", kinds)).toBeNull();
    expect(validateLabel("2", tablets, "t1")).toBeTruthy();
    expect(validateLabel("1", tablets, "t1")).toBeNull();
    expect(validateLabel(" ", tablets, "t1")).toBeTruthy();
  });
});

describe("상태", () => {
  it("빌려 간 것 · 반납 지남 · 수리 중 · 일부 반납", () => {
    const repairKinds = [{ ...tablets, items: tablets.items.map((it) => (it.id === "t38" ? { ...it, repair: true } : it)) }, laptops];
    const loans = [
      loan("a", range(1, 30).map((n) => `t${n}`), { returned: { t1: "2026-11-11" } }),
      loan("b", ["n12"], { dueDate: "2026-11-10" }),
      loan("c", ["n5"], { open: false }),
    ];
    const s = itemStates(repairKinds, loans, TODAY);
    expect(s.get("t1").state).toBe("stock");
    expect(s.get("t2").state).toBe("loan");
    expect(s.get("t2").loan.id).toBe("a");
    expect(s.get("n12").state).toBe("over");
    expect(s.get("n5").state).toBe("stock");
    expect(s.get("t38").state).toBe("repair");
    expect(busyIds(s).size).toBe(30);
    expect(countStates(repairKinds, s)).toEqual({ total: 60, stock: 29, loan: 30, over: 1, repair: 1 });
  });

  it("상태 칸으로 거르기", () => {
    expect(stateMatchesFilter("over", "loan")).toBe(true);
    expect(stateMatchesFilter("repair", "stock")).toBe(false);
    expect(stateMatchesFilter("repair", "all")).toBe(true);
    expect(stateMatchesFilter("loan", "over")).toBe(false);
  });
});

describe("빌려준 기록 표시", () => {
  it("이어진 번호는 처음~끝으로 줄인다", () => {
    expect(describeItems(loan("a", range(1, 30).map((n) => `t${n}`)).items, kinds)).toBe("태블릿 1~30 (30대)");
    expect(describeItems(loan("a", ["n5"]).items, kinds)).toBe("노트북 05");
    expect(describeItems(loan("a", ["t1", "t2"]).items, kinds)).toBe("태블릿 1, 2 (2대)");
    expect(describeItems(loan("a", ["t3", "t1", "n2"]).items, kinds)).toBe("태블릿 1, 3 · 노트북 02 (3대)");
    expect(describeItems(loan("a", ["t1", "t2"]).items, kinds, { count: false })).toBe("태블릿 1, 2");
  });

  it("조각이 많으면 '외 N대'로 줄인다", () => {
    const ids = ["t1", "t3", "t5", "t7", "t9", "t11", "t12", "t13"];
    expect(describeItems(loan("a", ids).items, kinds)).toBe("태블릿 1, 3, 5, 7 외 4대 (8대)");
  });

  it("고친 번호는 지금 번호로, 지워진 기자재는 기록의 번호로", () => {
    const renamed = [{ ...tablets, items: tablets.items.map((it) => (it.id === "t1" ? { ...it, label: "A-1" } : it)) }];
    const items2 = [
      { id: "t1", kindId: "k1", kindName: "태블릿", label: "1" },
      { id: "gone", kindId: "k1", kindName: "태블릿", label: "99" },
    ];
    expect(describeItems(items2, renamed)).toBe("태블릿 A-1, 99 (2대)");
    expect(describeItems([{ id: "x", kindId: "deleted", kindName: "빔프로젝터", label: "2" }], kinds)).toBe("빔프로젝터 2");
  });

  it("반납 날짜 표시", () => {
    expect(dueBadge("2026-11-06", TODAY)).toEqual({ tone: "over", label: "5일 지남" });
    expect(dueBadge(TODAY, TODAY)).toEqual({ tone: "today", label: "오늘까지" });
    expect(dueBadge("2026-11-12", TODAY).label).toBe("내일까지");
    expect(dueBadge("2026-11-20", TODAY).label).toBe("9일 남음");
  });

  it("반납 날짜가 이른 것이 위로", () => {
    const list = sortOpenLoans([
      { id: "1", dueDate: "2026-12-31", outDate: "2026-10-28" },
      { id: "2", dueDate: "2026-11-06", outDate: "2026-11-02" },
      { id: "3", dueDate: "2026-11-11", outDate: "2026-11-11" },
    ]);
    expect(list.map((l) => l.id)).toEqual(["2", "3", "1"]);
  });

  it("반납한 날: 한 번에 / 나눠서", () => {
    const l = loan("a", ["t1", "t2", "t3"], { returned: { t1: "2026-11-09", t2: "2026-11-09", t3: "2026-11-10" } });
    expect(returnedText(l)).toBe("11/9(월) 2대 · 11/10(화) 1대");
    expect(returnedText({ ...l, returned: { t1: "2026-11-09", t2: "2026-11-09", t3: "2026-11-09" } })).toBe("11/9(월)");
    expect(returnedText({ ...l, returned: {} })).toBe("");
  });

  it("반납 날짜 빠른 선택: 월~수는 이번 주 금요일, 목~일은 다음 주 금요일", () => {
    expect(dueChoices("2026-11-11")[2]).toEqual({ id: "friday", label: "이번 주 금요일", date: "2026-11-13" }); // 수
    expect(dueChoices("2026-11-09")[2].date).toBe("2026-11-13"); // 월
    expect(dueChoices("2026-11-12")[2]).toEqual({ id: "friday", label: "다음 주 금요일", date: "2026-11-20" }); // 목
    expect(dueChoices("2026-11-13")[2].date).toBe("2026-11-20"); // 금
    expect(dueChoices("2026-11-14")[2].date).toBe("2026-11-20"); // 토
    expect(dueChoices("2026-11-15")[2].date).toBe("2026-11-20"); // 일
    expect(dueChoices(TODAY)[1].date).toBe("2026-11-12");
  });
});

describe("빌려주기", () => {
  it("저장 전 점검", () => {
    const ok = { itemCount: 3, borrower: "방송부", dueDate: TODAY, memo: "" };
    expect(validateLoan(ok, TODAY)).toBeNull();
    expect(validateLoan({ ...ok, itemCount: 0 }, TODAY)).toBeTruthy();
    expect(validateLoan({ ...ok, borrower: "  " }, TODAY)).toBeTruthy();
    expect(validateLoan({ ...ok, dueDate: "" }, TODAY)).toBeTruthy();
    expect(validateLoan({ ...ok, dueDate: "2026-11-10" }, TODAY)).toBeTruthy();
    expect(validateLoan({ ...ok, memo: "x".repeat(201) }, TODAY)).toBeTruthy();
    // 고치기에서는 대수를 넘기지 않는다
    expect(validateLoan({ borrower: "방송부", dueDate: TODAY, memo: "" }, "2026-11-01")).toBeNull();
  });

  it("범위로 고르기: 목록 순서 기준, 거꾸로 적어도, 01 과 1 은 같게", () => {
    const free = (it) => it.id !== "n5";
    expect(pickRange(laptops.items, "1", "10", free)).toEqual({ ids: ["n1", "n2", "n3", "n4", "n6", "n7", "n8", "n9", "n10"], skipped: 1 });
    expect(pickRange(laptops.items, "03", "01", () => true).ids).toEqual(["n1", "n2", "n3"]);
    expect(pickRange(laptops.items, "1", "99", () => true).error).toContain("99");
    expect(pickRange(laptops.items, "", "3", () => true).error).toBeTruthy();
    const named = items(["A", "B", "C"]);
    expect(pickRange(named, "A", "B", () => true).ids).toEqual(["t1", "t2"]);
  });

  it("기록에 남길 목록은 종류 순서 → 목록 순서", () => {
    expect(loanItemsFor(kinds, new Set(["n2", "t3", "t1"]))).toEqual([
      { id: "t1", kindId: "k1", kindName: "태블릿", label: "1" },
      { id: "t3", kindId: "k1", kindName: "태블릿", label: "3" },
      { id: "n2", kindId: "k2", kindName: "노트북", label: "02" },
    ]);
  });

  it("최근에 쓴 이름", () => {
    const at = (ms) => ({ toMillis: () => ms });
    const loans = [
      { borrower: "방송부", createdAt: at(1) },
      { borrower: "학생회", createdAt: at(3) },
      { borrower: "방송부", createdAt: at(2) },
      { borrower: " ", createdAt: at(4) },
    ];
    expect(recentBorrowers(loans)).toEqual(["학생회", "방송부"]);
    expect(recentBorrowers(loans, 1)).toEqual(["학생회"]);
  });

  it("검색: 빌린 사람 · 메모 · 번호", () => {
    const l = loan("a", ["n12"], { borrower: "방송부", memo: "충전기 함께" });
    expect(loanMatches(l, "방송", kinds)).toBe(true);
    expect(loanMatches(l, "충전기", kinds)).toBe(true);
    expect(loanMatches(l, "노트북 12", kinds)).toBe(true);
    expect(loanMatches(l, "태블릿", kinds)).toBe(false);
  });
});
