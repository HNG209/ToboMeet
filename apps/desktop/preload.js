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

