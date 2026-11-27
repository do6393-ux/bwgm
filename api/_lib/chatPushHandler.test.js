import { createECDH, generateKeyPairSync, randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// 시험용 서명 열쇠 (진짜 비밀 열쇠는 Vercel 에만 있다)
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const testKeys = (() => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  return {
    publicKey: b64u(Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")])),
    privateKey: privateKey.export({ format: "jwk" }).d,
  };
})();

vi.mock("../../src/lib/chatPush.js", async (importOriginal) => ({ ...(await importOriginal()), PUSH_PUBLIC_KEY: testKeys.publicKey }));

const SID = "Ab3dE6gH9jK2mN5pQ8sT";
const FS = "https://firestore.googleapis.com/v1/projects/class-208a0/databases/(default)/documents";
const ua = createECDH("prime256v1");
ua.generateKeys();
const deviceKeys = { p256dh: { stringValue: b64u(ua.getPublicKey()) }, auth: { stringValue: b64u(randomBytes(16)) } };

let handler;
beforeAll(async () => {
  handler = (await import("../chat-push.js")).default;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function fakeRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };
}

const req = (body, headers = {}) => ({ method: "POST", headers: { host: "bwgm.vercel.app", ...headers }, body });

/** Firestore 와 알림 서비스를 흉내 낸다. pushStatus: 알림 서비스가 돌려줄 코드 */
function stubWorld({ from = "student", ageMs = 3000, devices, pushStatus = 201, screen = true } = {}) {
  const pushes = [];
  const list = devices ?? [
    { id: "a".repeat(32), endpoint: "https://fcm.googleapis.com/fcm/send/phone" },
    { id: "b".repeat(32), endpoint: "http://127.0.0.1/evil" }, // 걸러져야 한다
  ];
  vi.stubGlobal("fetch", async (url, init) => {
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.startsWith(FS)) {
      const path = u.slice(FS.length + 1).split("?")[0];
      if (path === `classroom_screens/${SID}`)
        return screen ? ok({ name: `x/${path}`, fields: { grade: { integerValue: "1" }, classNum: { integerValue: "7" } } }) : { ok: false, status: 404 };
      if (path.startsWith(`classroom_screens/${SID}/messages/`))
        return ok({
          name: `x/${path}`,
          fields: {
            from: { stringValue: from },
            text: { stringValue: "선생님 체육복 입어요?" },
            name: { stringValue: "민수" },
            createdAt: { timestampValue: new Date(Date.now() - ageMs).toISOString() },
          },
        });
      if (path === `classroom_screens/${SID}/push`)
        return ok({ documents: list.map((d) => ({ name: `x/push/${d.id}`, fields: { endpoint: { stringValue: d.endpoint }, ...deviceKeys } })) });
      return { ok: false, status: 404 };
    }
    pushes.push({ url: u, init });
    return { status: pushStatus };
  });
  return pushes;
}

describe("POST /api/chat-push", () => {
  it("POST 만 받는다", async () => {
    const res = fakeRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it("비밀 열쇠가 설정되지 않았으면 503", async () => {
    vi.stubEnv("PUSH_PRIVATE_KEY", "");
    const res = fakeRes();
    await handler(req({ sid: SID, mid: "m0000000000000000001" }), res);
    expect(res.statusCode).toBe(503);
  });

  it("다른 사이트에서 부르면 403, 모양이 틀리면 400", async () => {
    vi.stubEnv("PUSH_PRIVATE_KEY", testKeys.privateKey);
    const a = fakeRes();
    await handler(req({ sid: SID, mid: "m0000000000000000002" }, { origin: "https://evil.example" }), a);
    expect(a.statusCode).toBe(403);
    const b = fakeRes();
    await handler(req({ sid: "x", mid: "y" }), b);
    expect(b.statusCode).toBe(400);
  });

  it("학생이 방금 보낸 메시지면 바른 기기에만 알림을 보낸다 (같은 메시지는 한 번만)", async () => {
    vi.stubEnv("PUSH_PRIVATE_KEY", testKeys.privateKey);
    const pushes = stubWorld();
    const res = fakeRes();
    await handler(req({ sid: SID, mid: "m0000000000000000003" }, { origin: "https://bwgm.vercel.app" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ sent: 1, failed: 0, gone: [] });
    expect(pushes.map((p) => p.url)).toEqual(["https://fcm.googleapis.com/fcm/send/phone"]);
    expect(pushes[0].init.headers.Authorization).toContain(`k=${testKeys.publicKey}`);

    const again = fakeRes();
    await handler(req({ sid: SID, mid: "m0000000000000000003" }), again);
    expect(again.body).toEqual({ sent: 0, skipped: "duplicate" });
    expect(pushes).toHaveLength(1);
  });

  it("선생님 답장이나 오래된 메시지로는 보내지 않는다", async () => {
    vi.stubEnv("PUSH_PRIVATE_KEY", testKeys.privateKey);
    const pushes = stubWorld({ from: "teacher" });
    const a = fakeRes();
    await handler(req({ sid: SID, mid: "m0000000000000000004" }), a);
    expect(a.body.skipped).toBe("not-fresh");

    stubWorld({ ageMs: 10 * 60 * 1000 });
    const b = fakeRes();
    await handler(req({ sid: SID, mid: "m0000000000000000005" }), b);
    expect(b.body.skipped).toBe("not-fresh");
    expect(pushes).toHaveLength(0);
  });

  it("교실 화면이 없으면 404", async () => {
    vi.stubEnv("PUSH_PRIVATE_KEY", testKeys.privateKey);
    stubWorld({ screen: false });
    const res = fakeRes();
    await handler(req({ sid: SID, mid: "m0000000000000000006" }), res);
    expect(res.statusCode).toBe(404);
  });

  it("구독이 끝난 기기(410)는 gone 으로 알려 준다", async () => {
    vi.stubEnv("PUSH_PRIVATE_KEY", testKeys.privateKey);
    stubWorld({ pushStatus: 410, devices: [{ id: "c".repeat(32), endpoint: "https://fcm.googleapis.com/fcm/send/old" }] });
    const res = fakeRes();
    await handler(req({ sid: SID, mid: "m0000000000000000007" }), res);
    expect(res.body).toEqual({ sent: 0, failed: 1, gone: ["c".repeat(32)] });
  });
});
