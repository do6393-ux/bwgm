// public/push-sw.js(휴대폰 알림을 띄우는 서비스 워커)를 가짜 브라우저 환경에서 돌려 본다.
// (헤드리스 크롬은 알림을 실제로 띄우지 않아서 화면 시험으로는 확인할 수 없다)
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { chatPushPayload, readChatLink } from "./chatPush";

const CODE = fs.readFileSync(fileURLToPath(new URL("../../public/push-sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://bwgm.vercel.app";
const SID = "Ab3dE6gH9jK2mN5pQ8sT";

function boot(windows = []) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const registration = {
    async showNotification(title, options = {}) {
      const n = {
        title,
        ...options,
        close() {
          const i = shown.indexOf(n);
          if (i >= 0) shown.splice(i, 1);
        },
      };
      const i = shown.findIndex((x) => options.tag && x.tag === options.tag);
      if (i >= 0) shown.splice(i, 1, n);
      else shown.push(n);
    },
    async getNotifications({ tag } = {}) {
      return shown.filter((n) => !tag || n.tag === tag);
    },
  };
  const self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    skipWaiting() {},
    registration,
    location: { origin: ORIGIN },
    clients: {
      claim: async () => {},
      matchAll: async () => windows,
      openWindow: async (url) => {
        opened.push(url);
      },
    },
  };
  vm.runInNewContext(CODE, { self, URL, console });

  const fire = async (type, event) => {
    let pending = null;
    listeners[type]({ ...event, waitUntil: (p) => (pending = p) });
    await pending;
  };
  const push = (payload) => fire("push", { data: { json: () => payload } });
  const click = () => fire("notificationclick", { notification: shown[0] });
  return { shown, opened, push, click };
}

const msg = (mid, text, name = "") => chatPushPayload(SID, mid, { grade: 1, classNum: 7 }, { text, name, at: 1764200000000 });

describe("push-sw.js", () => {
  it("학생 메시지가 오면 반 이름 제목으로 알림을 띄운다", async () => {
    const sw = boot();
    await sw.push(msg("m1", "선생님 3교시 체육복 입어요?", "민수"));
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]).toMatchObject({
      title: "1학년 7반 교실",
      body: "민수: 선생님 3교시 체육복 입어요?",
      tag: `classroom-${SID}`,
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
    });
  });

  it("또 오면 쌓이지 않고 '새 메시지 N개'로 바뀌고, 같은 메시지가 다시 오면 울리지 않는다", async () => {
    const sw = boot();
    await sw.push(msg("m1", "첫째"));
    await sw.push(msg("m2", "둘째"));
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]).toMatchObject({ title: "1학년 7반 교실 · 새 메시지 2개", body: "교실: 둘째", renotify: true });
    await sw.push(msg("m2", "둘째"));
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]).toMatchObject({ title: "1학년 7반 교실 · 새 메시지 2개", renotify: false });
  });

  it("모르는 내용이 와도 알림은 띄운다 (브라우저는 알림 없는 푸시를 싫어한다)", async () => {
    const sw = boot();
    await sw.push({ hello: 1 });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe("부원여중 정보교사 포털");
  });

  it("알림을 누르면 열린 포털 창에 교실 채팅을 열라고 알리고 그 창을 앞으로", async () => {
    const posted = [];
    let focused = false;
    const portal = { url: `${ORIGIN}/#lessons`, postMessage: (m) => posted.push(m), focus: async () => (focused = true) };
    const kiosk = { url: `${ORIGIN}/?classroom=${SID}`, postMessage: () => posted.push("kiosk"), focus: async () => {} };
    const sw = boot([kiosk, portal]);
    await sw.push(msg("m1", "안녕"));
    await sw.click();
    expect(posted).toEqual([{ t: "open-classroom-chat", sid: SID, g: 1, c: 7 }]);
    expect(focused).toBe(true);
    expect(sw.opened).toEqual([]);
    expect(sw.shown).toHaveLength(0);
  });

  it("열린 포털 창이 없으면(교실 TV 창만 있어도) 교실 채팅 주소로 새 창을 연다", async () => {
    const kiosk = { url: `${ORIGIN}/?classroom=${SID}`, postMessage: () => {}, focus: async () => {} };
    const sw = boot([kiosk]);
    await sw.push(msg("m1", "안녕"));
    await sw.click();
    expect(sw.opened).toEqual([`${ORIGIN}/?chat=${SID}&g=1&c=7`]);
    expect(readChatLink(new URL(sw.opened[0]).searchParams)).toEqual({ sid: SID, grade: 1, classNum: 7 });
  });
});
