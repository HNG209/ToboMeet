const { BrowserWindow, desktopCapturer, ipcMain } = require("electron");

/**
 * Configures display media request handlers for screen sharing in meetings.
 * @param {Electron.Session} meetingSession
 */
function setupScreenShareHandler(meetingSession) {
  meetingSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    let isCallbackCalled = false;
    const safeCallback = (data) => {
      if (!isCallbackCalled) {
        isCallbackCalled = true;
        callback(data);
      }
    };

    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (!focusedWindow) {
        return safeCallback();
      }

      // Screen sharing in meeting (shows picker dialog to user)
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
      });

      const serializedSources = sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
      }));

      focusedWindow.webContents.send(
        "show-screen-share-dialog",
        serializedSources,
      );

      ipcMain.once("screen-share-selected", (_event, sourceId) => {
        if (!sourceId) {
          return safeCallback();
        }

        const selectedSource = sources.find((s) => s.id === sourceId);
        if (selectedSource) {
          return safeCallback({ video: selectedSource, audio: "loopback" });
        } else {
          return safeCallback();
        }
      });
    } catch (err) {
      console.error("[ScreenShare] Error retrieving screen sources:", err);
      safeCallback();
    }
  });
}

module.exports = {
  setupScreenShareHandler,
};
