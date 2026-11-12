import { describe, expect, it } from "vitest";
import {
  LINK_PARTS,
  countByPart,
  dialNumber,
  emptyForm,
  filterLinks,
  hostOf,
  normalizeUrl,
  partLabel,
  sortLinks,
  toDoc,
  toForm,
  validateLink,
} from "./workLinks";

const site = (over = {}) => ({ ...emptyForm("site", "plan"), name: "업무포털", url: "www.ice.go.kr", ...over });
const contact = (over = {}) => ({ ...emptyForm("contact", "head"), name: "NAC 업체", phone: "010-1234-5678", ...over });

describe("바로가기 · 연락처", () => {
  it("분류 이름", () => {
    expect(LINK_PARTS).toEqual(["common", "head", "plan", "device", "nais"]);
    expect(LINK_PARTS.map(partLabel)).toEqual(["공통", "부장", "정보기획", "기기·소모품", "나이스·공시"]);
    expect(partLabel("이상한값")).toBe("공통");
  });

  it("주소: https:// 를 붙이고, http(s) 말고는 받지 않는다", () => {
    expect(normalizeUrl("www.ice.go.kr")).toBe("https://www.ice.go.kr/");
    expect(normalizeUrl("  HTTP://10.0.0.1:8080/admin ")).toBe("http://10.0.0.1:8080/admin");
    expect(normalizeUrl("https://admin.microsoft.com")).toBe("https://admin.microsoft.com/");
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
    expect(normalizeUrl("ftp://x.kr")).toBe("");
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl("http://")).toBe("");
  });

  it("짧은 주소 보여 주기", () => {
    expect(hostOf("https://www.ice.go.kr/")).toBe("ice.go.kr");
    expect(hostOf("http://10.0.0.1:8080/admin/")).toBe("10.0.0.1:8080/admin");
    expect(hostOf("엉터리")).toBe("");
  });

  it("걸 수 있는 번호만 꺼낸다", () => {
    expect(dialNumber("032-000-0000")).toBe("0320000000");
    expect(dialNumber("1588-0000 (평일)")).toBe("15880000");
    expect(dialNumber("+82 10 1234 5678")).toBe("+821012345678");
    expect(dialNumber("내선 234")).toBe("");
    expect(dialNumber("")).toBe("");
  });

  it("사이트 입력 점검", () => {
    expect(validateLink(site())).toBeNull();
    expect(validateLink(site({ name: "  " }))).toMatch(/이름/);
    expect(validateLink(site({ url: "" }))).toMatch(/주소를 적어/);
    expect(validateLink(site({ url: "javascript:alert(1)" }))).toMatch(/주소가 맞는지/);
    expect(validateLink(site({ name: "가".repeat(61) }))).toMatch(/60자/);
  });

  it("연락처 입력 점검: 전화나 이메일 하나는 있어야 한다", () => {
    expect(validateLink(contact())).toBeNull();
    expect(validateLink(contact({ phone: "", email: "" }))).toMatch(/하나는/);
    expect(validateLink(contact({ phone: "", email: "a@ice.go.kr" }))).toBeNull();
    expect(validateLink(contact({ email: "메일아님" }))).toMatch(/이메일/);
  });

  it("저장할 문서: 종류에 맞는 칸만, 빈칸은 다듬어서", () => {
    expect(toDoc(site({ name: " 업무포털 ", memo: " 공문 ", pinned: true, role: "남은 값" }))).toEqual({
      kind: "site",
      part: "plan",
      name: "업무포털",
      memo: "공문",
      pinned: true,
      url: "https://www.ice.go.kr/",
    });
    expect(toDoc(contact({ url: "https://x.kr", email: " a@ice.go.kr " }))).toEqual({
      kind: "contact",
      part: "head",
      name: "NAC 업체",
      memo: "",
      pinned: false,
      role: "",
      phone: "010-1234-5678",
      email: "a@ice.go.kr",
    });
    expect(toDoc({ ...contact(), part: "엉뚱" }).part).toBe("common");
  });

  it("고치기 창: 저장된 문서를 입력 칸으로", () => {
    expect(toForm({ id: "a", kind: "site", part: "nais", name: "학교알리미", url: "https://www.schoolinfo.go.kr/", pinned: true })).toEqual({
      ...emptyForm("site", "nais"),
      name: "학교알리미",
      url: "https://www.schoolinfo.go.kr/",
      pinned: true,
    });
  });

  const list = [
    { id: "1", kind: "site", part: "plan", name: "홈페이지 관리자", url: "https://school.kr/admin" },
    { id: "2", kind: "site", part: "common", name: "업무포털", url: "https://portal.kr", pinned: true },
    { id: "3", kind: "contact", part: "head", name: "NAC 업체", role: "예외 등록", phone: "010-1234-5678" },
    { id: "4", kind: "contact", part: "common", name: "교육청", phone: "032-000-0000", memo: "정보화 담당" },
  ];

  it("고정한 것 먼저, 그다음 가나다순 (한글이 영어보다 앞)", () => {
    expect(sortLinks(list).map((x) => x.id)).toEqual(["2", "4", "1", "3"]);
  });

  it("분류 · 검색어로 거르기 (번호는 - 없이 쳐도 찾는다)", () => {
    expect(filterLinks(list, { part: "common" }).map((x) => x.id)).toEqual(["2", "4"]);
    expect(filterLinks(list, { query: "예외" }).map((x) => x.id)).toEqual(["3"]);
    expect(filterLinks(list, { query: "정보화" }).map((x) => x.id)).toEqual(["4"]);
    expect(filterLinks(list, { query: "01012345678" }).map((x) => x.id)).toEqual(["3"]);
    expect(filterLinks(list, { query: "1234-5678" }).map((x) => x.id)).toEqual(["3"]);
    expect(filterLinks(list, { query: "부장" }).map((x) => x.id)).toEqual(["3"]); // 분류 이름으로도
    expect(filterLinks(list, { part: "plan", query: "업무포털" })).toEqual([]);
  });

  it("분류마다 개수", () => {
    expect(countByPart(list)).toEqual({ all: 4, common: 2, head: 1, plan: 1, device: 0, nais: 0 });
  });
});
