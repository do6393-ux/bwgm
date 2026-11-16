// 부원 교실 화면: 교실 컴퓨터에 까는 작은 프로그램.
// 포털의 교실 화면 주소(?classroom=…)를 전체 화면으로 띄운다. 화면 내용은 웹 그대로라 포털을 고치면 저절로 바뀐다.
// 선생님 메시지가 오면 웹(src/lib/classroomApp.js)이 raise 를 부르고, 프로그램은 내려가 있던 창을 맨 앞으로 올린다.
const { app, BrowserWindow, Menu, Tray, clipboard, ipcMain, nativeImage, powerSaveBlocker } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const TITLE = "부원 교실 화면";
const ICON = path.join(__dirname, "icon.png");
const RETRY_MS = 30 * 1000; // 인터넷이 안 되면 이만큼 뒤 다시 연다
const TOP_HOLD_MS = 1500; // 올릴 때만 잠깐 맨 위에 고정 (그 뒤에는 다른 선생님이 자기 창을 다시 고를 수 있다)
const SCREEN_ID = /^[A-Za-z0-9]{20,40}$/; // 포털 src/lib/classroomChat.js 의 isScreenId 와 같은 모양

let win = null;
let setupWin = null;
let tray = null;
let currentUrl = null;
let quitting = false;
let retryTimer = null;
let topTimer = null;
let awakeId = null;

// 개발할 때만: BWGM_DEBUG=<파일 경로> 이면 무슨 일이 있었는지 그 파일에 적는다
const DEBUG_FILE = app.isPackaged ? null : process.env.BWGM_DEBUG || null;
const debug = (...args) => {
  if (!DEBUG_FILE) return;
  const line = [new Date().toISOString().slice(11, 19), ...args.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))].join(" ");
  fs.appendFileSync(DEBUG_FILE, `${line}\n`, "utf8");
};

// ── 교실 주소 (프로그램 데이터 폴더의 config.json) ──

/** 교실 화면 주소면 깨끗한 주소, 아니면 null. 개발할 때만 http://localhost 도 된다 */
function checkUrl(text) {
  try {
    const u = new URL(String(text || "").trim());
    const local = !app.isPackaged && u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
    if (u.protocol !== "https:" && !local) return null;
    const id = u.searchParams.get("classroom") || "";
    if (!SCREEN_ID.test(id)) return null;
    return `${u.origin}/?classroom=${id}`;
  } catch {
    return null;
  }
}

const configPath = () => path.join(app.getPath("userData"), "config.json");

function readSavedUrl() {
  try {
    return checkUrl(JSON.parse(fs.readFileSync(configPath(), "utf8")).url);
  } catch {
    return null;
  }
}

function saveUrl(url) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ url }, null, 2), "utf8");
}

// ── 교실 화면 창 ──

function setAwake(on) {
  if (on && awakeId === null) awakeId = powerSaveBlocker.start("prevent-display-sleep");
  if (!on && awakeId !== null) {
    powerSaveBlocker.stop(awakeId);
    awakeId = null;
  }
}

function load() {
  clearTimeout(retryTimer);
  if (win && currentUrl) win.loadURL(currentUrl).catch(() => {});
}

function fromClassroom(event) {
  if (!win || event.sender !== win.webContents || !currentUrl) return false;
  try {
    const ok = new URL(event.senderFrame.url).origin === new URL(currentUrl).origin;
    if (!ok) debug("거절: 다른 주소에서 부름", event.senderFrame.url);
    return ok;
  } catch {
    return false;
  }
}

/** 창을 맨 앞에 전체 화면으로 */
function bringUp() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  if (!win.isFullScreen()) win.setFullScreen(true);
  win.setAlwaysOnTop(true, "screen-saver");
  win.moveTop();
  win.focus();
  clearTimeout(topTimer);
  topTimer = setTimeout(() => {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  }, TOP_HOLD_MS);
}

function lower() {
  if (!win) return;
  clearTimeout(topTimer);
  win.setAlwaysOnTop(false);
  win.minimize();
}

function openClassroom(url) {
  currentUrl = url;
  if (win) {
    load();
    bringUp();
    return;
  }
  win = new BrowserWindow({
    title: TITLE,
    icon: ICON,
    show: false,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#2b2b2b",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // 내려가 있어도 메시지를 계속 받는다
    },
  });
  win.setMenu(null);
  if (DEBUG_FILE) {
    win.webContents.on("console-message", (event) => debug("page:", event.message));
    win.webContents.on("input-event", (_event, input) => {
      if (input.type === "mouseDown" || input.type === "keyDown") debug("input:", input.type);
    });
  }
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, target) => {
    try {
      if (new URL(target).origin === new URL(currentUrl).origin) return;
    } catch {
      // 아래에서 막는다
    }
    event.preventDefault();
  });
  win.webContents.on("did-fail-load", (_event, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: 다른 주소를 여느라 그만둔 것
    win.loadFile(path.join(__dirname, "offline.html")).catch(() => {});
    clearTimeout(retryTimer);
    retryTimer = setTimeout(load, RETRY_MS);
  });
  win.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle(TITLE);
  });
  win.once("ready-to-show", () => {
    bringUp(); // 컴퓨터를 켜고 저절로 시작했을 때도 맨 앞에
    setAwake(true);
  });
  // 창 닫기(Alt+F4 등)는 내려놓기로. 정말 끄려면 알림 영역 아이콘 › 끝내기
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    lower();
  });
  // 컴퓨터를 끌 때는 막지 않고 끝낸다
  win.on("query-session-end", () => {
    quitting = true;
  });
  win.on("session-end", () => {
    quitting = true;
    app.quit();
  });
  win.on("minimize", () => setAwake(false));
  win.on("restore", () => setAwake(true));
  win.on("closed", () => {
    win = null;
  });
  load();
}

// ── 교실 주소 넣는 창 ──

function openSetup() {
  if (setupWin) {
    setupWin.focus();
    return;
  }
  setupWin = new BrowserWindow({
    title: `${TITLE} · 교실 주소`,
    icon: ICON,
    width: 600,
    height: 470,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    alwaysOnTop: !!win, // 교실 화면이 떠 있으면 그 위에
    backgroundColor: "#f6f7f9",
    webPreferences: { preload: path.join(__dirname, "setup-preload.js"), contextIsolation: true, sandbox: true },
  });
  setupWin.setMenu(null);
  setupWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  setupWin.webContents.on("will-navigate", (event) => event.preventDefault());
  setupWin.loadFile(path.join(__dirname, "setup.html")).catch(() => {});
  setupWin.on("closed", () => {
    setupWin = null;
    if (!win) app.quit(); // 처음에 주소를 안 넣고 닫으면 끝낸다
  });
}

ipcMain.handle("setup:initial", (event) => {
  if (!setupWin || event.sender !== setupWin.webContents) return null;
  return { current: currentUrl || "", fromClipboard: checkUrl(clipboard.readText()) || "" };
});

ipcMain.handle("setup:save", (event, text) => {
  if (!setupWin || event.sender !== setupWin.webContents) return { ok: false };
  const url = checkUrl(text);
  if (!url) return { ok: false };
  saveUrl(url);
  // 컴퓨터를 켜면 저절로 켜지게 (설치한 프로그램일 때만)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  openClassroom(url);
  setupWin.close();
  return { ok: true };
});

// ── 웹(교실 화면)이 부르는 것 ──

ipcMain.handle("classroom:raise", (event) => {
  if (!fromClassroom(event)) return false;
  const wasDown = win.isMinimized() || !win.isVisible() || !win.isFocused();
  debug("raise", { minimized: win.isMinimized(), visible: win.isVisible(), focused: win.isFocused() });
  bringUp();
  return wasDown;
});

ipcMain.handle("classroom:lower", (event) => {
  if (!fromClassroom(event)) return;
  debug("lower");
  lower();
});

// ── 알림 영역 아이콘 ──

function makeTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip(TITLE);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "교실 화면 보기", click: () => (win ? bringUp() : openSetup()) },
      { label: "교실 주소 바꾸기", click: openSetup },
      { label: "다시 불러오기", click: load },
      { type: "separator" },
      {
        label: "끝내기",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => (win ? bringUp() : openSetup()));
}

// ── 시작 ──

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => (win ? bringUp() : openSetup()));
  app.on("before-quit", () => {
    quitting = true;
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    makeTray();
    // 개발할 때만: BWGM_CLASSROOM_URL 로 시험 주소를 바로 연다
    const devUrl = !app.isPackaged && process.env.BWGM_CLASSROOM_URL;
    const url = devUrl || readSavedUrl();
    if (url) openClassroom(url);
    else openSetup();
  });
}
