import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import * as jwt from "jsonwebtoken";
import { WebSocketServer } from "ws";
import {
    TLSocketRoom,
    NodeSqliteWrapper,
    SQLiteSyncStorage,
} from "@tldraw/sync-core";

const app = express();
const PORT = Number(process.env.PORT) || 3002;


// Enable CORS for health check and API calls
app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.header("Access-Control-Allow-Headers", "*");
    next();
});
app.use(express.json());

// Thư mục lưu trữ database SQLite cho từng room
const DATA_DIR = path.resolve(process.cwd(), "data", "rooms");
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Tạo đường dẫn file SQLite an toàn từ roomId
 */
function getRoomDbPath(roomId: string): string {
    const safeName = roomId.replace(/[^a-zA-Z0-9_-]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`);
    return path.join(DATA_DIR, `${safeName}.sqlite`);
}

interface ActiveRoom {
    room: TLSocketRoom;
    db: DatabaseSync;
}

// Bộ nhớ đệm các phòng đang có kết nối hoạt động
const rooms = new Map<string, ActiveRoom>();

// Mapping lưu trữ session đang hoạt động cho từng user trong từng room:
// Map<roomId, Map<userSub, string>> (roomId -> userSub -> activeSessionId)
const roomActiveSessions = new Map<string, Map<string, string>>();

// Mapping ngược từ sessionId -> { roomId, userSub } để dọn dẹp khi session kết thúc
const sessionToUserMap = new Map<string, { roomId: string; userSub: string }>();

/**
 * Lấy phòng hiện tại hoặc mở/khởi tạo cơ sở dữ liệu SQLite cho phòng
 */
function getOrCreateRoom(roomId: string): TLSocketRoom {
    const existing = rooms.get(roomId);
    if (existing) {
        return existing.room;
    }

    const dbPath = getRoomDbPath(roomId);
    const db = new DatabaseSync(dbPath);

    // Tối ưu hóa hiệu năng và độ an toàn cho SQLite
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");

    const sql = new NodeSqliteWrapper(db);
    const storage = new SQLiteSyncStorage({ sql });

    const room = new TLSocketRoom({
        storage,
        onSessionRemoved: (_room, { sessionId, numSessionsRemaining }) => {
            console.log(`🔌 Session ${sessionId} removed from room ${roomId}`);

            // Xử lý dọn dẹp mapping khi session ngắt kết nối
            const sessionInfo = sessionToUserMap.get(sessionId);
            if (sessionInfo) {
                sessionToUserMap.delete(sessionId);
                const userMap = roomActiveSessions.get(sessionInfo.roomId);
                if (userMap) {
                    // CHÚ Ý TRƯỜNG HỢP: sessionA bị disconnect trễ mà sessionB đã vào:
                    // Chỉ xoá khỏi active sessions nếu session đang lưu đúng là session vừa kết thúc!
                    if (userMap.get(sessionInfo.userSub) === sessionId) {
                        userMap.delete(sessionInfo.userSub);
                        console.log(`🧹 Cleaned active session ${sessionId} for user ${sessionInfo.userSub} in room ${sessionInfo.roomId}`);
                        if (userMap.size === 0) {
                            roomActiveSessions.delete(sessionInfo.roomId);
                        }
                    } else {
                        console.log(`⚠️ Ignored delayed disconnect for old session ${sessionId} of user ${sessionInfo.userSub} (Active session is ${userMap.get(sessionInfo.userSub)})`);
                    }
                }
            }

            // Khi không còn ai trong phòng, giải phóng RAM và đóng kết nối DB
            // Toàn bộ hình vẽ và trạng thái đã được lưu an toàn trong SQLite
            if (numSessionsRemaining === 0) {
                console.log(`💤 Room ${roomId} idle. Closing SQLite connection and unloading from memory.`);
                roomActiveSessions.delete(roomId);
                rooms.delete(roomId);
                room.close();
            }
        },
    });

    rooms.set(roomId, { room, db });
    return room;
}

// Health check endpoint
app.get("/", (_req, res) => {
    res.json({
        message: "ToboMeet Whiteboard Sync Server",
        status: "ok",
        persistence: "sqlite",
        auth: "RS256",
        activeRooms: rooms.size,
        dataDirectory: DATA_DIR,
    });
});

// Endpoint xem danh sách các phòng đã lưu trên ổ đĩa
app.get("/rooms", (_req, res) => {
    try {
        const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".sqlite"));
        const roomList = files.map((file) => {
            const stat = fs.statSync(path.join(DATA_DIR, file));
            return {
                fileName: file,
                sizeBytes: stat.size,
                lastModified: stat.mtime,
                isActiveInMemory: Array.from(rooms.keys()).some((r) => getRoomDbPath(r).endsWith(file)),
            };
        });
        res.json({ rooms: roomList });
    } catch (err: any) {
        res.status(500).json({ error: err?.message });
    }
});

/**
 * Cập nhật cấu hình phân quyền Whiteboard vào TLDocument.meta của tldraw room
 */
async function updateRoomWhiteboardSettings(roomId: string, settings: any) {
    const room = getOrCreateRoom(roomId);
    await room.updateStore(async (store) => {
        let doc = store.get("document:document") as any;
        if (doc) {
            doc.meta = {
                ...doc.meta,
                whiteboardSettings: settings,
            };
            store.put(doc);
        } else {
            store.put({
                id: "document:document",
                typeName: "document",
                gridSize: 10,
                name: "",
                meta: {
                    whiteboardSettings: settings,
                },
            } as any);
        }
    });
    console.log(`📋 Updated TLDocument.meta.whiteboardSettings for room ${roomId}:`, settings);
    return settings;
}

// Endpoint cập nhật cài đặt Whiteboard cho phòng
app.patch("/rooms/:roomId/settings", async (req, res) => {
    try {
        const { roomId } = req.params;
        const { settings } = req.body;
        if (!settings) {
            return res.status(400).json({ error: "Missing settings in request body" });
        }
        await updateRoomWhiteboardSettings(roomId, settings);
        res.json({ success: true, settings });
    } catch (err: any) {
        console.error(`Error updating settings for room ${req.params.roomId}:`, err);
        res.status(500).json({ error: err?.message || "Internal server error" });
    }
});

// Endpoint đọc cài đặt Whiteboard hiện tại của phòng
app.get("/rooms/:roomId/settings", (req, res) => {
    try {
        const { roomId } = req.params;
        const room = getOrCreateRoom(roomId);
        const doc = room.getRecord("document:document") as any;
        const settings = doc?.meta?.whiteboardSettings || null;
        res.json({ settings });
    } catch (err: any) {
        console.error(`Error reading settings for room ${req.params.roomId}:`, err);
        res.status(500).json({ error: err?.message || "Internal server error" });
    }
});

// HTTP server
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({
    server,
    path: "/sync",
});

wss.on("connection", (socket, request) => {
    const url = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "localhost"}`
    );

    const token = url.searchParams.get("token");
    let roomId = url.searchParams.get("roomId");

    let userSub = "demo-user";
    let userDisplayName = "Demo User";
    let isReadOnly = false;

    if (token) {
        const rawPublicKey = process.env.WHITEBOARD_PUBLIC_KEY;
        if (!rawPublicKey) {
            console.error("❌ WHITEBOARD_PUBLIC_KEY is not configured in .env");
            socket.close(1011, "Server configuration error");
            return;
        }

        const publicKey = rawPublicKey.replace(/\\n/g, "\n");
        let decoded: any;

        try {
            decoded = jwt.verify(token, publicKey, {
                algorithms: ["RS256"],
                issuer: "tobomeet-server",
                audience: "tobomeet-whiteboard",
            });
        } catch (err: any) {
            console.error(`❌ JWT verification failed: ${err.message}`);
            socket.close(1008, `Authentication failed: ${err.message}`);
            return;
        }

        // Lấy roomId từ token (meetingCode hoặc roomId)
        const tokenRoomId = decoded.roomId || decoded.meetingCode;
        if (!tokenRoomId) {
            console.error("❌ Token does not contain roomId or meetingCode");
            socket.close(1008, "Invalid token payload: missing roomId");
            return;
        }

        // Tự động phân giải roomId từ token (client không cần truyền tham số roomId)
        roomId = tokenRoomId;
        userSub = decoded.sub || "unknown";
        userDisplayName = decoded.displayName || "User";
        const userRole = decoded.role || "guest";
        isReadOnly = Boolean(decoded.isReadOnly ?? decoded.isReadonly ?? false);

        console.log(`Client connecting to room: ${roomId} (User: ${userSub} - ${userDisplayName}, Role: ${userRole}, ReadOnly: ${isReadOnly})`);
    } else {
        socket.close(1008, "Missing authentication token");
        return;
    }

    if (!roomId) {
        socket.close(1008, "Missing roomId");
        return;
    }

    const room = getOrCreateRoom(roomId);
    const sessionId = randomUUID();

    // Quản lý active sessions: kiểm tra xem user này đã có session nào đang hoạt động trong room chưa
    let userActiveMap = roomActiveSessions.get(roomId);
    if (!userActiveMap) {
        userActiveMap = new Map<string, string>();
        roomActiveSessions.set(roomId, userActiveMap);
    }

    const prevSessionId = userActiveMap.get(userSub);

    // Ghi nhận session mới là active TRƯỚC KHI kick session cũ.
    userActiveMap.set(userSub, sessionId);
    sessionToUserMap.set(sessionId, { roomId, userSub });

    console.log(`Session ${sessionId} joined ${roomId} (User: ${userSub}, isReadonly: ${isReadOnly})`);

    room.handleSocketConnect({
        sessionId,
        socket,
        isReadonly: isReadOnly,
    });

    // Sau khi session mới đã join room (numSessionsRemaining >= 1),
    // mới an toàn để kick session cũ — room sẽ không bị đóng do còn >= 1 session
    if (prevSessionId && prevSessionId !== sessionId) {
        console.log(`⚡ [Session Kick] User ${userSub} already has active session ${prevSessionId}. Kicking previous session for new session ${sessionId}...`);

        // Gửi thông điệp custom message thông báo phiên đã chuyển sang tab / thiết bị mới
        try {
            room.sendCustomMessage(prevSessionId, {
                type: "SESSION_TRANSFERRED",
                reason: "SESSION_TRANSFERRED",
                userSub,
                newSessionId: sessionId,
                message: "Bảng trắng đã được mở ở một tab hoặc thiết bị khác.",
            });
        } catch (err) {
            console.warn(`Failed to send custom message to previous session ${prevSessionId}:`, err);
        }

        // Disconnect session trước đó với fatal reason để client cũ không được tự động reconnect
        try {
            room.closeSession(prevSessionId, "SESSION_TRANSFERRED");
        } catch (err) {
            console.warn(`Failed to close previous session ${prevSessionId}:`, err);
        }
    }
});

// Graceful shutdown: đóng tất cả kết nối DB và room sạch sẽ khi server dừng
function handleShutdown(signal: string) {
    console.log(`\n🛑 Received ${signal}. Shutting down whiteboard server...`);
    roomActiveSessions.clear();
    sessionToUserMap.clear();
    for (const [roomId, { room, db }] of rooms.entries()) {
        console.log(`💾 Persisting and closing room: ${roomId}`);
        try {
            room.close();
            db.close();
        } catch (err) {
            console.error(`Error closing room ${roomId}:`, err);
        }
    }
    rooms.clear();
    server.close(() => {
        console.log("Server closed cleanly.");
        process.exit(0);
    });
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

server.listen(PORT, () => {
    console.log(`🚀 Whiteboard server running at http://localhost:${PORT}`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/sync`);
    console.log(`💾 SQLite persistence directory: ${DATA_DIR}`);
    if (typeof (global as any).gc === "function") {
        (global as any).gc();
    }
});
