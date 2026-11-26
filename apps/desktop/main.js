const { app, session } = require("electron");
const { APP_NAME, APP_ID } = require("./src/constants");
const {
  createMainWindow,
  getMainWindow,
  restoreAndFocus,
} = require("./src/windowManager");
const { createTray, destroyTray } = require("./src/trayManager");
const {
  initMainSocket,
  setupSocketIpc,
  disconnectSocket,
} = require("./src/socketManager");
const { setupScreenShareHandler } = require("./src/screenShare");
const {
  setupRecordingIpc,
  hasPendingRecordingExports,
  waitForRecordingExports,
} = require("./src/recording");
const {
  registerProtocolClient,
  setupDesktopAuthIpc,
  handleProtocolUrl,
  extractProtocolUrlFromArgv,
  flushQueuedDeepLink,
  cleanupDesktopAuth,
} = require("./src/desktopAuth");

// Set Windows App User Model ID so notifications and taskbar show 'ToboMeet'
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}
app.setName(APP_NAME);

// Đăng ký Custom Protocol tobomeet:// (dùng cho bản Prod & hỗ trợ fallback)
registerProtocolClient();

// ==========================================
// SINGLE INSTANCE LOCK & DEEP LINK HANDLERS
// ==========================================
let isQuitting = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // Windows & Linux: bắt URL tobomeet:// khi hệ điều hành gọi lại instance đang chạy
  app.on("second-instance", (_event, commandLine) => {
    restoreAndFocus();
    const deepLinkUrl = extractProtocolUrlFromArgv(commandLine);
    if (deepLinkUrl) {
      handleProtocolUrl(deepLinkUrl);
    }
  });

  // macOS: bắt URL tobomeet:// qua sự kiện open-url
  app.on("open-url", (event, url) => {
    event.preventDefault();
    restoreAndFocus();
    handleProtocolUrl(url);
  });
}

// ==========================================
// APPLICATION LIFECYCLE
// ==========================================
async function handleQuit() {
  isQuitting = true;
  if (hasPendingRecordingExports()) {
    console.log("[Main] Waiting for background recording exports to finish before quitting...");
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.hide();
    }
    try {
      await waitForRecordingExports();
    } catch (err) {
      console.warn("[Main] Error while waiting for recording exports:", err);
    }
  }
  cleanupDesktopAuth();
  destroyTray();
  disconnectSocket();
  app.quit();
}

app.whenReady().then(() => {
  // 1. Configure session permissions
  const meetingSession = session.fromPartition("persist:tobomeet");
  meetingSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  // 2. Initialize screen sharing, recording, and external browser auth handlers
  setupScreenShareHandler(meetingSession);
  setupRecordingIpc();
  setupDesktopAuthIpc();

  // 3. Initialize Socket.IO bridge and connection
  setupSocketIpc();
  initMainSocket();

  // 4. Create primary window
  const isHiddenStartup = process.argv.includes("--hidden") || process.argv.includes("--minimized");

  const mainWindow = createMainWindow({
    startHidden: isHiddenStartup,
    onCloseRequested: (event) => {
      if (!isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    },
  });

  // Xử lý deep link nếu app được khởi động trực tiếp từ tobomeet://
  const initialDeepLink = extractProtocolUrlFromArgv(process.argv);
  if (initialDeepLink) {
    mainWindow.webContents.once("did-finish-load", () => {
      handleProtocolUrl(initialDeepLink);
    });
  } else {
    mainWindow.webContents.once("did-finish-load", () => {
      flushQueuedDeepLink();
    });
  }

  // 5. Create system tray
  createTray({
    onOpen: () => {
      restoreAndFocus();
    },
    onQuit: () => {
      handleQuit();
    },
  });

  app.on("activate", () => {
    const win = getMainWindow();
    if (win) {
      restoreAndFocus();
    } else {
      createMainWindow({
        onCloseRequested: (event) => {
          if (!isQuitting) {
            event.preventDefault();
            const currentWin = getMainWindow();
            if (currentWin) currentWin.hide();
          }
        },
      });
    }
  });
});

let isWaitingForExportsOnQuit = false;

app.on("before-quit", (event) => {
  isQuitting = true;
  if (hasPendingRecordingExports() && !isWaitingForExportsOnQuit) {
    event.preventDefault();
    isWaitingForExportsOnQuit = true;
    console.log("[Main] Waiting for background recording exports before quitting...");
    waitForRecordingExports().finally(() => {
      app.quit();
    });
    return;
  }
  cleanupDesktopAuth();
  disconnectSocket();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (isQuitting) {
      app.quit();
    }
  }
});
