// 웹 푸시(휴대폰 알림) 한 건 보내기. 바깥 패키지 없이 node:crypto 만 쓴다.
//  - 보내는 쪽 확인(VAPID, RFC 8292): 비밀 열쇠로 서명한 짧은 표(JWT)를 붙인다. 알림 서비스(구글·애플 등)는
//    구독할 때 쓴 공개 열쇠와 맞는 서명만 받아 준다 → 비밀 열쇠가 없으면 구독 정보를 알아도 알림을 못 보낸다.
//  - 내용 암호화(aes128gcm, RFC 8291·8188): 받는 기기만 풀 수 있게 잠가서 보낸다. 중간의 알림 서비스는 내용을 못 본다.
// 폴더 이름이 _ 로 시작해서 Vercel 이 이 파일을 주소로 내놓지 않는다.
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(s, "base64url");

/**
 * Authorization 헤더 값. vapid = { publicKey: 65바이트 점(base64url), privateKey: 32바이트(base64url), subject: "https://…" | "mailto:…" }
 */
export function vapidAuthorization(endpoint, vapid, nowSec = Math.floor(Date.now() / 1000)) {
  const pub = fromB64u(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("bad vapid public key");
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: vapid.subject }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${vapid.publicKey}`;
}

const RECORD_SIZE = 4096;

/**
 * 내용 잠그기 (RFC 8291). keys = 구독의 { p256dh, auth } (base64url).
 * 시험할 때만 salt(16바이트)와 보내는 쪽 열쇠(ECDH, 개인 열쇠를 넣어 둔 것)를 정해서 넣는다.
 */
export function encryptPayload(plaintext, keys, { salt = randomBytes(16), senderEcdh = null } = {}) {
  const uaPublic = fromB64u(keys.p256dh);
  const authSecret = fromB64u(keys.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("bad subscription keys");
  let ecdh = senderEcdh;
  if (!ecdh) {
    ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
  }
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const data = Buffer.concat([Buffer.from(plaintext, "utf8"), Buffer.from([2])]); // 2 = 마지막 묶음 표시
  if (data.length + 16 > RECORD_SIZE) throw new Error("payload too large");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(RECORD_SIZE);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, sealed]);
}

/**
 * 알림 한 건을 보낸다. subscription = { endpoint, keys: { p256dh, auth } }.
 * 돌려주는 값: 알림 서비스의 응답 코드 (201 이 보통 성공, 404·410 은 구독이 끝난 기기).
 */
export async function sendWebPush(subscription, payload, { vapid, ttl = 3600, urgency = "high", topic = "", fetchImpl = fetch } = {}) {
  const body = encryptPayload(typeof payload === "string" ? payload : JSON.stringify(payload), subscription.keys);
  const headers = {
    TTL: String(ttl),
    Urgency: urgency,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    Authorization: vapidAuthorization(subscription.endpoint, vapid),
  };
  if (topic) headers.Topic = topic;
  const res = await fetchImpl(subscription.endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
  return res.status;
}
