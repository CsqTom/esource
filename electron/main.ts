import { app, BrowserWindow } from "electron";
import path from "path";
import { registerRepoHandlers } from "./ipc/repo";

const isDev = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;
let wasMinimized = false;

function sendFetchAllSignal() {
  mainWindow?.webContents?.send("esource:fetch-all-repos");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "eSource - Git GUI",
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // 监听窗口从最小化恢复：恢复后通知渲染进程获取所有项目
  mainWindow.on("minimize", () => { wasMinimized = true; });
  mainWindow.on("restore", () => { wasMinimized = false; sendFetchAllSignal(); });

  mainWindow.on("closed", () => {
    wasMinimized = false;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 注册所有 IPC 处理器
  registerRepoHandlers();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
