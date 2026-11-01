const { BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { TARGET_URL, ICON_PATH } = require("./constants");

let mainWindow = null;
let meetingWindow = null;
let isQuitting = false;
let isForceClosingMeeting = false;

function setQuitting(val) {
  isQuitting = !!val;
}

// IPC listener: xác nhận đóng cửa sổ cuộc họp sau khi rời phòng
ipcMain.handle("meeting:close-window", (event) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (meetingWindow && senderWin === meetingWindow && !meetingWindow.isDestroyed()) {
    isForceClosingMeeting = true;
    meetingWindow.close();
    return { isPopup: true };
  }
  // Cuộc họp đang chạy trực tiếp trên mainWindow
  return { isPopup: false };
});

ipcMain.on("meeting:close-confirmed", (event) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (meetingWindow && senderWin === meetingWindow && !meetingWindow.isDestroyed()) {
    isForceClosingMeeting = true;
    meetingWindow.close();
  }
});

/**
 * Creates the primary application window.
 * @param {Object} options
 * @param {Function} options.onCloseRequested - Callback when user attempts to close the window
 */
function createMainWindow({ onCloseRequested }) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "ToboMeet",
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: "persist:tobomeet",
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false, // Giữ hiệu năng ổn định, không đóng băng khi ẩn
      preload: path.join(__dirname, "../preload.js"),
    },
  });

  mainWindow.loadURL(TARGET_URL);

  // Prevent standard window destroy on close, hide to tray instead unless quitting
  mainWindow.on("close", (event) => {
    // Nếu mainWindow đang ở trong meeting (/meeting/...), kích hoạt xác nhận rời phòng thay vì ẩn vào Tray
    if (!isQuitting) {
      const currentUrl = mainWindow.webContents ? mainWindow.webContents.getURL() : "";
      if (currentUrl && currentUrl.includes("/meeting")) {
        event.preventDefault();
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("trigger-leave-meeting");
        }
        return;
      }
    }

    if (typeof onCloseRequested === "function") {
      onCloseRequested(event);
    }
  });

  // Handle popup windows and external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 1. Allow meeting rooms in a dedicated popup window
    if (url.includes("/meeting")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 800,
          minWidth: 800,
          minHeight: 600,
          title: "ToboMeet Meeting Room",
          icon: ICON_PATH,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: "persist:tobomeet",
            autoplayPolicy: "no-user-gesture-required",
            backgroundThrottling: false, // Không bóp xung nhịp/FPS khi thu nhỏ hoặc ẩn
            preload: path.join(__dirname, "../preload.js"),
          },
        },
      };
    }

    // 2. Open standard external web links in default system browser
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Track and handle dedicated meeting window lifecycle
  mainWindow.webContents.on("did-create-window", (childWindow, { url }) => {
    if (url && url.includes("/meeting")) {
      meetingWindow = childWindow;
      isForceClosingMeeting = false;

      // Khi người dùng bấm [X] ở cửa sổ cuộc họp
      meetingWindow.on("close", (event) => {
        if (!isForceClosingMeeting && !isQuitting) {
          event.preventDefault();
          // Bắn IPC xuống web renderer để kích hoạt sự kiện của nút rời cuộc họp (toast xác nhận)
          if (!meetingWindow.isDestroyed()) {
            meetingWindow.webContents.send("trigger-leave-meeting");
          }
        }
      });

      meetingWindow.on("closed", () => {
        meetingWindow = null;
        isForceClosingMeeting = false;

        // Nếu cửa sổ chính đang bị ẩn dưới khay hệ thống, tự động khôi phục lại khi cuộc họp kết thúc
        if (!isQuitting && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

function getMeetingWindow() {
  return meetingWindow;
}

/**
 * Checks whether the application window is running in the background (hidden or minimized).
 */
function isAppInBackground() {
  const isMainBg = !mainWindow || !mainWindow.isVisible() || mainWindow.isMinimized();
  const isMeetingBg = !meetingWindow || !meetingWindow.isVisible() || meetingWindow.isMinimized();
  return isMainBg && isMeetingBg;
}

/**
 * Shows and brings the active windows to the front.
 */
function restoreAndFocus() {
  if (meetingWindow && !meetingWindow.isDestroyed()) {
    if (meetingWindow.isMinimized()) {
      meetingWindow.restore();
    }
    if (!meetingWindow.isVisible()) {
      meetingWindow.show();
    }
    meetingWindow.focus();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  }
}

/**
 * Sends a navigation event to the Next.js renderer process.
 * @param {string} destinationPath
 */
function navigateTo(destinationPath) {
  if (destinationPath.includes("/meeting") && meetingWindow && !meetingWindow.isDestroyed()) {
    meetingWindow.webContents.send("navigate-to", destinationPath);
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("navigate-to", destinationPath);
  }
}

module.exports = {
  createMainWindow,
  getMainWindow,
  getMeetingWindow,
  isAppInBackground,
  restoreAndFocus,
  navigateTo,
  setQuitting,
};
