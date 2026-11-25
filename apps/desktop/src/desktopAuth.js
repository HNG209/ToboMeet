const { app, ipcMain, shell } = require("electron");
const crypto = require("crypto");
const http = require("http");
const path = require("path");
const {
  TARGET_URL,
  AUTH_PROTOCOL,
  AUTH_CALLBACK_MODE,
} = require("./constants");
const { getMainWindow, restoreAndFocus } = require("./windowManager");

const AUTH_STATE_TTL_MS = 5 * 60 * 1000; // 5 phút

let pendingAuth = null; // { state, mode, expiresAt, timeoutId }
let loopbackServer = null;
let queuedDeepLinkUrl = null;

/**
 * Đăng ký Custom Protocol (tobomeet://) cho hệ điều hành.
 * Hỗ trợ cả bản đóng gói (Prod) lẫn môi trường dev trên Windows.
 */
function registerProtocolClient() {
  try {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [
          path.resolve(process.argv[1]),
        ]);
      }
    } else {
      app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
    }
  } catch (err) {
    console.error("[DesktopAuth] Failed to register protocol client:", err);
  }
}

function closeLoopbackServer() {
  if (loopbackServer) {
    try {
      loopbackServer.close();
    } catch {}
    loopbackServer = null;
  }
}

function clearPendingAuth() {
  if (pendingAuth?.timeoutId) {
    clearTimeout(pendingAuth.timeoutId);
  }
  pendingAuth = null;
  closeLoopbackServer();
}

function sendToMainWindow(channel, payload) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function renderLoopbackHtml({ success, title, message }) {
  const accent = success ? "#0052FF" : "#DC2626";
  const icon = success ? "&#10003;" : "&#10005;";
  const bgBadge = success ? "#EFF6FF" : "#FEF2F2";

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — ToboMeet</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0F172A;
    }
    .card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 20px;
      padding: 36px 32px;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
    }
    .badge {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: ${bgBadge};
      color: ${accent};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 18px;
    }
    h1 { margin: 0 0 10px; font-size: 20px; font-weight: 800; }
    p { margin: 0; font-size: 14px; line-height: 1.6; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
  ${success ? "<script>setTimeout(function(){ window.close(); }, 1800);</script>" : ""}
</body>
</html>`;
}

/**
 * Xác thực { code, state } nhận được từ Custom Protocol hoặc Loopback Server,
 * sau đó focus cửa sổ chính và gửi về renderer để thiết lập session Supabase.
 */
function processAuthCallback({ code, state, error }) {
  restoreAndFocus();

  if (error) {
    clearPendingAuth();
    sendToMainWindow("auth:desktop-error", {
      message: error,
    });
    return { ok: false, error };
  }

  if (!code || !state) {
    sendToMainWindow("auth:desktop-error", {
      message: "Thiếu mã xác thực từ trình duyệt.",
    });
    return { ok: false, error: "missing_params" };
  }

  if (!pendingAuth || Date.now() > pendingAuth.expiresAt) {
    clearPendingAuth();
    sendToMainWindow("auth:desktop-error", {
      message: "Phiên chờ đăng nhập đã hết hạn. Vui lòng thử lại.",
    });
    return { ok: false, error: "expired" };
  }

  const expectedBuf = Buffer.from(pendingAuth.state, "utf8");
  const actualBuf = Buffer.from(state, "utf8");
  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    sendToMainWindow("auth:desktop-error", {
      message: "Xác thực state không khớp. Yêu cầu bị từ chối.",
    });
    return { ok: false, error: "invalid_state" };
  }

  clearPendingAuth();
  sendToMainWindow("auth:desktop-callback", { code, state });
  return { ok: true };
}

/**
 * Khởi tạo HTTP server tạm trên 127.0.0.1 với cổng ngẫu nhiên (chế độ Dev / Loopback).
 */
function startLoopbackServer() {
  return new Promise((resolve, reject) => {
    closeLoopbackServer();

    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
        if (reqUrl.pathname !== "/auth-callback") {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not Found");
          return;
        }

        const code = reqUrl.searchParams.get("code") || "";
        const state = reqUrl.searchParams.get("state") || "";
        const error = reqUrl.searchParams.get("error") || "";

        const result = processAuthCallback({ code, state, error });

        res.writeHead(result.ok ? 200 : 400, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(
          renderLoopbackHtml(
            result.ok
              ? {
                  success: true,
                  title: "Đăng nhập thành công!",
                  message:
                    "ToboMeet Desktop đang tự động đăng nhập. Bạn có thể đóng tab trình duyệt này.",
                }
              : {
                  success: false,
                  title: "Đăng nhập không thành công",
                  message:
                    "Phiên xác thực đã hết hạn hoặc không hợp lệ. Vui lòng quay lại ứng dụng ToboMeet và thử lại.",
                },
          ),
        );
      } catch (err) {
        console.error("[DesktopAuth] Loopback handler error:", err);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Internal Error");
      }
    });

    server.on("error", (err) => {
      console.error("[DesktopAuth] Loopback server error:", err);
      reject(err);
    });

    // Chỉ bind 127.0.0.1 (local-only), port 0 để OS cấp cổng trống ngẫu nhiên
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      loopbackServer = server;
      resolve(address.port);
    });
  });
}

/**
 * Xử lý Deep Link URL dạng tobomeet://auth-callback?code=...&state=...
 */
function handleProtocolUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  if (!rawUrl.toLowerCase().startsWith(`${AUTH_PROTOCOL}://`)) return false;

  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    queuedDeepLinkUrl = rawUrl;
    return true;
  }

  try {
    const parsed = new URL(rawUrl);
    const route = (parsed.hostname || parsed.pathname.replace(/^\/+/, "")).toLowerCase();
    if (route === "auth-callback") {
      const code = parsed.searchParams.get("code") || "";
      const state = parsed.searchParams.get("state") || "";
      const error = parsed.searchParams.get("error") || "";
      processAuthCallback({ code, state, error });
      return true;
    }
  } catch (err) {
    console.error("[DesktopAuth] Failed to parse deep link URL:", err);
  }
  return false;
}

/**
 * Tìm URL deep link trong command line arguments (Windows / Linux second-instance hoặc cold start).
 */
function extractProtocolUrlFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  const prefix = `${AUTH_PROTOCOL}://`;
  return argv.find(
    (arg) => typeof arg === "string" && arg.toLowerCase().startsWith(prefix),
  ) || null;
}

function flushQueuedDeepLink() {
  if (queuedDeepLinkUrl) {
    const url = queuedDeepLinkUrl;
    queuedDeepLinkUrl = null;
    handleProtocolUrl(url);
  }
}

/**
 * Đăng ký các IPC handlers cho luồng xác thực trình duyệt ngoài.
 */
function setupDesktopAuthIpc() {
  ipcMain.handle("auth:get-mode", () => ({
    mode: AUTH_CALLBACK_MODE,
    protocol: AUTH_PROTOCOL,
  }));

  ipcMain.handle("auth:open-external", async (_event, options = {}) => {
    try {
      const mode = options?.mode === "signup" ? "signup" : "login";
      const locale = options?.locale === "en" ? "en" : "vi";

      clearPendingAuth();

      const state = crypto.randomBytes(24).toString("hex");
      let callbackMode = AUTH_CALLBACK_MODE;
      let callbackPort = null;

      if (callbackMode === "loopback") {
        try {
          callbackPort = await startLoopbackServer();
        } catch (err) {
          console.warn(
            "[DesktopAuth] Không thể mở Loopback server, tự động chuyển sang Custom Protocol:",
            err?.message || err,
          );
          callbackMode = "protocol";
        }
      }

      const timeoutId = setTimeout(() => {
        if (pendingAuth && pendingAuth.state === state) {
          clearPendingAuth();
          sendToMainWindow("auth:desktop-error", {
            message: "Hết thời gian chờ đăng nhập. Vui lòng thử lại.",
          });
        }
      }, AUTH_STATE_TTL_MS);

      pendingAuth = {
        state,
        mode: callbackMode,
        expiresAt: Date.now() + AUTH_STATE_TTL_MS,
        timeoutId,
      };

      const authUrl = new URL(`/${locale}/${mode}`, TARGET_URL);
      authUrl.searchParams.set("source", "desktop");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("callback_mode", callbackMode);
      if (callbackMode === "loopback" && callbackPort) {
        authUrl.searchParams.set("callback_port", String(callbackPort));
      }

      await shell.openExternal(authUrl.toString());

      return {
        success: true,
        callbackMode,
        url: authUrl.toString(),
      };
    } catch (err) {
      console.error("[DesktopAuth] open-external error:", err);
      clearPendingAuth();
      return {
        success: false,
        error: err?.message || "Không thể mở trình duyệt web.",
      };
    }
  });

  ipcMain.handle("auth:cancel-external", () => {
    clearPendingAuth();
    return { success: true };
  });
}

function cleanupDesktopAuth() {
  clearPendingAuth();
}

module.exports = {
  registerProtocolClient,
  setupDesktopAuthIpc,
  handleProtocolUrl,
  extractProtocolUrlFromArgv,
  flushQueuedDeepLink,
  cleanupDesktopAuth,
};

