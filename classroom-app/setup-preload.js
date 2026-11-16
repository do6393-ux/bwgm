// 교실 주소 넣는 창(setup.html)에 넣어 주는 다리.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("setup", {
  initial: () => ipcRenderer.invoke("setup:initial"),
  save: (text) => ipcRenderer.invoke("setup:save", text),
});
