// 서버 기능이 Firestore 를 "로그인 없이" 읽는다 (REST). 그래서 firestore.rules 가 누구나 읽게 해 둔 것만 읽힌다
// (교실 화면 문서·대화·알림 받는 기기 — 모두 교실 화면 주소를 알아야 읽을 수 있다). 비밀 열쇠는 쓰지 않는다.
import { FIREBASE_PROJECT_ID } from "../../src/lib/chatPush.js";

const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

/** REST 값 하나 → 보통 값 (시각은 밀리초 숫자) */
export function fromValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return fromFields(v.mapValue.fields);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}

export function fromFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromValue(v);
  return out;
}

const docId = (name) => String(name || "").split("/").pop();

/** 문서 하나. 없거나 읽을 수 없으면 null. path 예: "classroom_screens/abc" */
export async function getDocument(path, fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE}/${path}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const json = await res.json();
  return { id: docId(json.name), ...fromFields(json.fields) };
}

/** 컬렉션의 문서들 (pageSize 개까지). 읽을 수 없으면 [] */
export async function listDocuments(path, pageSize, fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE}/${path}?pageSize=${pageSize}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.documents || []).map((d) => ({ id: docId(d.name), ...fromFields(d.fields) }));
}
