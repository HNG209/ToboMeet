const { ipcMain, Notification } = require("electron");
const { io } = require("socket.io-client");
const {
  DEFAULT_SOCKET_URL,
  CLIENT_ORIGIN,
  ICON_PATH,
  normalizeSocketUrl,
} = require("./constants");
const {
  getMainWindow,
  isAppInBackground,
  restoreAndFocus,
  navigateTo,
} = require("./windowManager");

let mainSocket = null;
let activeUserId = null;
let currentSocketConnectedUrl = "";
let currentServerUrl = DEFAULT_SOCKET_URL;

/**
 * Displays native OS notifications when the application is running in the background.
 * Notification types and text synchronize with useNotificationSocketEvents.
 * @param {Object} notif
 */
function showDesktopNotification(notif) {
  if (!Notification.isSupported()) return;

  const meta = notif.metadata || {};
  const win = getMainWindow();
  const currentUrl = win && !win.isDestroyed() ? win.webContents.getURL() : "";
  const roomId = meta.roomId;
  const isCurrentlyInRoom = Boolean(roomId && currentUrl.includes(`/room/${roomId}`));

  // Chỉ hiện popup thông báo về các bài đăng trong kênh nếu người dùng đang không ở trong phòng hiện tại
  if (
    isCurrentlyInRoom &&
    (notif.type === "CHANNEL_POST" ||
      notif.type === "ASSIGNMENT_CREATED" ||
      notif.type === "CHANNEL_EVENT_CREATED")
  ) {
    return;
  }

  let title = "ToboMeet";
  let body = "You have a new notification";

  switch (notif.type) {
    case "KICKED":
      title = "System Notification";
      body = `You have been removed from group ${meta.roomName || ""}.`;
      break;
    case "ROOM_DISBANDED":
      title = "Room Disbanded";
      body = `The owner has disbanded room ${meta.roomName || "group"}.`;
      break;
    case "PARTICIPANT_REMOVED":
      title = "Removed from Meeting";
      body = `You have been removed from meeting ${meta.meetingCode || ""}.`;
      break;
    case "CALENDAR_INVITE":
      title = "Event Invitation";
      body = `${meta.inviterName || "Someone"} invited you to event "${meta.title || meta.eventTitle || ""}".`;
      break;
    case "CALENDAR_START":
      title = "Event Starting";
      body = `Event "${meta.title || meta.eventTitle || "Event"}" is starting now.`;
      break;
    case "ROOM_REPORTED":
      title = "Room Reported";
      body = "Your room has been reported for a violation.";
      break;
    case "REPORT_RESOLVED":
      title = "Report Resolved";
      body = "Your report has been resolved by an administrator.";
      break;
    case "ROOM_BLOCKED":
      title = "Room Blocked";
      body = "Your room has been locked due to community guideline violations.";
      break;
    case "CHANNEL_POST":
      title = meta.channelName ? `New Post in #${meta.channelName}` : "New Post";
      body = meta.summary
        ? `${meta.authorName ? meta.authorName + ": " : ""}${meta.summary}`
        : `${meta.authorName || "Someone"} posted in #${meta.channelName || "channel"}.`;
      break;
    case "ASSIGNMENT_CREATED":
      title = meta.channelName ? `New Assignment in #${meta.channelName}` : "New Assignment";
      body = `${meta.authorName || "Teacher"} assigned: ${meta.title || "New assignment"}`;
      break;
    case "CHANNEL_EVENT_CREATED":
      title = meta.channelName ? `New Meeting in #${meta.channelName}` : "Channel Meeting";
      body = `${meta.hostName || "Host"} scheduled: ${meta.title || "Meeting"}`;
      break;
    default:
      body = notif.message || notif.title || "You have a new notification";
      break;
  }

  const notification = new Notification({
    title,
    body,
    icon: ICON_PATH,
    silent: false,
  });

  notification.on("click", () => {
    restoreAndFocus();

    if (meta.roomId && meta.channelId) {
      navigateTo(`/room/${meta.roomId}?channel=${meta.channelId}`);
    } else if (notif.type === "CALENDAR_START" && meta.meetingCode) {
      navigateTo(`/meeting/${meta.meetingCode}`);
    }
  });

  notification.show();
}

/**
 * Initializes and manages Socket.IO connection in the Electron Main process.
 * @param {string} [targetUrl] - Optional URL provided from renderer
 */
function initMainSocket(targetUrl) {
  const finalUrl = normalizeSocketUrl(targetUrl || currentServerUrl);

  // If already connected/connecting to the same URL, avoid redundant reconnection
  if (mainSocket && currentSocketConnectedUrl === finalUrl) {
    if (!mainSocket.connected) {
      mainSocket.connect();
    }
    if (activeUserId && mainSocket.connected) {
      mainSocket.emit("join_user_room", activeUserId);
    }
    return;
  }

  currentSocketConnectedUrl = finalUrl;
  currentServerUrl = finalUrl;

  if (mainSocket) {
    mainSocket.removeAllListeners();
    mainSocket.disconnect();
    mainSocket = null;
  }

  console.log(`[Main-Socket] Connecting to: ${currentServerUrl} with origin: ${CLIENT_ORIGIN}`);

  mainSocket = io(currentServerUrl, {
    autoConnect: true,
    withCredentials: true,
    transports: ["polling", "websocket"],
    extraHeaders: {
      origin: CLIENT_ORIGIN,
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  mainSocket.on("connect", () => {
    console.log(`[Main-Socket] Connected successfully. Socket ID: ${mainSocket.id}`);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("socket:connect");
    }
    if (activeUserId) {
      mainSocket.emit("join_user_room", activeUserId);
    }
  });

  mainSocket.on("disconnect", (reason) => {
    console.log(`[Main-Socket] Disconnected. Reason: ${reason}`);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("socket:disconnect", reason);
    }
  });

  mainSocket.on("connect_error", (error) => {
    console.warn(
      `[Main-Socket] Connection error: ${error.message}`,
      error.description ? `(description: ${error.description})` : "",
    );
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("socket:error", error.message);
    }
  });

  // Forward all incoming server events to the Next.js renderer process
  mainSocket.onAny((eventName, ...args) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("socket:event", eventName, ...args);
    }
  });

  // Background notifications listener
  mainSocket.on("receive_notifications", (notifications) => {
    if (isAppInBackground() && Array.isArray(notifications) && notifications.length > 0) {
      notifications.forEach((notif, index) => {
        if (!notif || !notif.canPopup) return;
        setTimeout(() => {
          showDesktopNotification(notif);
        }, index * 500);
      });

      // Acknowledge notified notifications to prevent repeated toasts
      const notifIds = notifications.map((n) => n._id).filter(Boolean);
      if (notifIds.length > 0) {
        mainSocket.emit("mark_notifications_notified", notifIds);
      }
    }
  });
}

/**
 * Registers IPC handlers for socket communication with renderer.
 */
function setupSocketIpc() {
  ipcMain.on("socket:emit", (_event, { eventName, args }) => {
    if (!mainSocket) return;

    if (eventName === "join_user_room" && args && args[0]) {
      activeUserId = args[0];
    }

    mainSocket.emit(eventName, ...(args || []));
  });

  ipcMain.on("socket:connect", (_event, config) => {
    if (config && config.url) {
      initMainSocket(config.url);
    } else if (mainSocket && !mainSocket.connected) {
      mainSocket.connect();
    } else if (!mainSocket) {
      initMainSocket();
    }
  });

  ipcMain.on("socket:disconnect", () => {
    if (mainSocket && mainSocket.connected) {
      mainSocket.disconnect();
    }
  });

  ipcMain.handle("socket:get-status", () => {
    return {
      connected: mainSocket ? mainSocket.connected : false,
      id: mainSocket ? mainSocket.id : null,
    };
  });
}

function disconnectSocket() {
  if (mainSocket) {
    mainSocket.disconnect();
  }
}

module.exports = {
  initMainSocket,
  setupSocketIpc,
  disconnectSocket,
};
