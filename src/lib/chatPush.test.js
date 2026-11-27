import { describe, expect, it } from "vitest";
import {
  PUSH_FRESH_MS,
  PUSH_PUBLIC_KEY,
  base64UrlToBytes,
  chatLinkFromMessage,
  chatPushPayload,
  checkPushRequest,
  deviceLabel,
  isFreshStudentMessage,
  isPhoneLike,
  isPushEndpointOk,
  pushDeviceId,
  pushTopic,
  readChatLink,
} from "./chatPush";

const SID = "Ab3dE6gH9jK2mN5pQ8sT"; // 20자
const MID = "x1Y2z3W4v5U6t7S8r9Q0";

describe("checkPushRequest", () => {
  it("교실 화면 ID 와 메시지 ID 가 맞으면 돌려준다", () => {
    expect(checkPushRequest({ sid: SID, mid: MID })).toEqual({ sid: SID, mid: MID });
  });
  it("모양이 틀리면 null", () => {
    expect(checkPushRequest(null)).toBeNull();
    expect(checkPushRequest({ sid: "짧음", mid: MID })).toBeNull();
    expect(checkPushRequest({ sid: SID, mid: "../../x" })).toBeNull();
    expect(checkPushRequest({ sid: `${SID}/messages`, mid: MID })).toBeNull();
    expect(checkPushRequest({ sid: SID })).toBeNull();
  });
});

describe("isFreshStudentMessage", () => {
  const now = Date.UTC(2026, 10, 27, 3, 0, 0);
  it("학생이 방금 보낸 것만", () => {
    expect(isFreshStudentMessage({ from: "student", at: now - 5000 }, now)).toBe(true);
    expect(isFreshStudentMessage({ from: "teacher", at: now - 5000 }, now)).toBe(false);
    expect(isFreshStudentMessage({ from: "student", at: now - PUSH_FRESH_MS - 1 }, now)).toBe(false);
    expect(isFreshStudentMessage({ from: "student", at: null }, now)).toBe(false);
  });
  it("서버 시계가 조금 빨라도 괜찮지만 너무 미래면 안 된다", () => {
    expect(isFreshStudentMessage({ from: "student", at: now + 10000 }, now)).toBe(true);
    expect(isFreshStudentMessage({ from: "student", at: now + 60000 }, now)).toBe(false);
  });
});

describe("chatPushPayload", () => {
  const screen = { grade: 1, classNum: 7 };
  it("제목은 반, 내용은 '이름: 글'", () => {
    const p = chatPushPayload(SID, MID, screen, { text: "선생님 3교시 체육복 입어요?", name: "민수", at: 1 });
    expect(p).toEqual({ t: "classroom-chat", sid: SID, mid: MID, g: 1, c: 7, title: "1학년 7반 교실", body: "민수: 선생님 3교시 체육복 입어요?", at: 1 });
  });
  it("이름이 없으면 '교실: 글', 줄바꿈은 한 줄로", () => {
    expect(chatPushPayload(SID, MID, screen, { text: "  안녕\n하세요 ", name: "", at: 1 }).body).toBe("교실: 안녕 하세요");
  });
  it("너무 길면 자른다", () => {
    const body = chatPushPayload(SID, MID, screen, { text: "가".repeat(300), name: "민수", at: 1 }).body;
    expect(body.length).toBe(180);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("pushTopic", () => {
  it("Topic 은 32자 이하 영문·숫자", () => {
    const t = pushTopic("a".repeat(40));
    expect(t.length).toBeLessThanOrEqual(32);
    expect(t).toMatch(/^[A-Za-z0-9]+$/);
  });
});

describe("isPushEndpointOk", () => {
  it("알림 서비스 주소는 된다", () => {
    expect(isPushEndpointOk("https://fcm.googleapis.com/fcm/send/abc:def")).toBe(true);
    expect(isPushEndpointOk("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushEndpointOk("https://updates.push.services.mozilla.com/wpush/v2/gAAA")).toBe(true);
  });
  it("http · IP 숫자 · localhost · 이상한 포트는 안 된다", () => {
    expect(isPushEndpointOk("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpointOk("https://127.0.0.1/x")).toBe(false);
    expect(isPushEndpointOk("https://169.254.169.254/latest")).toBe(false);
    expect(isPushEndpointOk("https://[::1]/x")).toBe(false);
    expect(isPushEndpointOk("https://localhost/x")).toBe(false);
    expect(isPushEndpointOk("https://metadata.google.internal/x")).toBe(false);
    expect(isPushEndpointOk("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushEndpointOk("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpointOk("not a url")).toBe(false);
    expect(isPushEndpointOk(`https://a.com/${"x".repeat(1000)}`)).toBe(false);
  });
});

describe("pushDeviceId", () => {
  it("같은 주소면 같은 32자 16진수", async () => {
    const a = await pushDeviceId("https://fcm.googleapis.com/fcm/send/abc");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await pushDeviceId("https://fcm.googleapis.com/fcm/send/abc")).toBe(a);
    expect(await pushDeviceId("https://fcm.googleapis.com/fcm/send/abd")).not.toBe(a);
  });
});

describe("deviceLabel · isPhoneLike", () => {
  const samsung =
    "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36";
  const winChrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
  const edge = `${winChrome} Edg/142.0.0.0`;
  it("기기와 브라우저 이름", () => {
    expect(deviceLabel(samsung)).toBe("안드로이드 · 삼성 인터넷");
    expect(deviceLabel(winChrome)).toBe("Windows · Chrome");
    expect(deviceLabel(iphone)).toBe("아이폰 · Safari");
    expect(deviceLabel(edge)).toBe("Windows · Edge");
    expect(deviceLabel("")).toBe("브라우저");
  });
  it("아이패드 사파리는 Mac 인 척하지만 터치가 되면 아이패드", () => {
    const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
    expect(deviceLabel(ipad, 5)).toBe("아이패드 · Safari");
    expect(deviceLabel(ipad, 0)).toBe("Mac · Safari");
  });
  it("휴대폰인지", () => {
    expect(isPhoneLike(samsung)).toBe(true);
    expect(isPhoneLike(iphone)).toBe(true);
    expect(isPhoneLike(winChrome)).toBe(false);
  });
});

describe("readChatLink · chatLinkFromMessage", () => {
  it("알림을 눌러 들어온 주소를 읽는다", () => {
    expect(readChatLink(new URLSearchParams(`chat=${SID}&g=1&c=7`))).toEqual({ sid: SID, grade: 1, classNum: 7 });
  });
  it("틀린 주소는 null", () => {
    expect(readChatLink(new URLSearchParams(""))).toBeNull();
    expect(readChatLink(new URLSearchParams(`chat=${SID}&g=4&c=7`))).toBeNull();
    expect(readChatLink(new URLSearchParams(`chat=${SID}&g=1&c=x`))).toBeNull();
    expect(readChatLink(new URLSearchParams(`chat=bad&g=1&c=7`))).toBeNull();
  });
  it("열려 있는 창에 온 말", () => {
    expect(chatLinkFromMessage({ t: "open-classroom-chat", sid: SID, g: 1, c: 7 })).toEqual({ sid: SID, grade: 1, classNum: 7 });
    expect(chatLinkFromMessage({ t: "other", sid: SID, g: 1, c: 7 })).toBeNull();
    expect(chatLinkFromMessage(null)).toBeNull();
  });
});

describe("base64UrlToBytes", () => {
  it("공개 열쇠는 65바이트 점(0x04 로 시작)", () => {
    const b = base64UrlToBytes(PUSH_PUBLIC_KEY);
    expect(b.length).toBe(65);
    expect(b[0]).toBe(4);
  });
});
