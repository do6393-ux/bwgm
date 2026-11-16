// 교실 화면 웹에 넣어 주는 다리. 웹은 src/lib/classroomApp.js 에서 이것이 있으면 프로그램 안이라고 본다.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bwgmClassroomApp", {
  raise: () => ipcRenderer.invoke("classroom:raise"),
  lower: () => ipcRenderer.invoke("classroom:lower"),
});
