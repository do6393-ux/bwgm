// 정보 업무 › 바로가기·연락처: 정보부가 같이 쓰는 사이트 바로가기와 업무 연락처.
// 문서 하나 = 사이트 하나 또는 연락처 하나 (work_links 컬렉션). 저장은 workLinksApi.js.
// 글자 수 · 주소 규칙은 firestore.rules 의 work_links 와 같게 둘 것.
//
// site:    { kind: "site", part, name, url, memo, pinned }
// contact: { kind: "contact", part, name, role, phone, email, memo, pinned }

import { ROLE_META } from "./workDuties";

export const LINK_PARTS = ["common", "head", "plan", "device", "nais"];
export const partLabel = (part) => (part === "common" ? "공통" : ROLE_META[part]?.tab || "공통");

export const LINK_MAX = { name: 60, url: 500, role: 80, phone: 40, email: 100, memo: 300 };

/**
 * 사이트 주소 다듬기 → "https://…" | "" (못 쓰는 주소).
 * https:// 를 빼고 적으면 붙이고, http · https 말고는 받지 않는다 (javascript: 같은 것 막기).
 */
export function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname) return "";
    return u.href;
  } catch {
    return "";
  }
}

/** 화면에 보여 줄 짧은 주소 ("www." 와 끝의 / 는 뺀다) */
export function hostOf(url) {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.host.replace(/^www\./, "")}${path}`;
  } catch {
    return "";
  }
}

/** 전화번호에서 걸 수 있는 번호만 → "0320000000" | "" (번호처럼 생긴 부분이 없으면 "") */
export function dialNumber(phone) {
  const m = String(phone || "").match(/\+?\d[\d\s().-]{5,}\d/);
  if (!m) return "";
  const plus = m[0].startsWith("+") ? "+" : "";
  return plus + m[0].replace(/\D/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 빈 입력 칸 (창을 처음 열 때) */
export function emptyForm(kind, part = "common") {
  return { kind, part: LINK_PARTS.includes(part) ? part : "common", name: "", url: "", role: "", phone: "", email: "", memo: "", pinned: false };
}

/** 저장된 문서 → 입력 칸 */
export function toForm(link) {
  return { ...emptyForm(link.kind, link.part), ...pick(link, ["name", "url", "role", "phone", "email", "memo"]), pinned: !!link.pinned };
}

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, typeof o?.[k] === "string" ? o[k] : ""]));

/** 입력 점검 → 문제 문구 | null */
export function validateLink(form) {
  const name = form.name.trim();
  if (!name) return form.kind === "site" ? "사이트 이름을 적어 주세요." : "이름이나 기관을 적어 주세요.";
  if (name.length > LINK_MAX.name) return `이름은 ${LINK_MAX.name}자까지 적을 수 있어요.`;
  if (form.memo.trim().length > LINK_MAX.memo) return `메모는 ${LINK_MAX.memo}자까지 적을 수 있어요.`;
  if (form.kind === "site") {
    if (!form.url.trim()) return "주소를 적어 주세요.";
    const url = normalizeUrl(form.url);
    if (!url) return "주소가 맞는지 확인해 주세요. 예) www.ice.go.kr";
    if (url.length > LINK_MAX.url) return "주소가 너무 길어요.";
    return null;
  }
  const phone = form.phone.trim();
  const email = form.email.trim();
  if (!phone && !email) return "전화번호나 이메일 중 하나는 적어 주세요.";
  if (phone.length > LINK_MAX.phone) return `전화번호는 ${LINK_MAX.phone}자까지 적을 수 있어요.`;
  if (email && !EMAIL_RE.test(email)) return "이메일 주소를 확인해 주세요.";
  if (email.length > LINK_MAX.email) return "이메일이 너무 길어요.";
  if (form.role.trim().length > LINK_MAX.role) return `하는 일은 ${LINK_MAX.role}자까지 적을 수 있어요.`;
  return null;
}

/** 입력 칸 → 저장할 문서 (종류에 맞는 칸만, 앞뒤 빈칸은 뺀다). validateLink 를 통과한 뒤에 부른다. */
export function toDoc(form) {
  const base = {
    kind: form.kind,
    part: LINK_PARTS.includes(form.part) ? form.part : "common",
    name: form.name.trim(),
    memo: form.memo.trim(),
    pinned: !!form.pinned,
  };
  if (form.kind === "site") return { ...base, url: normalizeUrl(form.url) };
  return { ...base, role: form.role.trim(), phone: form.phone.trim(), email: form.email.trim() };
}

/** ★ 고정한 것 먼저, 그다음 이름 가나다순 */
export function sortLinks(list) {
  return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.name || "").localeCompare(b.name || "", "ko"));
}

/** 분류 · 검색어로 거르기. 전화번호는 - 없이 숫자만 쳐도 찾는다. */
export function filterLinks(list, { part = "all", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  return list.filter((x) => {
    if (part !== "all" && x.part !== part) return false;
    if (!q) return true;
    const hay = [x.name, x.url, x.role, x.phone, x.email, x.memo, partLabel(x.part)].map((s) => (s || "").toLowerCase());
    if (hay.some((s) => s.includes(q))) return true;
    return qDigits.length >= 3 && qDigits === q.replace(/[\s-]/g, "") && (x.phone || "").replace(/\D/g, "").includes(qDigits);
  });
}

/** 분류마다 몇 개인지 { all, common, head, … } */
export function countByPart(list) {
  const counts = Object.fromEntries([["all", list.length], ...LINK_PARTS.map((p) => [p, 0])]);
  for (const x of list) if (counts[x.part] !== undefined) counts[x.part] += 1;
  return counts;
}
