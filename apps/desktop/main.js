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
const { setupRecordingIpc } = require("./src/recording");

// Set Windows App User Model ID so notifications and taskbar show 'ToboMeet'
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}
app.setName(APP_NAME);

// ==========================================
// SINGLE INSTANCE LOCK
// ==========================================
let isQuitting = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    restoreAndFocus();
  });
}

// ==========================================
// APPLICATION LIFECYCLE
// ==========================================
function handleQuit() {
  isQuitting = true;
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

  // 2. Initialize screen sharing and recording handlers
  setupScreenShareHandler(meetingSession);
  setupRecordingIpc();

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

app.on("before-quit", () => {
  isQuitting = true;
  disconnectSocket();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (isQuitting) {
      app.quit();
    }
  }
});
