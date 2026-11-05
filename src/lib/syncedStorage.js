import { getDoc } from "firebase/firestore";

// 학급 데이터(연락처·자리배치·청소·누적기록)를 기기 간에 맞추기 위한 도우미.
//
// 예전에는 "이 기기의 localStorage 를 먼저 읽고, 없을 때만 Firestore 를 읽는" 구조라
// PC 에서 고친 내용이 로컬 사본이 있는 휴대폰에는 반영되지 않았다.
// 지금은 Firestore 를 기준(source of truth)으로 읽고 localStorage 는 캐시·오프라인 대비로만 쓴다.
// 단, 이 기기에 더 최근에 저장된 로컬 사본이 있으면(오프라인 편집, 저장 실패 등) 그걸 쓴다.
// 비교에는 저장할 때 같이 남기는 updatedAt(ISO 문자열) 을 쓴다.

const tsKey = (localKey) => `${localKey}__updatedAt`;

function readLocal(localKey) {
  try {
    const raw = localStorage.getItem(localKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * localStorage 에 저장하고 저장 시각을 함께 남긴다.
 * 반환값(updatedAt)을 Firestore 문서의 updatedAt 에도 그대로 써야 비교가 맞는다.
 */
export function saveLocal(localKey, value, updatedAt = new Date().toISOString()) {
  try {
    localStorage.setItem(localKey, JSON.stringify(value));
    localStorage.setItem(tsKey(localKey), updatedAt);
  } catch {
    // 저장 공간이 없거나 막힌 환경: 로컬 캐시는 포기하고 Firestore 만 사용
  }
  return updatedAt;
}

/**
 * Firestore 문서를 기준으로 값을 불러온다.
 *  - pick(docData): 문서에서 쓸 값을 꺼낸다. 비어 있으면 null/undefined 를 돌려줄 것.
 *  - 반환: 값, 없으면 null. Firestore 읽기에 실패하면(오프라인·권한) 로컬 사본을 돌려준다.
 *  - options.onLocalNewer(local, localTs): 서버를 정상적으로 읽었는데 서버에 없거나 이 기기 사본이 더 최근일 때 부른다.
 *    (예전에 서버 저장이 실패해 이 기기에만 남은 데이터를 서버로 올려, 다른 기기에서도 보이게 하는 용도.
 *     서버 문서를 지우는 일이 없는 데이터에만 쓴다. 호출 결과는 기다리지 않고, 실패해도 무시한다.)
 */
export async function loadSynced(localKey, docRef, pick, options = {}) {
  const local = readLocal(localKey);
  let localTs = null;
  try {
    localTs = localStorage.getItem(tsKey(localKey));
  } catch {
    // 무시
  }

  let remote = null;
  let remoteTs = null;
  let readOk = false;
  try {
    const snap = await getDoc(docRef);
    readOk = true;
    if (snap.exists()) {
      const data = snap.data();
      const value = pick(data);
      if (value != null) {
        remote = value;
        remoteTs = data.updatedAt ?? null;
      }
    }
  } catch {
    // 오프라인이거나 권한이 없으면 로컬 사본으로 대신한다
  }

  // 로컬 사본이 Firestore 보다 확실히 더 최근이면 로컬을 우선한다 (아직 서버에 못 올라간 편집)
  const localIsNewer = local != null && !!localTs && !!remoteTs && localTs > remoteTs;
  if (remote != null && !localIsNewer) {
    saveLocal(localKey, remote, remoteTs ?? new Date().toISOString());
    return remote;
  }
  // 서버에 없거나 이 기기 사본이 더 최근 → 서버로 올려 다른 기기에서도 보이게 한다 (서버를 읽는 데 성공했을 때만)
  if (local != null && readOk && options.onLocalNewer) {
    try {
      Promise.resolve(options.onLocalNewer(local, localTs)).catch(() => {});
    } catch {
      // 올리기에 실패해도 불러오기는 그대로 진행
    }
  }
  return local;
}
