const {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  dialog,
  powerSaveBlocker,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const rawFfmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");
const { APP_NAME, ICON_PATH } = require("./constants");

// Hỗ trợ đường dẫn ffmpeg-static cả trong dev lẫn bản build ASAR unpacked
function resolveFfmpegPath() {
  if (!rawFfmpegPath) return null;
  if (rawFfmpegPath.includes("app.asar")) {
    const unpacked = rawFfmpegPath.replace("app.asar", "app.asar.unpacked");
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
  }
  return rawFfmpegPath;
}

const ffmpegPath = resolveFfmpegPath();

let writeStream = null;
let recordingConfig = { format: "webm", savePath: "", fps: 30, mimeType: "" };
let tempFilePath = "";
let recordingPowerSaveBlockerId = null;

// Hàng đợi xử lý xuất file trong nền (FFmpeg chạy độc lập khỏi UI phòng họp)
const exportQueue = [];
let isProcessingExportQueue = false;
let exportPowerSaveBlockerId = null;
const exportIdleResolvers = [];

function stopBlocker(id) {
  if (id !== null) {
    try {
      if (powerSaveBlocker.isStarted(id)) {
        powerSaveBlocker.stop(id);
      }
    } catch (err) {
      console.warn("[Recording] Failed to stop powerSaveBlocker:", err);
    }
  }
  return null;
}

function broadcastRecordingStatus(payload) {
  let hasActiveMeetingWindow = false;
  const windows = BrowserWindow.getAllWindows();

  for (const win of windows) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("recording:status", payload);
      const url = win.webContents.getURL() || "";
      if (url.includes("/meeting") && win.isVisible() && !win.isMinimized()) {
        hasActiveMeetingWindow = true;
      }
    } catch {
      // ignore closed webContents
    }
  }

  // Nếu người dùng đã rời/đóng hoặc thu nhỏ cửa sổ họp trong lúc xuất nền -> bắn OS Notification
  if (
    !hasActiveMeetingWindow &&
    Notification.isSupported() &&
    (payload.status === "completed" || payload.status === "error")
  ) {
    try {
      const notification = new Notification({
        title:
          payload.status === "completed"
            ? `${APP_NAME} — Đã lưu bản ghi`
            : `${APP_NAME} — Lỗi xuất bản ghi`,
        body:
          payload.status === "completed"
            ? path.basename(payload.filePath || "")
            : payload.error || "Không thể hoàn tất bản ghi cuộc họp.",
        icon: ICON_PATH,
      });

      if (payload.status === "completed" && payload.filePath) {
        notification.on("click", () => {
          if (fs.existsSync(payload.filePath)) {
            shell.showItemInFolder(payload.filePath);
          }
        });
      }

      notification.show();
    } catch (err) {
      console.warn("[Recording] Notification error:", err);
    }
  }
}

/**
 * Chạy tiến trình FFmpeg và trả về Promise.
 */
function runFfmpegArgs(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(new Error("FFmpeg binary not found"));
    }

    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) {
        stderr = stderr.slice(-4000);
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

/**
 * Trả về tham số video encoder chất lượng cao tương ứng từng phần cứng/phần mềm.
 */
function getVideoEncoderArgs(encoder) {
  switch (encoder) {
    case "h264_videotoolbox":
      return ["-c:v", "h264_videotoolbox", "-b:v", "8000k", "-pix_fmt", "yuv420p"];
    case "h264_nvenc":
      return [
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p4",
        "-rc",
        "vbr",
        "-cq",
        "19",
        "-b:v",
        "0",
        "-pix_fmt",
        "yuv420p",
      ];
    case "h264_qsv":
      return [
        "-c:v",
        "h264_qsv",
        "-preset",
        "faster",
        "-global_quality",
        "20",
        "-pix_fmt",
        "yuv420p",
      ];
    case "h264_amf":
      return [
        "-c:v",
        "h264_amf",
        "-quality",
        "balanced",
        "-rc",
        "cqp",
        "-qp_i",
        "19",
        "-qp_p",
        "19",
        "-pix_fmt",
        "yuv420p",
      ];
    case "libx264":
    default:
      return [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
      ];
  }
}

/**
 * Fast Remux: Khi MediaRecorder đã ghi sẵn H.264 (video/webm;codecs=h264,opus),
 * copy thẳng luồng video (-c:v copy) không giải mã/nén lại -> nhanh gấp 20-100 lần
 * và giữ nguyên 100% chất lượng gốc; chỉ chuyển đổi audio Opus -> AAC có aresample đồng bộ.
 */
async function remuxH264ToMp4(inputPath, outputPath) {
  const args = [
    "-y",
    "-fflags",
    "+genpts",
    "-i",
    inputPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-af",
    "aresample=async=1:first_pts=0",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await runFfmpegArgs(args);

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error("Fast remux produced empty MP4 output");
  }
}

/**
 * Chuyển đổi file WebM tạm sang MP4 chuẩn CFR + đồng bộ âm thanh aresample + faststart.
 * Ưu tiên Fast Remux (-c:v copy) nếu nguồn là H.264; fallback sang hardware encoder -> libx264.
 */
async function convertWebMToMp4(inputPath, outputPath, fps = 30, mimeType = "") {
  const isH264Source = /h264|avc1/i.test(mimeType || "");

  if (isH264Source) {
    try {
      console.log("[Recording] Source is H.264 -> trying fast MP4 remux (-c:v copy)...");
      await remuxH264ToMp4(inputPath, outputPath);
      console.log("[Recording] Fast H.264 MP4 remux completed successfully.");
      return;
    } catch (remuxErr) {
      console.warn(
        "[Recording] Fast H.264 remux failed, falling back to transcode:",
        remuxErr?.message,
      );
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath);
        } catch {
          // ignore
        }
      }
    }
  }

  const encoders =
    process.platform === "darwin"
      ? ["h264_videotoolbox", "libx264"]
      : ["h264_nvenc", "h264_qsv", "h264_amf", "libx264"];

  let lastError = null;

  for (const encoder of encoders) {
    const args = [
      "-y",
      "-fflags",
      "+genpts",
      "-i",
      inputPath,
      "-vsync",
      "cfr",
      "-r",
      String(fps),
      ...getVideoEncoderArgs(encoder),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-af",
      "aresample=async=1:first_pts=0",
      "-movflags",
      "+faststart",
      outputPath,
    ];

    try {
      console.log(`[Recording] Converting to MP4 in background using [${encoder}]...`);
      await runFfmpegArgs(args);
      console.log(`[Recording] Background MP4 conversion succeeded with [${encoder}].`);
      return;
    } catch (err) {
      lastError = err;
      console.warn(
        `[Recording] Encoder [${encoder}] unavailable/failed, trying next fallback...`,
      );
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath);
        } catch {
          // ignore
        }
      }
    }
  }

  throw lastError || new Error("All MP4 encoders failed");
}

/**
 * Remux nhanh file WebM (-c copy) để ghi đầy đủ Duration metadata & Cues giúp seek mượt.
 */
async function remuxWebM(inputPath, outputPath) {
  const args = [
    "-y",
    "-fflags",
    "+genpts",
    "-i",
    inputPath,
    "-c",
    "copy",
    outputPath,
  ];
  await runFfmpegArgs(args);
}

/**
 * Thực thi lần lượt các job xuất bản ghi trong nền (không chặn UI).
 */
async function processExportQueue() {
  if (isProcessingExportQueue) return;
  isProcessingExportQueue = true;

  if (exportPowerSaveBlockerId === null) {
    exportPowerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  }

  try {
    while (exportQueue.length > 0) {
      const job = exportQueue.shift();
      const { jobId, inputPath, finalPath, format, fps, mimeType } = job;

      try {
        if (format === "mp4") {
          await convertWebMToMp4(inputPath, finalPath, fps, mimeType);
        } else {
          try {
            await remuxWebM(inputPath, finalPath);
          } catch (remuxErr) {
            console.warn(
              "[Recording] WebM remux failed, falling back to direct copy:",
              remuxErr?.message,
            );
            await fs.promises.copyFile(inputPath, finalPath);
          }
        }

        if (fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
        }

        console.log(`[Recording] Background export finished (${jobId}): ${finalPath}`);
        broadcastRecordingStatus({
          jobId,
          status: "completed",
          filePath: finalPath,
          format,
        });
      } catch (err) {
        console.error(`[Recording] Background export failed (${jobId}):`, err);
        broadcastRecordingStatus({
          jobId,
          status: "error",
          error: err?.message || "Failed to finalize recording",
          format,
        });
      }
    }
  } finally {
    isProcessingExportQueue = false;
    exportPowerSaveBlockerId = stopBlocker(exportPowerSaveBlockerId);
    while (exportIdleResolvers.length > 0) {
      const resolve = exportIdleResolvers.shift();
      resolve?.();
    }
  }
}

function enqueueExportJob(job) {
  exportQueue.push(job);
  // Chạy bất đồng bộ trên event loop kế tiếp để IPC stop-recording trả về ngay lập tức
  setImmediate(() => {
    processExportQueue();
  });
}

function hasPendingRecordingExports() {
  return isProcessingExportQueue || exportQueue.length > 0;
}

function waitForRecordingExports() {
  if (!hasPendingRecordingExports()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    exportIdleResolvers.push(resolve);
  });
}

/**
 * Đăng ký các IPC handlers cho ghi hình cục bộ và lưu file.
 */
function setupRecordingIpc() {
  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("recording:show-in-folder", (_event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });

  ipcMain.handle("start-recording", async (_event, config) => {
    try {
      if (writeStream) {
        try {
          writeStream.destroy();
        } catch {
          // ignore
        }
        writeStream = null;
      }
      recordingPowerSaveBlockerId = stopBlocker(recordingPowerSaveBlockerId);

      recordingConfig = {
        format: config?.format === "mp4" ? "mp4" : "webm",
        savePath: config?.savePath || "",
        fps: Number(config?.fps) || 30,
        mimeType: typeof config?.mimeType === "string" ? config.mimeType : "",
      };

      const fileName = `ToboMeet-Record-${Date.now()}`;
      tempFilePath = path.join(app.getPath("temp"), `${fileName}.webm`);
      writeStream = fs.createWriteStream(tempFilePath);

      recordingPowerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");

      console.log(
        `[Recording] Started local recording temp stream (${recordingConfig.mimeType || "default"}): ${tempFilePath}`,
      );
      return { success: true };
    } catch (err) {
      console.error("[Recording] Failed to start recording:", err);
      recordingPowerSaveBlockerId = stopBlocker(recordingPowerSaveBlockerId);
      return { success: false, error: err?.message || "Failed to start recording" };
    }
  });

  ipcMain.handle("save-video-chunk", async (_event, arrayBuffer) => {
    if (!writeStream || !arrayBuffer) {
      return { success: false };
    }

    try {
      const buffer = Buffer.from(arrayBuffer);
      const canContinue = writeStream.write(buffer);
      if (!canContinue) {
        await new Promise((resolve, reject) => {
          writeStream.once("drain", resolve);
          writeStream.once("error", reject);
        });
      }
      return { success: true };
    } catch (err) {
      console.error("[Recording] Failed to write video chunk:", err);
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle("stop-recording", async () => {
    recordingPowerSaveBlockerId = stopBlocker(recordingPowerSaveBlockerId);

    if (!writeStream) {
      return { success: false, error: "No active recording session" };
    }

    const activeStream = writeStream;
    const inputPath = tempFilePath;
    const activeConfig = { ...recordingConfig };

    writeStream = null;
    tempFilePath = "";

    try {
      // Chỉ đợi đóng writeStream (~vài chục ms), sau đó đẩy FFmpeg sang hàng đợi nền
      await new Promise((resolve, reject) => {
        activeStream.once("finish", resolve);
        activeStream.once("error", reject);
        activeStream.end();
      });

      if (!fs.existsSync(inputPath) || fs.statSync(inputPath).size === 0) {
        if (fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
        }
        return { success: false, error: "Recorded file is empty" };
      }

      const folder = activeConfig.savePath || app.getPath("downloads");
      fs.mkdirSync(folder, { recursive: true });

      const timestamp = Date.now();
      const ext = activeConfig.format === "mp4" ? "mp4" : "webm";
      const finalPath = path.join(folder, `ToboMeet-Record-${timestamp}.${ext}`);
      const jobId = `rec-${timestamp}`;

      enqueueExportJob({
        jobId,
        inputPath,
        finalPath,
        format: activeConfig.format,
        fps: activeConfig.fps,
        mimeType: activeConfig.mimeType,
      });

      return {
        success: true,
        status: "processing",
        jobId,
        filePath: finalPath,
        format: activeConfig.format,
      };
    } catch (err) {
      console.error("[Recording] Failed to stop recording stream:", err);
      return {
        success: false,
        error: err?.message || "Failed to stop recording",
      };
    }
  });
}

module.exports = {
  setupRecordingIpc,
  convertWebMToMp4,
  hasPendingRecordingExports,
  waitForRecordingExports,
};
