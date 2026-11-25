const { app } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;

/**
 * Normalizes Socket URL.
 * On Windows, Node.js in Electron resolves 'localhost' to IPv6 (::1),
 * which leads to ECONNREFUSED when backend binds to IPv4.
 */
function normalizeSocketUrl(url) {
  if (!url) return url;
  let cleanUrl = url.replace(/\/api\/?$/, "");
  if (isDev && cleanUrl.includes("localhost")) {
    cleanUrl = cleanUrl.replace("localhost", "127.0.0.1");
  }
  return cleanUrl;
}

const DEFAULT_SOCKET_URL = isDev
  ? process.env.SOCKET_URL || "http://127.0.0.1:3001"
  : process.env.SOCKET_URL || "https://tobomeet.com";

const PRODUCTION_URL = "https://tobo-meet.vercel.app";

const TARGET_URL = isDev
  ? "http://localhost:3000"
  : PRODUCTION_URL;

const CLIENT_ORIGIN = isDev ? "http://localhost:3000" : PRODUCTION_URL;

const APP_ID = "com.tobomeet.app";
const APP_NAME = "ToboMeet";
const AUTH_PROTOCOL = "tobomeet";
const DESKTOP_UA_MARKER = "ToboMeetDesktop";
const AUTH_CALLBACK_MODE =
  process.env.DESKTOP_AUTH_MODE === "protocol" ||
  process.env.DESKTOP_AUTH_MODE === "loopback"
    ? process.env.DESKTOP_AUTH_MODE
    : isDev
      ? "loopback"
      : "protocol";
const ICON_PATH = path.join(__dirname, "../assets/icon.png");

module.exports = {
  isDev,
  normalizeSocketUrl,
  DEFAULT_SOCKET_URL,
  TARGET_URL,
  CLIENT_ORIGIN,
  APP_ID,
  APP_NAME,
  AUTH_PROTOCOL,
  DESKTOP_UA_MARKER,
  AUTH_CALLBACK_MODE,
  ICON_PATH,
};
