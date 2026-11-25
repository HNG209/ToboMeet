const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,

  // Listen for screen share requests from Electron Main Process
  onScreenShareRequest: (callback) =>
    ipcRenderer.on("show-screen-share-dialog", (_event, sources) =>
      callback(sources),
    ),

  // Send the selected screen/window ID back to Electron
  selectScreenShare: (sourceId) =>
    ipcRenderer.send("screen-share-selected", sourceId),

  // Open directory selection dialog
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  prepareRecording: () => ipcRenderer.invoke("prepare-recording"),
  startRecording: (config) => ipcRenderer.send("start-recording", config),
  saveVideoChunk: (buffer) => ipcRenderer.send("save-video-chunk", buffer),
  stopRecording: () => ipcRenderer.send("stop-recording"),

  // Meeting window close confirmation
  onTriggerLeaveMeeting: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("trigger-leave-meeting", listener);
    return () => ipcRenderer.removeListener("trigger-leave-meeting", listener);
  },
  confirmCloseMeetingWindow: () => {
    return ipcRenderer.invoke("meeting:close-window");
  },

  // Navigation listener triggered by desktop notification click
  onNavigate: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("navigate-to", listener);
    return () => ipcRenderer.removeListener("navigate-to", listener);
  },

  // Auto-start settings API
  getAutoStart: () => ipcRenderer.invoke("app:get-auto-start"),
  setAutoStart: (enable) => ipcRenderer.invoke("app:set-auto-start", enable),

  // Window controls API for frameless title bar
  windowControls: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizeChange: (callback) => {
      const listener = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on("window:maximize-change", listener);
      return () => ipcRenderer.removeListener("window:maximize-change", listener);
    },
  },

  // External browser authentication API (Loopback in Dev / Custom Protocol in Prod)
  auth: {
    getMode: () => ipcRenderer.invoke("auth:get-mode"),
    openExternal: (options) => ipcRenderer.invoke("auth:open-external", options),
    cancelExternal: () => ipcRenderer.invoke("auth:cancel-external"),
    onAuthCallback: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("auth:desktop-callback", listener);
      return () => ipcRenderer.removeListener("auth:desktop-callback", listener);
    },
    onAuthError: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("auth:desktop-error", listener);
      return () => ipcRenderer.removeListener("auth:desktop-error", listener);
    },
  },

  // Socket.IO Bridge API
  socket: {
    emit: (eventName, ...args) => {
      ipcRenderer.send("socket:emit", { eventName, args });
    },
    connect: (config) => {
      ipcRenderer.send("socket:connect", config);
    },
    disconnect: () => {
      ipcRenderer.send("socket:disconnect");
    },
    getStatus: () => ipcRenderer.invoke("socket:get-status"),
    onEvent: (callback) => {
      const listener = (_event, eventName, ...args) => callback(eventName, ...args);
      ipcRenderer.on("socket:event", listener);
      return () => ipcRenderer.removeListener("socket:event", listener);
    },
    onConnect: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("socket:connect", listener);
      return () => ipcRenderer.removeListener("socket:connect", listener);
    },
    onDisconnect: (callback) => {
      const listener = (_event, reason) => callback(reason);
      ipcRenderer.on("socket:disconnect", listener);
      return () => ipcRenderer.removeListener("socket:disconnect", listener);
    },
    onError: (callback) => {
      const listener = (_event, error) => callback(error);
      ipcRenderer.on("socket:error", listener);
      return () => ipcRenderer.removeListener("socket:error", listener);
    },
  },
});

