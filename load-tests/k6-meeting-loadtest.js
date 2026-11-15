import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';

/**
 * =========================================================================
 * KỊCH BẢN LOAD TEST TOÀN DIỆN CHO HỆ THỐNG TOBOMEET (HYBRID MIXED WORKLOAD)
 * =========================================================================
 * 
 * Các nâng cấp quan trọng:
 * 1. Chuyển sang CHANNEL MEETING thay vì Personal Meeting (quyền xem điểm danh cho toàn bộ thành viên).
 * 2. Khắc phục Race Condition của Vote Poll (Server xử lý nguyên tử atomic update).
 * 3. Mô phỏng NHẮN TIN LIÊN TỤC: Mỗi người dùng duy trì luồng hội thoại 1-1 riêng biệt, liên tục
 *    gửi và đọc tin nhắn chat xuyên suốt bài test.
 * 4. BẮT BUỘC: GET /api/users/me phải là API ĐẦU TIÊN của mỗi người dùng (tạo/đồng bộ vào MongoDB).
 * 5. Tuân thủ chuẩn Response bọc trong body.result của NestJS TransformInterceptor.
 */

// ---------------------------------------------------------
// CUSTOM METRICS ĐO ĐỘ TRỄ CHI TIẾT THEO TỪNG NHÓM
// ---------------------------------------------------------
const joinDuration = new Trend('join_duration', true);
const readOpsDuration = new Trend('read_ops_duration', true);
const writeOpsDuration = new Trend('write_ops_duration', true);
const dashboardDuration = new Trend('dashboard_ops_duration', true);
const chatSendDuration = new Trend('chat_send_duration', true);
const failureRate = new Rate('custom_failure_rate');
const opCounter = new Counter('total_operations_count');

// ---------------------------------------------------------
// OPTIONS & THRESHOLDS (MỤC TIÊU HIỆU NĂNG CHO VPS 1 CORE)
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
    // Ngưỡng đo lường thực tế cho 100 users trên VPS 1 core
    http_req_duration: ['p(95)<3500', 'p(99)<6000'],
    read_ops_duration: ['p(95)<2500'],
    write_ops_duration: ['p(95)<3500'],
    // Tỉ lệ lỗi tổng thể < 2% (nhờ loại bỏ race condition và chuyển sang channel meeting)
    http_req_failed: ['rate<0.02'],
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
 * Helper trích xuất data payload từ NestJS TransformInterceptor
 * Server bọc dữ liệu trong { code: 200, message: "Success", result: { ... } }
 */
function extractData(res) {
  try {
    const json = res.json();
    if (json && typeof json === 'object') {
      if (json.result !== undefined && json.result !== null) {
        return json.result;
      }
      if (json.data !== undefined && json.data !== null) {
        return json.data;
      }
    }
    return json;
  } catch (e) {
    return null;
  }
}

/**
 * ---------------------------------------------------------
 * SETUP (CHẠY 1 LẦN DUY NHẤT TRƯỚC KHI BẮT ĐẦU TEST)
 * Khởi tạo: User me, Phòng (Room), Kênh (Channel), Channel Meeting, và Poll
 * ---------------------------------------------------------
 */
export function setup() {
  const hostToken = TEST_TOKENS[0];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${hostToken}`,
  };

  const hostSub = parseJwtSub(hostToken);
  let partnerSub = null;
  if (TEST_TOKENS.length > 1) {
    partnerSub = parseJwtSub(TEST_TOKENS[1]);
  }

  let meetingCode = __ENV.MEETING_CODE || '';
  let pollId = null;
  let optionIds = [];
  let sampleRoomId = null;
  let sampleRoomCode = null;
  let channelId = null;

  console.log(`[SETUP] 🚀 Đang khởi tạo môi trường load test với ${TEST_TOKENS.length} tokens...`);

  // BƯỚC 1: Gọi GET /users/me cho Host và Partner để khởi tạo User trong MongoDB
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

  // BƯỚC 2: TẠO PHÒNG MẪU (ROOM) & KÊNH MẪU (CHANNEL)
  try {
    const roomRes = http.post(
      `${BASE_URL}/rooms`,
      JSON.stringify({ name: 'Phòng Họp Kênh ToboMeet LoadTest' }),
      { headers }
    );
    if (roomRes.status === 200 || roomRes.status === 201) {
      const actualRoom = extractData(roomRes);
      sampleRoomId = actualRoom?._id || actualRoom?.id;
      sampleRoomCode = actualRoom?.code;
      console.log(`[SETUP] ✓ Đã tạo phòng mẫu ID: ${sampleRoomId} - Mã phòng: ${sampleRoomCode}`);

      // Lấy kênh mặc định 'General' có sẵn trong Room
      channelId = actualRoom?.channels?.[0]?.id || actualRoom?.channels?.[0]?._id;

      // Nếu chưa có kênh, tạo mới 1 kênh
      if (!channelId && sampleRoomId) {
        const chanRes = http.post(
          `${BASE_URL}/rooms/${sampleRoomId}/channels`,
          JSON.stringify({ name: 'kênh-cuộc-họp' }),
          { headers }
        );
        const chanData = extractData(chanRes);
        const channels = chanData?.channels || [];
        channelId = channels[channels.length - 1]?.id || channels[channels.length - 1]?._id;
      }
      console.log(`[SETUP] ✓ Kênh hoạt động: ${channelId}`);
    }
  } catch (e) {
    console.warn('[SETUP] ⚠️ Lỗi khi khởi tạo phòng mẫu:', e.message);
  }

  // BƯỚC 3: TẠO CHANNEL MEETING (Thay thế hoàn toàn cho Personal Meeting!)
  if (!meetingCode && sampleRoomId && channelId) {
    try {
      const chanMeetingRes = http.post(
        `${BASE_URL}/rooms/${sampleRoomId}/channels/${channelId}/meetings/ensure`,
        {},
        { headers }
      );
      if (chanMeetingRes.status === 200 || chanMeetingRes.status === 201) {
        const mData = extractData(chanMeetingRes);
        meetingCode = mData?.meetingCode || chanMeetingRes.json('result.meetingCode');
        console.log(`[SETUP] ✓ Đã tạo CHANNEL MEETING thành công: ${meetingCode}`);
      }
    } catch (e) {
      console.warn('[SETUP] ⚠️ Lỗi khi tạo channel meeting:', e.message);
    }
  }

  // Fallback an toàn nếu không tạo được channel meeting
  if (!meetingCode) {
    try {
      const resEnsure = http.post(`${BASE_URL}/meetings/personal/ensure`, {}, { headers });
      const bodyData = extractData(resEnsure);
      meetingCode = bodyData?.meetingCode || 'meet-loadtest-default';
    } catch (e) {
      meetingCode = 'meet-loadtest-default';
    }
  }

  // BƯỚC 4: Host tham gia Channel Meeting trước để bắt đầu session ongoing
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
    console.log(`[SETUP] ✓ Host join Channel Meeting: Status ${joinRes.status}`);
  } catch (e) {
    console.warn('[SETUP] ⚠️ Lỗi khi host join meeting:', e.message);
  }

  // BƯỚC 5: Tạo một cuộc bình chọn (Poll) mẫu trong Channel Meeting
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
      const actualPoll = extractData(pollRes);
      pollId = actualPoll?._id || actualPoll?.id;
      if (Array.isArray(actualPoll?.options)) {
        optionIds = actualPoll.options.map((opt) => opt.id || opt._id);
      }
      console.log(`[SETUP] ✓ Đã tạo thành công Poll mẫu ID: ${pollId} (${optionIds.length} lựa chọn)`);
    }
  } catch (e) {
    console.warn('[SETUP] ⚠️ Không tạo được poll mẫu:', e.message);
  }

  return {
    meetingCode,
    pollId,
    optionIds,
    sampleRoomId,
    sampleRoomCode,
    hostSub,
    partnerSub,
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
  // BƯỚC 1 (QUAN TRỌNG NHẤT): GỌI GET /users/me ĐẦU TIÊN CHO MỖI USER
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

  // =========================================================================
  // BƯỚC 2: KHỞI TẠO HỘI THOẠI 1-1 CHO TỪNG VU (Để nhắn tin liên tục không bị 403)
  // VU 1 chat với VU 2; tất cả VU còn lại chat với Host (VU 1).
  // Đảm bảo mỗi VU đều là participant hợp lệ trong conversation của mình!
  // =========================================================================
  const targetRecipientSub = (__VU === 1) ? setupData.partnerSub : setupData.hostSub;
  let myConversationId = null;

  if (targetRecipientSub) {
    const convRes = http.post(
      `${BASE_URL}/direct-chat/conversations`,
      JSON.stringify({ recipientId: targetRecipientSub }),
      params
    );
    if (convRes.status === 200 || convRes.status === 201) {
      const convData = extractData(convRes);
      myConversationId = convData?.id || convData?._id;
    }
  }

  const meetingCode = setupData.meetingCode;
  const pollId = setupData.pollId;
  const optionIds = setupData.optionIds || [];

  // Xác định chế độ test:
  // - Mặc định: 80% VUs vào phòng họp, 20% VUs ở Dashboard
  const mode = __ENV.TEST_MODE || 'hybrid';
  const isMeetingUser = mode === 'meeting' || (mode === 'hybrid' && (__VU % 5 !== 0));

  if (isMeetingUser) {
    runInMeetingScenario(params, meetingCode, pollId, optionIds, myConversationId);
  } else {
    runDashboardScenario(params, setupData, myConversationId);
  }

  // Nghỉ giữa các lượt (Think Time: 0.8s - 2.0s) để mô phỏng hành vi tự nhiên
  sleep(Math.random() * 1.2 + 0.8);
}

/**
 * =========================================================================
 * KỊCH BẢN 1: IN-MEETING FLOW (CHANNEL MEETING + REALTIME CHAT)
 * =========================================================================
 */
function runInMeetingScenario(params, meetingCode, pollId, optionIds, myConversationId) {
  // 1. THAM GIA PHÒNG HỌP (Join Meeting)
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

  // 2. CHU KỲ HOẠT ĐỘNG TRONG PHÒNG (75% ĐỌC - 25% GHI)
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
      // 2.2. Đọc danh sách bình chọn (Polls)
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
      // 2.4. Đọc danh sách điểm danh Channel Meeting (Giờ đây 100% trả về 200 cho toàn bộ thành viên!)
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
    if (rand < 0.83) {
      // 2.5. Lấy JWT Whiteboard Token
      const start = Date.now();
      const res = http.post(`${BASE_URL}/meetings/${meetingCode}/whiteboard-token`, {}, params);
      writeOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Generate whiteboard token (200/201)': (r) => r.status === 200 || r.status === 201 });
    } else if (rand < 0.90 && pollId && optionIds.length > 0) {
      // 2.6. Bỏ phiếu bình chọn (Vote Poll - Atomic Update không còn race condition!)
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
    } else if (rand < 0.95) {
      // 2.7. Vòng đời chia sẻ màn hình
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
      // 2.8. Đổi tên hiển thị trong phòng
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

  // ---------------------------------------------------------
  // 3. MÔ PHỎNG NHẮN TIN TRONG PHÒNG HỌP (35% XÁC SUẤT MỖI VÒNG LẶP)
  // Người tham gia liên tục gửi tin nhắn trao đổi vào hội thoại
  // ---------------------------------------------------------
  if (myConversationId && Math.random() < 0.35) {
    const startMsg = Date.now();
    const resSend = http.post(
      `${BASE_URL}/direct-chat/conversations/${myConversationId}/messages`,
      JSON.stringify({
        content: `[Meeting Chat] VU ${__VU} phát biểu ý kiến (vòng ${__ITER}) lúc ${Date.now()}`,
      }),
      params
    );
    chatSendDuration.add(Date.now() - startMsg);
    opCounter.add(1);
    check(resSend, { 'In-meeting send message (200/201)': (r) => r.status === 200 || r.status === 201 });
  }
}

/**
 * =========================================================================
 * KỊCH BẢN 2: DASHBOARD, ROOMS & NHẮN TIN LIÊN TỤC (20% VUs)
 * =========================================================================
 */
function runDashboardScenario(params, setupData, myConversationId) {
  const start = Date.now();

  // 1. Lấy danh sách phòng học / nhóm làm việc (GET /api/rooms/my)
  const resRooms = http.get(`${BASE_URL}/rooms/my`, params);
  opCounter.add(1);
  check(resRooms, { 'Get /rooms/my (200)': (r) => r.status === 200 });

  sleep(0.2);

  // 2. THAO TÁC GHI: TẠO PHÒNG HỌP MỚI (POST /api/rooms)
  if (__ITER === 0 && Math.random() < 0.2) {
    const startCreateRoom = Date.now();
    const resCreateRoom = http.post(
      `${BASE_URL}/rooms`,
      JSON.stringify({ name: `Phòng của VU ${__VU}` }),
      params
    );
    writeOpsDuration.add(Date.now() - startCreateRoom);
    opCounter.add(1);

    check(resCreateRoom, {
      'Tạo phòng mới (201/200/400)': (r) =>
        r.status === 201 || r.status === 200 || r.status === 400,
    });
  }

  // 3. THAO TÁC GHI: THAM GIA PHÒNG MẪU (POST /api/rooms/join)
  if (setupData?.sampleRoomCode && __ITER === 0 && Math.random() < 0.5) {
    const startJoinRoom = Date.now();
    const resJoinRoom = http.post(
      `${BASE_URL}/rooms/join`,
      JSON.stringify({ code: setupData.sampleRoomCode }),
      params
    );
    writeOpsDuration.add(Date.now() - startJoinRoom);
    opCounter.add(1);

    check(resJoinRoom, {
      'Tham gia phòng theo mã (200/201/400)': (r) =>
        r.status === 200 || r.status === 201 || r.status === 400,
    });
  }

  // 4. Đọc danh sách thành viên của phòng mẫu (GET /api/rooms/:id/members)
  if (setupData?.sampleRoomId) {
    const resMembers = http.get(`${BASE_URL}/rooms/${setupData.sampleRoomId}/members`, params);
    opCounter.add(1);
    check(resMembers, { 'Get /rooms/:id/members (200/403)': (r) => r.status === 200 || r.status === 403 });
  }

  // 5. Lấy danh sách cuộc trò chuyện (GET /api/direct-chat/conversations)
  const resChat = http.get(`${BASE_URL}/direct-chat/conversations`, params);
  opCounter.add(1);
  check(resChat, { 'Get /direct-chat/conversations (200)': (r) => r.status === 200 });

  // ---------------------------------------------------------
  // 6. NHẮN TIN VÀ ĐỌC TIN NHẮN LIÊN TỤC (CONTINUOUS ACTIVE MESSAGING)
  // Toàn bộ các vòng lặp Dashboard đều gửi tin nhắn mới và tải tin nhắn về!
  // ---------------------------------------------------------
  if (myConversationId) {
    // 6.1. GỬI TIN NHẮN MỚI LIÊN TỤC (Write operation)
    const startMsg = Date.now();
    const resSend = http.post(
      `${BASE_URL}/direct-chat/conversations/${myConversationId}/messages`,
      JSON.stringify({
        content: `Tin nhắn liên tục từ VU ${__VU} [vòng ${__ITER}] lúc ${Date.now()}`,
      }),
      params
    );
    chatSendDuration.add(Date.now() - startMsg);
    writeOpsDuration.add(Date.now() - startMsg);
    opCounter.add(1);
    check(resSend, { 'Send chat message (200/201)': (r) => r.status === 200 || r.status === 201 });

    // 6.2. ĐỌC LỊCH SỬ TIN NHẮN LIÊN TỤC (Read operation)
    const startRead = Date.now();
    const resMessages = http.get(
      `${BASE_URL}/direct-chat/conversations/${myConversationId}/messages`,
      params
    );
    readOpsDuration.add(Date.now() - startRead);
    opCounter.add(1);
    check(resMessages, { 'Get chat messages (200)': (r) => r.status === 200 });
  }

  // 7. Đảm bảo phòng họp cá nhân (Write operation ngẫu nhiên)
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
  console.log(`[TEARDOWN] Hoàn tất bài load test Channel Meeting: ${data.meetingCode}`);
  console.log('Tất cả các metrics độ trễ và tải tin nhắn đã được thu thập đầy đủ.');
  console.log('======================================================\n');
}
