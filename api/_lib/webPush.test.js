import { createDecipheriv, createECDH, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptPayload, sendWebPush, vapidAuthorization } from "./webPush.js";

const b64u = (buf) => Buffer.from(buf).toString("base64url");

// 받는 기기 쪽에서 푸는 방법 (RFC 8291) — 시험에서만 쓴다
function decrypt(body, uaEcdh, authSecret) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const sealed = body.subarray(21 + idlen);
  const shared = uaEcdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaEcdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  expect(plain[plain.length - 1]).toBe(2);
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

function makeVapid() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);
  return { publicKey: b64u(point), privateKey: privateKey.export({ format: "jwk" }).d, subject: "https://example.vercel.app", jwk: pub };
}

describe("encryptPayload", () => {
  it("RFC 8291 부록 A 의 예시와 똑같이 잠근다", () => {
    const sender = createECDH("prime256v1");
    sender.setPrivateKey(Buffer.from("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "base64url"));
    const out = encryptPayload(
      "When I grow up, I want to be a watermelon",
      { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
      { salt: Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url"), senderEcdh: sender }
    );
    expect(b64u(out)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
    );
  });

  it("받는 기기가 열쇠로 풀면 한글 내용이 그대로 나온다", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = randomBytes(16);
    const text = JSON.stringify({ title: "1학년 7반 교실", body: "민수: 선생님 3교시 체육복 입어요?" });
    const body = encryptPayload(text, { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) });
    expect(decrypt(body, ua, auth)).toBe(text);
  });

  it("구독 열쇠가 이상하면 멈춘다", () => {
    expect(() => encryptPayload("x", { p256dh: "AAAA", auth: b64u(randomBytes(16)) })).toThrow();
  });
});

describe("vapidAuthorization", () => {
  it("공개 열쇠로 확인되는 서명과 알림 서비스 주소(aud)를 담는다", () => {
    const v = makeVapid();
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", v, 1_800_000_000);
    const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
    expect(m).not.toBeNull();
    expect(m[4]).toBe(v.publicKey);
    const claims = JSON.parse(Buffer.from(m[2], "base64url").toString());
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_800_000_000 + 12 * 3600, sub: "https://example.vercel.app" });
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: v.jwk.x, y: v.jwk.y }, format: "jwk" });
    const ok = verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3], "base64url"));
    expect(ok).toBe(true);
  });
});

describe("sendWebPush", () => {
  it("알림 서비스에 잠근 내용과 머리말을 보내고 응답 코드를 돌려준다", async () => {
    const v = makeVapid();
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = randomBytes(16);
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return { status: 201 };
    };
    const status = await sendWebPush(
      { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } },
      { hello: "교실" },
      { vapid: v, topic: "chatAbc", fetchImpl }
    );
    expect(status).toBe(201);
    expect(calls).toHaveLength(1);
    const { headers, body, method } = calls[0].init;
    expect(method).toBe("POST");
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("3600");
    expect(headers.Urgency).toBe("high");
    expect(headers.Topic).toBe("chatAbc");
    expect(headers.Authorization.startsWith("vapid t=")).toBe(true);
    expect(JSON.parse(decrypt(body, ua, auth))).toEqual({ hello: "교실" });
  });
});
