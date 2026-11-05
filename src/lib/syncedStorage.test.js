import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({ getDoc: vi.fn() }));

import { getDoc } from "firebase/firestore";
import { loadSynced, saveLocal } from "./syncedStorage";

const snap = (data) => ({ exists: () => data != null, data: () => data });
const pickList = (d) => d.list ?? null;

beforeEach(() => {
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  });
  getDoc.mockReset();
});

describe("loadSynced: Firestore 를 기준으로 불러온다", () => {
  it("서버에만 있으면 서버 값을 쓰고 로컬에 캐시한다", async () => {
    getDoc.mockResolvedValue(snap({ list: ["서버"], updatedAt: "2026-11-05T10:00:00.000Z" }));
    expect(await loadSynced("k", {}, pickList)).toEqual(["서버"]);
    expect(JSON.parse(localStorage.getItem("k"))).toEqual(["서버"]);
  });

  it("저장 시각이 없는 옛 로컬 사본보다 서버가 우선한다 (기기 간 동기화)", async () => {
    localStorage.setItem("k", JSON.stringify(["옛 로컬"]));
    getDoc.mockResolvedValue(snap({ list: ["서버"], updatedAt: "2026-11-05T10:00:00.000Z" }));
    expect(await loadSynced("k", {}, pickList)).toEqual(["서버"]);
  });

  it("서버가 더 최근이면 서버를 쓴다", async () => {
    saveLocal("k", ["로컬"], "2026-11-05T09:00:00.000Z");
    getDoc.mockResolvedValue(snap({ list: ["서버"], updatedAt: "2026-11-05T10:00:00.000Z" }));
    expect(await loadSynced("k", {}, pickList)).toEqual(["서버"]);
  });

  it("로컬이 서버보다 최근이면(서버에 못 올라간 편집) 로컬을 쓴다", async () => {
    saveLocal("k", ["새 로컬"], "2026-11-05T11:00:00.000Z");
    getDoc.mockResolvedValue(snap({ list: ["서버"], updatedAt: "2026-11-05T10:00:00.000Z" }));
    expect(await loadSynced("k", {}, pickList)).toEqual(["새 로컬"]);
  });
});

describe("loadSynced: 서버를 못 쓰는 경우", () => {
  it("서버 읽기에 실패하면(오프라인·권한) 로컬 사본을 쓴다", async () => {
    saveLocal("k", ["로컬"]);
    getDoc.mockRejectedValue(new Error("offline"));
    expect(await loadSynced("k", {}, pickList)).toEqual(["로컬"]);
  });

  it("서버 문서가 없으면 로컬 사본을 쓰고, 로컬도 없으면 null", async () => {
    getDoc.mockResolvedValue(snap(null));
    saveLocal("k", ["로컬"]);
    expect(await loadSynced("k", {}, pickList)).toEqual(["로컬"]);
    expect(await loadSynced("없음", {}, pickList)).toBeNull();
  });

  it("서버 문서는 있지만 값이 비어 있으면 로컬 사본을 쓴다", async () => {
    saveLocal("k", ["로컬"]);
    getDoc.mockResolvedValue(snap({ list: null, updatedAt: "2026-11-05T10:00:00.000Z" }));
    expect(await loadSynced("k", {}, pickList)).toEqual(["로컬"]);
  });
});

describe("loadSynced: 이 기기에만 남은 데이터를 서버로 올린다 (onLocalNewer)", () => {
  it("서버에 문서가 없고 이 기기에 사본이 있으면 올린다", async () => {
    const up = vi.fn();
    saveLocal("k", ["로컬"], "2026-11-05T09:00:00.000Z");
    getDoc.mockResolvedValue(snap(null));
    expect(await loadSynced("k", {}, pickList, { onLocalNewer: up })).toEqual(["로컬"]);
    expect(up).toHaveBeenCalledWith(["로컬"], "2026-11-05T09:00:00.000Z");
  });

  it("이 기기 사본이 서버보다 최근이면 올린다", async () => {
    const up = vi.fn();
    saveLocal("k", ["새 로컬"], "2026-11-05T11:00:00.000Z");
    getDoc.mockResolvedValue(snap({ list: ["서버"], updatedAt: "2026-11-05T10:00:00.000Z" }));
    expect(await loadSynced("k", {}, pickList, { onLocalNewer: up })).toEqual(["새 로컬"]);
    expect(up).toHaveBeenCalledTimes(1);
  });

  it("서버가 더 최근이면 올리지 않는다 (다른 기기의 편집을 덮어쓰지 않음)", async () => {
    const up = vi.fn();
    saveLocal("k", ["옛 로컬"], "2026-11-05T09:00:00.000Z");
    getDoc.mockResolvedValue(snap({ list: ["서버"], updatedAt: "2026-11-05T10:00:00.000Z" }));
    expect(await loadSynced("k", {}, pickList, { onLocalNewer: up })).toEqual(["서버"]);
    expect(up).not.toHaveBeenCalled();
  });

  it("서버 읽기에 실패했으면(오프라인·권한) 올리지 않는다 (서버 내용을 모르는 채로 덮어쓰지 않음)", async () => {
    const up = vi.fn();
    saveLocal("k", ["로컬"]);
    getDoc.mockRejectedValue(new Error("offline"));
    expect(await loadSynced("k", {}, pickList, { onLocalNewer: up })).toEqual(["로컬"]);
    expect(up).not.toHaveBeenCalled();
  });

  it("이 기기에 사본이 없으면 올릴 것도 없다", async () => {
    const up = vi.fn();
    getDoc.mockResolvedValue(snap(null));
    expect(await loadSynced("없음", {}, pickList, { onLocalNewer: up })).toBeNull();
    expect(up).not.toHaveBeenCalled();
  });

  it("올리기가 실패(거부·예외)해도 불러오기는 그대로 성공한다", async () => {
    saveLocal("k", ["로컬"]);
    getDoc.mockResolvedValue(snap(null));
    expect(await loadSynced("k", {}, pickList, { onLocalNewer: () => Promise.reject(new Error("denied")) })).toEqual(["로컬"]);
    expect(await loadSynced("k", {}, pickList, { onLocalNewer: () => { throw new Error("boom"); } })).toEqual(["로컬"]);
  });

  it("onLocalNewer 를 주지 않으면 예전과 똑같이 동작한다", async () => {
    saveLocal("k", ["로컬"]);
    getDoc.mockResolvedValue(snap(null));
    expect(await loadSynced("k", {}, pickList)).toEqual(["로컬"]);
  });
});

describe("saveLocal", () => {
  it("값과 저장 시각을 함께 저장하고, 저장 시각을 돌려준다", () => {
    const ts = saveLocal("k", { a: 1 });
    expect(JSON.parse(localStorage.getItem("k"))).toEqual({ a: 1 });
    expect(localStorage.getItem("k__updatedAt")).toBe(ts);
  });

  it("학급(키)이 다르면 서로 영향을 주지 않는다", async () => {
    saveLocal("A반", ["A"]);
    getDoc.mockResolvedValue(snap(null));
    expect(await loadSynced("B반", {}, pickList)).toBeNull();
  });
});
