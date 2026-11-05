import { describe, expect, it } from "vitest";
import { ADMIN_EMAIL, isAdmin } from "./admin";

describe("isAdmin", () => {
  it("관리자 이메일이면 true (대소문자 무시)", () => {
    expect(isAdmin({ email: ADMIN_EMAIL })).toBe(true);
    expect(isAdmin({ email: ADMIN_EMAIL.toUpperCase() })).toBe(true);
  });

  it("다른 이메일이거나 로그인하지 않았으면 false", () => {
    expect(isAdmin({ email: "teacher@ice.go.kr" })).toBe(false);
    expect(isAdmin({})).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});
