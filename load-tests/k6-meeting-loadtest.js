import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';

/**
 * =========================================================================
 * KỊCH BẢN LOAD TEST TOÀN DIỆN CHO HỆ THỐNG TOBOMEET (HYBRID MIXED WORKLOAD)
 * =========================================================================
 * 
 * Các nguyên tắc và ràng buộc nghiệp vụ hệ thống:
 * 1. BẮT BUỘC: GET /api/users/me phải là API ĐẦU TIÊN của mỗi người dùng
 *    (Người dùng chỉ được tạo/đồng bộ vào MongoDB khi gọi /me).
 * 2. Ràng buộc phòng và kênh (Business Constraints):
 *    - Mỗi người dùng chỉ được tạo & tham gia TỐI ĐA 100 PHÒNG.
 *    - Mỗi phòng chỉ có TỐI ĐA 50 KÊNH.
 *    - Mỗi phòng chỉ chứa TỐI ĐA 100 THÀNH VIÊN.
 * 3. Tỉ lệ tải: 75% Đọc (Read) - 25% Ghi (Write).
 * 4. Phân luồng người dùng:
 *    - 80% VUs: Trong phòng họp (Join, Member status, Polls Vote, Whiteboard, ScreenShare, Attendance).
 *    - 20% VUs: Ngoài phòng họp (Dashboard, Tạo phòng, Tham gia phòng, Chat 1-1).
 * 5. Mock LiveKit Proxy: Backend chạy với LOAD_TEST_MODE=true trong .env
 */

// ---------------------------------------------------------
// CUSTOM METRICS ĐO ĐỘ TRỄ CHI TIẾT THEO TỪNG NHÓM
// ---------------------------------------------------------
const joinDuration = new Trend('join_duration', true);
const readOpsDuration = new Trend('read_ops_duration', true);
const writeOpsDuration = new Trend('write_ops_duration', true);
const dashboardDuration = new Trend('dashboard_ops_duration', true);
const failureRate = new Rate('custom_failure_rate');
const opCounter = new Counter('total_operations_count');

// ---------------------------------------------------------
// OPTIONS & THRESHOLDS (MỤC TIÊU HIỆU NĂNG)
// ---------------------------------------------------------
export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Giai đoạn 1: Khởi động tăng dần lên 20 VUs
    { duration: '45s', target: 50 },  // Giai đoạn 2: Tăng tốc lên 50 VUs
    { duration: '1m', target: 100 },  // Giai đoạn 3: Đạt đỉnh tải 100 VUs cùng lúc
    { duration: '1m', target: 100 },  // Giai đoạn 4: Duy trì ổn định ở 100 VUs
    { duration: '30s', target: 0 },   // Giai đoạn 5: Hạ tải về 0
  ],
  thresholds: {
    // 95% request phải phản hồi dưới 250ms (nhờ có Mock LiveKit Proxy và In-memory session cache)
    http_req_duration: ['p(95)<250', 'p(99)<600'],
    // API Read phải siêu nhanh (p95 < 150ms)
    read_ops_duration: ['p(95)<150'],
    // API Write cho phép p95 < 350ms (do cập nhật document MongoDB)
    write_ops_duration: ['p(95)<350'],
    // Tỉ lệ lỗi tổng thể < 1%
    http_req_failed: ['rate<0.01'],
    custom_failure_rate: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

// Nạp danh sách tokens từ file tokens.json (tự động fallback nếu chưa có)
let TEST_TOKENS = [];
try {
  TEST_TOKENS = JSON.parse(open('./tokens.json'));
} catch (e) {
  TEST_TOKENS = [
    __ENV.TOKEN || 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token...',
  ];
}

/**
 * Trích xuất Supabase userId (sub claim) từ JWT token
 */
function parseJwtSub(token) {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const decoded = encoding.b64decode(parts[1], 'rawurl', 's');
      const payload = JSON.parse(decoded);
      return payload.sub || null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * ---------------------------------------------------------
 * SETUP (CHẠY 1 LẦN DUY NHẤT TRƯỚC KHI BẮT ĐẦU TEST)
 * Tự động khởi tạo dữ liệu mẫu: User me, Meeting, Poll, Room, Channel, Chat
 * ---------------------------------------------------------
 */
export function setup() {
  const hostToken = TEST_TOKENS[0];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${hostToken}`,
  };

  let meetingCode = __ENV.MEETING_CODE || '';
  let pollId = null;
  let optionIds = [];
  let sampleConversationId = null;
  let sampleRoomId = null;
  let sampleRoomCode = null;

  console.log(`[SETUP] 🚀 Đang khởi tạo môi trường load test với ${TEST_TOKENS.length} tokens...`);

  // BƯỚC 1: Gọi GET /users/me CHO HOST VÀ PARTNER ĐẦU TIÊN ĐỂ KHỞI TẠO USER TRONG MONGO
  try {
    const resMe = http.get(`${BASE_URL}/users/me`, { headers });
    console.log(`[SETUP] ✓ Host đồng bộ /users/me vào MongoDB: Status ${resMe.status}`);

    if (TEST_TOKENS.length > 1) {
      const partnerToken = TEST_TOKENS[1];
      const partnerHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${partnerToken}`,
      };
      const resPartnerMe = http.get(`${BASE_URL}/users/me`, { headers: partnerHeaders });
      console.log(`[SETUP] ✓ Partner đồng bộ /users/me vào MongoDB: Status ${resPartnerMe.status}`);
    }
  } catch (e) {
    console.warn('[SETUP] ⚠️ Lỗi khi đồng bộ /users/me ban đầu:', e.message);
  }

  // BƯỚC 2: Đảm bảo có meeting code hợp lệ (Personal Meeting)
  if (!meetingCode) {
    try {
      const resEnsure = http.post(`${BASE_URL}/meetings/personal/ensure`, {}, { headers });
      if (resEnsure.status === 200 || resEnsure.status === 201) {
        const body = resEnsure.json();
        meetingCode = body.meetingCode || body.data?.meetingCode;
        console.log(`[SETUP] ✓ Đã tạo/lấy personal meeting code: ${meetingCode}`);
      }
    } catch (e) {
      console.warn('[SETUP] ⚠️ Không thể tạo personal meeting, dùng fallback code');
    }
  }

  if (!meetingCode) {
    meetingCode = 'meet-loadtest-default';
  }

  // BƯỚC 3: Host tham gia trước để bắt đầu session ongoing trong MongoDB
  try {
    const joinRes = http.post(
      `${BASE_URL}/meetings/join`,
      JSON.stringify({
        meetingCode,
        deviceId: 'device-host-setup',
        displayName: 'Load Test Host',
        allowStart: true,
      }),
      { headers }
    );
    console.log(`[SETUP] ✓ Host join meeting: Status ${joinRes.status}`);
  } catch (e) {
    console.warn('[SETUP] ⚠️ Lỗi khi host join meeting:', e.message);
  }

  // BƯỚC 4: Tạo một cuộc bình chọn (Poll) mẫu để 100 VUs có thể vote thật
  try {
    const pollRes = http.post(
      `${BASE_URL}/meetings/${meetingCode}/polls`,
      JSON.stringify({
        question: 'Bạn đánh giá thế nào về chất lượng cuộc họp hôm nay?',
        options: ['Rất tốt', 'Bình thường', 'Cần cải thiện'],
        allowMultiple: false,
      }),
      { headers }
    );

    if (pollRes.status === 201 || pollRes.status === 200) {
      const pollData = pollRes.json();
      const actualPoll = pollData.data || pollData;
      pollId = actualPoll._id || actualPoll.id;
      if (Array.isArray(actualPoll.options)) {
        optionIds = actualPoll.options.map((opt) => opt._id || opt.id);
      }
      console.log(`[SETUP] ✓ Đã tạo thành công Poll mẫu ID: ${pollId} (${optionIds.length} lựa chọn)`);
    }
  } catch (e) {
    console.warn('[SETUP] ⚠️ Không tạo được poll mẫu:', e.message);
  }

  // BƯỚC 5: Tạo một Phòng họp mẫu (Room) & 1 Kênh mẫu (Channel)
  try {
    const roomRes = http.post(
      `${BASE_URL}/rooms`,
      JSON.stringify({ name: 'Phòng Kiểm Thử Hiệu Năng ToboMeet' }),
      { headers }
    );
    if (roomRes.status === 200 || roomRes.status === 201) {
      const roomData = roomRes.json();
      const r = roomData.data || roomData;
      sampleRoomId = r._id || r.id;
      sampleRoomCode = r.code;
      console.log(`[SETUP] ✓ Đã tạo phòng mẫu ID: ${sampleRoomId} - Mã phòng: ${sampleRoomCode}`);

      // Tạo thêm 1 kênh mẫu trong phòng (Giới hạn tối đa 50 kênh/phòng)
      if (sampleRoomId) {
        http.post(
          `${BASE_URL}/rooms/${sampleRoomId}/channels`,
          JSON.stringify({ name: 'kênh-chung' }),
          { headers }
        );
        console.log(`[SETUP] ✓ Đã tạo kênh mẫu 'kênh-chung' trong phòng`);
      }
    }
  } catch (e) {
    console.warn('[SETUP] ⚠️ Lỗi khi khởi tạo phòng mẫu:', e.message);
  }

  // BƯỚC 6: Tạo cuộc hội thoại Direct Chat có sẵn tin nhắn
  try {
    if (TEST_TOKENS.length > 1) {
      const partnerToken = TEST_TOKENS[1];
      const partnerHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${partnerToken}`,
      };
      const partnerSub = parseJwtSub(partnerToken);
      if (partnerSub) {
        const convRes = http.post(
          `${BASE_URL}/direct-chat/conversations`,
          JSON.stringify({ recipientId: partnerSub }),
          { headers }
        );

        if (convRes.status === 200 || convRes.status === 201) {
          const convData = convRes.json();
          const conv = convData.data || convData;
          sampleConversationId = conv._id || conv.id;
          console.log(`[SETUP] ✓ Đã tạo cuộc trò chuyện mẫu ID: ${sampleConversationId}`);

          // Gửi sẵn 2 tin nhắn mẫu
          http.post(
            `${BASE_URL}/direct-chat/conversations/${sampleConversationId}/messages`,
            JSON.stringify({ content: 'Xin chào, đây là tin nhắn mẫu từ User 0!' }),
            { headers }
          );
          http.post(
            `${BASE_URL}/direct-chat/conversations/${sampleConversationId}/messages`,
            JSON.stringify({ content: 'Chào bạn, User 1 đã nhận được tin nhắn và phản hồi lại.' }),
            { headers: partnerHeaders }
          );
        }
      }
    }
  } catch (e) {
    console.warn('[SETUP] ⚠️ Lỗi khi khởi tạo hội thoại chat mẫu:', e.message);
  }

  return {
    meetingCode,
    pollId,
    optionIds,
    sampleConversationId,
    sampleRoomId,
    sampleRoomCode,
  };
}

/**
 * ---------------------------------------------------------
 * HÀM TEST CHÍNH (VIRTUAL USER EXECUTION LOOP)
 * ---------------------------------------------------------
 */
export default function (setupData) {
  // Mỗi VU sở hữu 1 token độc lập tương ứng
  const tokenIndex = (__VU - 1) % TEST_TOKENS.length;
  const token = TEST_TOKENS[tokenIndex];
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  // =========================================================================
  // ⚡ BƯỚC 1 (QUAN TRỌNG NHẤT): GỌI GET /users/me ĐẦU TIÊN CHO MỖI USER
  // Lý do: Người dùng chỉ được tạo trong MongoDB khi gọi /me.
  // Thao tác này đảm bảo User Document và Device Session tồn tại trong Mongo
  // trước khi người dùng thực hiện bất kỳ hành động nào khác (vào họp, chat, room)
  // =========================================================================
  const startMe = Date.now();
  const resMe = http.get(`${BASE_URL}/users/me`, params);
  readOpsDuration.add(Date.now() - startMe);
  opCounter.add(1);

  const meSuccess = check(resMe, {
    '1. Đồng bộ /users/me vào MongoDB (200)': (r) => r.status === 200,
  });
  if (!meSuccess) {
    failureRate.add(1);
    return;
  }
  failureRate.add(0);

  const meetingCode = setupData.meetingCode;
  const pollId = setupData.pollId;
  const optionIds = setupData.optionIds || [];

  // Xác định chế độ test:
  // - Mặc định: 80% VUs vào phòng họp, 20% VUs ở Dashboard
  // - Có thể ép 100% bằng: -e TEST_MODE=meeting hoặc -e TEST_MODE=dashboard
  const mode = __ENV.TEST_MODE || 'hybrid';
  const isMeetingUser = mode === 'meeting' || (mode === 'hybrid' && (__VU % 5 !== 0));

  if (isMeetingUser) {
    runInMeetingScenario(params, meetingCode, pollId, optionIds);
  } else {
    runDashboardScenario(params, setupData);
  }

  // Nghỉ giữa các lượt (Think Time: 0.8s - 2.0s) để mô phỏng hành vi tự nhiên
  sleep(Math.random() * 1.2 + 0.8);
}

/**
 * =========================================================================
 * KỊCH BẢN 1: IN-MEETING FLOW (75% READ - 25% WRITE)
 * =========================================================================
 */
function runInMeetingScenario(params, meetingCode, pollId, optionIds) {
  // 1. BƯỚC THAM GIA PHÒNG HỌP (Join Meeting - Cốt lõi)
  const joinPayload = JSON.stringify({
    meetingCode,
    deviceId: `device-vu-${__VU}-${__ITER}`,
    displayName: `User VU ${__VU}`,
    allowStart: true,
  });

  const startJoin = Date.now();
  const resJoin = http.post(`${BASE_URL}/meetings/join`, joinPayload, params);
  joinDuration.add(Date.now() - startJoin);
  opCounter.add(1);

  const joinSuccess = check(resJoin, {
    'Join meeting thành công (200/201)': (r) => r.status === 200 || r.status === 201,
  });
  if (!joinSuccess) {
    failureRate.add(1);
    return;
  }
  failureRate.add(0);

  sleep(0.3);

  // 2. CHU KỲ HOẠT ĐỘNG TRONG PHÒNG THEO TỈ LỆ 75% ĐỌC - 25% GHI
  const rand = Math.random();

  if (rand < 0.75) {
    // ---------------------------------------------------------
    // NHÁNH ĐỌC (READ - 75% TỈ LỆ)
    // ---------------------------------------------------------
    if (rand < 0.25) {
      // 2.1. Đọc quyền và trạng thái thành viên (Member status)
      const start = Date.now();
      const res = http.get(`${BASE_URL}/meetings/${meetingCode}/member-status`, params);
      readOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Read member status (200)': (r) => r.status === 200 });
    } else if (rand < 0.45) {
      // 2.2. Đọc danh sách bình chọn (Polls - ĐÃ CÓ DỮ LIỆU TỪ SETUP)
      const start = Date.now();
      const res = http.get(`${BASE_URL}/meetings/${meetingCode}/polls`, params);
      readOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Read polls list (200)': (r) => r.status === 200 });
    } else if (rand < 0.60) {
      // 2.3. Đọc quyền và thiết lập bảng trắng (Whiteboard Access & Settings)
      const start = Date.now();
      const resAccess = http.get(`${BASE_URL}/meetings/${meetingCode}/whiteboard-access`, params);
      const resSettings = http.get(`${BASE_URL}/meetings/${meetingCode}/whiteboard-settings`, params);
      readOpsDuration.add(Date.now() - start);
      opCounter.add(2);
      check(resAccess, { 'Read whiteboard access (200)': (r) => r.status === 200 });
      check(resSettings, { 'Read whiteboard settings (200/403)': (r) => r.status === 200 || r.status === 403 });
    } else {
      // 2.4. Đọc danh sách điểm danh cuộc họp (Attendance)
      const start = Date.now();
      const res = http.get(`${BASE_URL}/meetings/${meetingCode}/attendance`, params);
      readOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Read attendance list (200)': (r) => r.status === 200 });
    }
  } else {
    // ---------------------------------------------------------
    // NHÁNH GHI (WRITE - 25% TỈ LỆ)
    // ---------------------------------------------------------
    if (rand < 0.85) {
      // 2.5. Lấy JWT Whiteboard Token (Sinh token ký RS256)
      const start = Date.now();
      const res = http.post(`${BASE_URL}/meetings/${meetingCode}/whiteboard-token`, {}, params);
      writeOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Generate whiteboard token (200/201)': (r) => r.status === 200 || r.status === 201 });
    } else if (rand < 0.92 && pollId && optionIds.length > 0) {
      // 2.6. Bỏ phiếu bình chọn (Vote Poll - GHI THẬT VÀO POLL ID TỪ SETUP)
      const pickedOption = optionIds[Math.floor(Math.random() * optionIds.length)];
      const start = Date.now();
      const res = http.post(
        `${BASE_URL}/meetings/${meetingCode}/polls/${pollId}/vote`,
        JSON.stringify({ optionIds: [pickedOption] }),
        params
      );
      writeOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Vote poll thành công (200)': (r) => r.status === 200 });
    } else if (rand < 0.97) {
      // 2.7. Vòng đời chia sẻ màn hình (Start lock -> Sleep -> Stop release lock)
      const start = Date.now();
      const resStart = http.post(`${BASE_URL}/meetings/${meetingCode}/screen-share/start`, {}, params);
      opCounter.add(1);

      sleep(0.4);

      const resStop = http.post(`${BASE_URL}/meetings/${meetingCode}/screen-share/stop`, {}, params);
      writeOpsDuration.add(Date.now() - start);
      opCounter.add(1);

      check(resStart, { 'Screen share start (200/204)': (r) => r.status === 200 || r.status === 204 });
      check(resStop, { 'Screen share stop (200/204)': (r) => r.status === 200 || r.status === 204 });
    } else {
      // 2.8. Đổi tên hiển thị trong phòng (Rename Participant - Ghi DB Session)
      const start = Date.now();
      const res = http.patch(
        `${BASE_URL}/meetings/${meetingCode}/participants/rename`,
        JSON.stringify({ name: `User VU ${__VU} (Active)` }),
        params
      );
      writeOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Rename participant (200/204)': (r) => r.status === 200 || r.status === 204 });
    }
  }
}

/**
 * =========================================================================
 * KỊCH BẢN 2: DASHBOARD, ROOMS & CHAT FLOW (20% VUs)
 * =========================================================================
 */
function runDashboardScenario(params, setupData) {
  const start = Date.now();

  // 1. Tải danh sách phiên đăng nhập (Đánh giá In-memory Session Cache)
  const resSessions = http.get(`${BASE_URL}/users/me/sessions`, params);
  opCounter.add(1);
  check(resSessions, { 'Get /users/me/sessions (200)': (r) => r.status === 200 });

  sleep(0.3);

  // 2. Lấy danh sách phòng học / nhóm làm việc (GET /api/rooms/my)
  const resRooms = http.get(`${BASE_URL}/rooms/my`, params);
  opCounter.add(1);
  check(resRooms, { 'Get /rooms/my (200)': (r) => r.status === 200 });

  // 3. THAO TÁC GHI: TẠO PHÒNG HỌP MỚI (POST /api/rooms)
  // Ràng buộc hệ thống: Mỗi người dùng chỉ được tạo/tham gia TỐI ĐA 100 PHÒNG.
  // -> Chỉ kích hoạt tạo phòng ở vòng lặp đầu tiên (__ITER === 0) với xác suất 20%
  // -> Đảm bảo mỗi VU chỉ tạo tối đa 1 phòng trong cả bài test, không vượt ngưỡng 100 phòng!
  if (__ITER === 0 && Math.random() < 0.2) {
    const startCreateRoom = Date.now();
    const resCreateRoom = http.post(
      `${BASE_URL}/rooms`,
      JSON.stringify({ name: `Phòng của VU ${__VU}` }),
      params
    );
    writeOpsDuration.add(Date.now() - startCreateRoom);
    opCounter.add(1);

    // 201/200: Tạo thành công. 400: Nếu user đã đạt giới hạn 100 phòng từ các lần test trước
    check(resCreateRoom, {
      'Tạo phòng mới (201/200/400)': (r) =>
        r.status === 201 || r.status === 200 || r.status === 400,
    });
  }

  // 4. THAO TÁC GHI: THAM GIA PHÒNG MẪU (POST /api/rooms/join)
  // Ràng buộc hệ thống: TỐI ĐA 100 THÀNH VIÊN TRONG 1 PHÒNG.
  // -> Tham gia phòng bằng mã phòng sampleRoomCode từ setup()
  if (setupData?.sampleRoomCode && __ITER === 0 && Math.random() < 0.4) {
    const startJoinRoom = Date.now();
    const resJoinRoom = http.post(
      `${BASE_URL}/rooms/join`,
      JSON.stringify({ code: setupData.sampleRoomCode }),
      params
    );
    writeOpsDuration.add(Date.now() - startJoinRoom);
    opCounter.add(1);

    // 200/201: Thành viên mới tham gia thành công
    // 400: Phòng đã đạt tối đa 100 người HOẶC user đã là thành viên trong phòng
    check(resJoinRoom, {
      'Tham gia phòng theo mã (200/201/400)': (r) =>
        r.status === 200 || r.status === 201 || r.status === 400,
    });
  }

  // 5. Đọc danh sách thành viên của phòng mẫu (GET /api/rooms/:id/members)
  if (setupData?.sampleRoomId) {
    const resMembers = http.get(`${BASE_URL}/rooms/${setupData.sampleRoomId}/members`, params);
    opCounter.add(1);
    check(resMembers, { 'Get /rooms/:id/members (200/403)': (r) => r.status === 200 || r.status === 403 });
  }

  // 6. Lấy danh sách cuộc trò chuyện 1-1 (GET /api/direct-chat/conversations)
  const resChat = http.get(`${BASE_URL}/direct-chat/conversations`, params);
  opCounter.add(1);
  check(resChat, { 'Get /direct-chat/conversations (200)': (r) => r.status === 200 });

  // 7. Lấy lịch sử tin nhắn của cuộc trò chuyện mẫu (CÓ DỮ LIỆU THẬT TỪ SETUP!)
  if (setupData?.sampleConversationId) {
    const resMessages = http.get(
      `${BASE_URL}/direct-chat/conversations/${setupData.sampleConversationId}/messages`,
      params
    );
    opCounter.add(1);
    check(resMessages, {
      'Get /direct-chat/.../messages (200/403/404)': (r) =>
        r.status === 200 || r.status === 403 || r.status === 404,
    });

    // 8. Mô phỏng gửi tin nhắn chat mới (Write API chat) với tỉ lệ 20%
    if (Math.random() < 0.2) {
      const resSend = http.post(
        `${BASE_URL}/direct-chat/conversations/${setupData.sampleConversationId}/messages`,
        JSON.stringify({ content: `Tin nhắn tự động từ VU ${__VU} lúc ${Date.now()}` }),
        params
      );
      opCounter.add(1);
      check(resSend, {
        'Send chat message (200/201/403)': (r) =>
          r.status === 200 || r.status === 201 || r.status === 403,
      });
    }
  }

  // 9. Đảm bảo phòng họp cá nhân (Ensure personal meeting - Write operation)
  if (Math.random() < 0.2) {
    const resPersonal = http.post(`${BASE_URL}/meetings/personal/ensure`, {}, params);
    opCounter.add(1);
    check(resPersonal, { 'Ensure personal meeting (200/201)': (r) => r.status === 200 || r.status === 201 });
  }

  dashboardDuration.add(Date.now() - start);
}

/**
 * ---------------------------------------------------------
 * TEARDOWN (CHẠY 1 LẦN KHI KẾT THÚC BÀI TEST)
 * ---------------------------------------------------------
 */
export function teardown(data) {
  console.log('\n======================================================');
  console.log(`[TEARDOWN] Hoàn tất bài load test cho phòng: ${data.meetingCode}`);
  console.log('Tất cả các metrics độ trễ đã được thu thập đầy đủ.');
  console.log('======================================================\n');
}
