import { describe, expect, it } from "vitest";
import {
  CHUNK_BYTES,
  MAX_ATTACHMENT_BYTES,
  chunkCount,
  chunkDocId,
  chunkRange,
  extensionOf,
  formatBytes,
  newAttachmentId,
  safeFileName,
  validateFile,
} from "./attachments";

describe("formatBytes", () => {
  it("단위를 맞춰 읽기 쉽게 바꾼다", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(9 * 1024 * 1024)).toBe("9.0 MB");
    expect(formatBytes(15.3 * 1024 * 1024)).toBe("15 MB");
  });

  it("숫자가 아니거나 음수면 빈 문자열", () => {
    expect(formatBytes(undefined)).toBe("");
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(NaN)).toBe("");
  });
});

describe("extensionOf", () => {
  it("마지막 확장자를 소문자로", () => {
    expect(extensionOf("계획서.HWPX")).toBe("hwpx");
    expect(extensionOf("a.b.c.pdf")).toBe("pdf");
  });
  it("확장자가 없으면 빈 문자열", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("")).toBe("");
    expect(extensionOf(undefined)).toBe("");
  });
});

describe("safeFileName", () => {
  it("경로 구분자와 제어문자를 지우고 한글은 남긴다", () => {
    // 핵심은 경로 구분자가 하나도 남지 않고, 숨김 파일(맨 앞 점)이 되지 않는 것
    const traversal = safeFileName("../../etc/passwd");
    expect(traversal).not.toMatch(/[\\/]/);
    expect(traversal.startsWith(".")).toBe(false);
    expect(safeFileName("업무 계획서(최종).hwp")).toBe("업무 계획서(최종).hwp");
    expect(safeFileName("a\\b/c\nd")).toBe("a_b_c_d");
  });
  it("빈 이름이면 file", () => {
    expect(safeFileName("")).toBe("file");
    expect(safeFileName("...")).toBe("file");
  });
  it("너무 길면 자른다", () => {
    expect(safeFileName("가".repeat(500)).length).toBe(150);
  });
});

describe("newAttachmentId", () => {
  it("/ 없이 영문 소문자·숫자만 쓰고, 난수가 다르면 다른 ID", () => {
    const a = newAttachmentId(1_700_000_000_000, 0.1);
    const b = newAttachmentId(1_700_000_000_000, 0.9);
    expect(a).toMatch(/^[0-9a-z]+$/);
    expect(a).not.toBe(b);
  });
});

describe("조각 나누기", () => {
  it("조각 수는 올림, 빈 파일은 0", () => {
    expect(chunkCount(0)).toBe(0);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(CHUNK_BYTES)).toBe(1);
    expect(chunkCount(CHUNK_BYTES + 1)).toBe(2);
  });

  it("구간을 모두 이어 붙이면 빈틈·겹침 없이 파일 전체가 된다", () => {
    const size = CHUNK_BYTES * 3 + 123;
    const n = chunkCount(size);
    let expectedStart = 0;
    for (let i = 0; i < n; i++) {
      const [s, e] = chunkRange(i, size);
      expect(s).toBe(expectedStart);
      expect(e).toBeGreaterThan(s);
      expectedStart = e;
    }
    expect(expectedStart).toBe(size);
  });

  it("조각 하나는 Firestore 문서 한계(1MiB)와 rules 의 제한(900000)을 넘지 않는다", () => {
    expect(CHUNK_BYTES).toBeLessThanOrEqual(900000);
  });

  it("조각 문서 ID 는 번호를 0 으로 채워 이름순이 곧 순서가 된다", () => {
    expect(chunkDocId("abc", 0)).toBe("abc_000");
    expect(chunkDocId("abc", 31)).toBe("abc_031");
    const ids = [10, 2, 1].map((i) => chunkDocId("x", i)).sort();
    expect(ids).toEqual(["x_001", "x_002", "x_010"]);
  });
});

describe("validateFile", () => {
  it("정상 파일은 null", () => {
    expect(validateFile({ size: 1024 })).toBeNull();
    expect(validateFile({ size: MAX_ATTACHMENT_BYTES })).toBeNull();
  });
  it("빈 파일·너무 큰 파일·이상한 입력은 이유를 돌려준다", () => {
    expect(validateFile({ size: 0 })).toMatch(/빈 파일/);
    expect(validateFile({ size: MAX_ATTACHMENT_BYTES + 1 })).toMatch(/이하/);
    expect(validateFile(null)).toMatch(/읽을 수/);
  });
});
