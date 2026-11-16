import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

/**
 * ToboMeet Hybrid Mixed Workload Load Test (Multi-VU)
 *
 * Core Workloads:
 * 1. User Sync: GET /users/me executed first by all users to ensure MongoDB synchronization.
 * 2. Channel Meeting: Complete meeting lifecycle with attendance, whiteboard, and media signaling.
 * 3. Multi-Poll Creation & Concurrent Voting: Dynamic poll creation and atomic vote updates.
 * 4. Calendar Scheduling & Invites: Users create meetings and invite participants (triggering async notifications).
 * 5. Notification Polling: Users periodically read the first page of notifications.
 * 6. Continuous Real-time Messaging: Persistent 1-1 direct chat and in-meeting messaging.
 * 7. HTML Visual Report: Automatic generation of report.html with detailed graphs and metric distributions.
 */

// ---------------------------------------------------------
// CUSTOM METRICS
// ---------------------------------------------------------
const joinDuration = new Trend('join_duration', true);
const readOpsDuration = new Trend('read_ops_duration', true);
const writeOpsDuration = new Trend('write_ops_duration', true);
const dashboardDuration = new Trend('dashboard_ops_duration', true);
const chatSendDuration = new Trend('chat_send_duration', true);
const calendarOpsDuration = new Trend('calendar_ops_duration', true);
const searchOpsDuration = new Trend('search_ops_duration', true);
const notificationDuration = new Trend('notification_ops_duration', true);
const pollOpsDuration = new Trend('poll_ops_duration', true);
const failureRate = new Rate('custom_failure_rate');
const opCounter = new Counter('total_operations_count');

// ---------------------------------------------------------
// LOAD TEST STAGES & THRESHOLDS
// ---------------------------------------------------------
export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Stage 1: Warmup to 100 VUs
    { duration: '45s', target: 250 },  // Stage 2: Ramp-up to 250 VUs
    { duration: '1m', target: 500 },   // Stage 3: Ramp-up to peak 500 VUs
    { duration: '1m30s', target: 500 }, // Stage 4: Duy trì ổn định ở đỉnh 500 VUs
    { duration: '45s', target: 0 },    // Stage 5: Hạ tải mượt mà về 0 VUs
  ],
  thresholds: {
    // Ngưỡng chịu tải thực tế cho 500 concurrent VUs
    http_req_duration: ['p(95)<12000', 'p(99)<18000'],
    read_ops_duration: ['p(95)<8000'],
    write_ops_duration: ['p(95)<15000'],
    http_req_failed: ['rate<0.05'],
    custom_failure_rate: ['rate<0.02'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

// Load tokens from tokens.json with fallback
let TEST_TOKENS = [];
try {
  TEST_TOKENS = JSON.parse(open('./tokens.json'));
} catch (e) {
  TEST_TOKENS = [
    __ENV.TOKEN || 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token...',
  ];
}

/**
 * Extract claims (sub, email) from JWT
 */
function parseJwtInfo(token) {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const decoded = encoding.b64decode(parts[1], 'rawurl', 's');
      const payload = JSON.parse(decoded);
      return {
        userId: payload.sub || null,
        email: payload.email || null,
      };
    }
  } catch (e) {
    return { userId: null, email: null };
  }
  return { userId: null, email: null };
}

/**
 * Helper to unwrap NestJS TransformInterceptor response: { code, message, result }
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
 * SETUP FUNCTION (Executed once before virtual users start)
 * ---------------------------------------------------------
 */
export function setup() {
  const hostToken = TEST_TOKENS[0];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${hostToken}`,
  };

  const hostInfo = parseJwtInfo(hostToken);
  let partnerInfo = { userId: null, email: null };
  if (TEST_TOKENS.length > 1) {
    partnerInfo = parseJwtInfo(TEST_TOKENS[1]);
  }

  // Build directory of all users for mutual invitations and chat pairings
  const userDirectory = TEST_TOKENS.map((token, idx) => {
    const info = parseJwtInfo(token);
    return {
      index: idx,
      userId: info.userId,
      email: info.email || `loadtest_user_${idx + 1}@tobomeet.test`,
      displayName: `Test User ${idx + 1}`,
    };
  });

  let meetingCode = __ENV.MEETING_CODE || '';
  let sampleRoomId = null;
  let sampleRoomCode = null;
  let channelId = null;
  let sampleConversationId = null;

  console.log(`[SETUP] Initializing load test environment with ${TEST_TOKENS.length} tokens...`);

  // STEP 1: Sync Host and Partner to MongoDB via /users/me
  try {
    const resMe = http.get(`${BASE_URL}/users/me`, { headers });
    console.log(`[SETUP] Host synced /users/me to MongoDB: Status ${resMe.status}`);

    if (TEST_TOKENS.length > 1) {
      const partnerToken = TEST_TOKENS[1];
      const partnerHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${partnerToken}`,
      };
      const resPartnerMe = http.get(`${BASE_URL}/users/me`, { headers: partnerHeaders });
      console.log(`[SETUP] Partner synced /users/me to MongoDB: Status ${resPartnerMe.status}`);
    }
  } catch (e) {
    console.warn('[SETUP] Error during initial /users/me synchronization:', e.message);
  }

  // STEP 2: Create sample room and channel
  try {
    const roomRes = http.post(
      `${BASE_URL}/rooms`,
      JSON.stringify({ name: 'ToboMeet Hybrid Load Test Room' }),
      { headers }
    );
    if (roomRes.status === 200 || roomRes.status === 201) {
      const actualRoom = extractData(roomRes);
      sampleRoomId = actualRoom?._id || actualRoom?.id;
      sampleRoomCode = actualRoom?.code;
      console.log(`[SETUP] Created sample room ID: ${sampleRoomId} - Room code: ${sampleRoomCode}`);

      channelId = actualRoom?.channels?.[0]?.id || actualRoom?.channels?.[0]?._id;

      if (!channelId && sampleRoomId) {
        const chanRes = http.post(
          `${BASE_URL}/rooms/${sampleRoomId}/channels`,
          JSON.stringify({ name: 'general-channel' }),
          { headers }
        );
        const chanData = extractData(chanRes);
        const channels = chanData?.channels || [];
        channelId = channels[channels.length - 1]?.id || channels[channels.length - 1]?._id;
      }
      console.log(`[SETUP] Active channel ID: ${channelId}`);
    }
  } catch (e) {
    console.warn('[SETUP] Error initializing sample room:', e.message);
  }

  // STEP 3: Create Channel Meeting
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
        console.log(`[SETUP] Created channel meeting: ${meetingCode}`);
      }
    } catch (e) {
      console.warn('[SETUP] Error creating channel meeting:', e.message);
    }
  }

  // Fallback meeting code
  if (!meetingCode) {
    meetingCode = 'meet-loadtest-default';
  }

  // STEP 4: Host joins meeting to initialize ongoing session
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
    console.log(`[SETUP] Host joined channel meeting: Status ${joinRes.status}`);
  } catch (e) {
    console.warn('[SETUP] Error host joining meeting:', e.message);
  }

  // STEP 5: Create multiple initial sample polls
  const initialPolls = [
    {
      question: 'Which deployment strategy is best for ToboMeet?',
      options: ['Blue-Green Deployment', 'Canary Releases', 'Rolling Updates'],
    },
    {
      question: 'Which database query optimization gave the highest impact?',
      options: ['Compound Indexes', 'Atomic Updates', 'Redis Caching'],
    },
    {
      question: 'How do you rate the meeting audio-video quality?',
      options: ['Excellent', 'Good', 'Average'],
    },
  ];

  for (const pollItem of initialPolls) {
    try {
      const pollRes = http.post(
        `${BASE_URL}/meetings/${meetingCode}/polls`,
        JSON.stringify({
          question: pollItem.question,
          options: pollItem.options,
          allowMultiple: false,
        }),
        { headers }
      );
      if (pollRes.status === 200 || pollRes.status === 201) {
        console.log(`[SETUP] Created initial sample poll: "${pollItem.question}"`);
      }
    } catch (e) {
      console.warn('[SETUP] Error creating initial poll:', e.message);
    }
  }

  // STEP 6: Create initial 1-1 conversation between Host and Partner
  if (hostInfo.userId && partnerInfo.userId) {
    try {
      const convRes = http.post(
        `${BASE_URL}/direct-chat/conversations`,
        JSON.stringify({ recipientId: partnerInfo.userId }),
        { headers }
      );
      if (convRes.status === 200 || convRes.status === 201) {
        const cData = extractData(convRes);
        sampleConversationId = cData?.id || cData?._id;
        console.log(`[SETUP] Created sample direct conversation ID: ${sampleConversationId}`);
      }
    } catch (e) {
      console.warn('[SETUP] Error creating initial conversation:', e.message);
    }
  }

  return {
    meetingCode,
    sampleRoomId,
    sampleRoomCode,
    hostSub: hostInfo.userId,
    partnerSub: partnerInfo.userId,
    userDirectory,
    sampleConversationId,
  };
}

/**
 * ---------------------------------------------------------
 * MAIN VIRTUAL USER EXECUTION LOOP
 * ---------------------------------------------------------
 */
export default function (setupData) {
  const tokenIndex = (__VU - 1) % TEST_TOKENS.length;
  const token = TEST_TOKENS[tokenIndex];

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  // =========================================================================
  // 1. MANDATORY: SYNC /users/me FIRST FOR EACH USER
  // =========================================================================
  const startMe = Date.now();
  const resMe = http.get(`${BASE_URL}/users/me`, params);
  readOpsDuration.add(Date.now() - startMe);
  opCounter.add(1);

  const meSuccess = check(resMe, {
    '1. Sync /users/me to MongoDB (200)': (r) => r.status === 200,
  });
  if (!meSuccess) {
    failureRate.add(1);
    return;
  }
  failureRate.add(0);

  // =========================================================================
  // 2. SEARCH USERS & CALENDAR SCHEDULING (Triggers Notifications)
  // Executed on the first iteration of each Virtual User
  // =========================================================================
  if (__ITER === 0) {
    let invitee1 = null;
    let invitee2 = null;

    // 2.1. SEARCH USERS API (Find users dynamically to test search query)
    const searchQuery = (Math.random() < 0.5) ? 'User' : 'loadtest';
    const startSearch = Date.now();
    const resSearch = http.get(
      `${BASE_URL}/users/search?q=${searchQuery}&limit=10`,
      params
    );
    const searchDur = Date.now() - startSearch;
    searchOpsDuration.add(searchDur);
    readOpsDuration.add(searchDur);
    opCounter.add(1);

    check(resSearch, {
      'Search users (200)': (r) => r.status === 200,
    });

    const searchData = extractData(resSearch);
    const myUserId = parseJwtInfo(token).userId;
    const foundUsers = Array.isArray(searchData?.items)
      ? searchData.items.filter((u) => u.supabaseId && u.supabaseId !== myUserId)
      : [];

    if (foundUsers.length >= 2) {
      // Pick 2 distinct candidates from search results
      const randIdx = Math.floor(Math.random() * (foundUsers.length - 1));
      invitee1 = {
        email: foundUsers[randIdx].email,
        userId: foundUsers[randIdx].supabaseId,
        displayName: foundUsers[randIdx].displayName || `User ${foundUsers[randIdx].email}`,
      };
      invitee2 = {
        email: foundUsers[randIdx + 1].email,
        userId: foundUsers[randIdx + 1].supabaseId,
        displayName: foundUsers[randIdx + 1].displayName || `User ${foundUsers[randIdx + 1].email}`,
      };
    } else if (setupData.userDirectory && setupData.userDirectory.length > 2) {
      // Fallback gracefully to userDirectory if search returned fewer than 2 users
      const totalUsers = setupData.userDirectory.length;
      const u1 = setupData.userDirectory[(tokenIndex + 1) % totalUsers];
      const u2 = setupData.userDirectory[(tokenIndex + 2) % totalUsers];
      invitee1 = { email: u1.email, userId: u1.userId, displayName: u1.displayName };
      invitee2 = { email: u2.email, userId: u2.userId, displayName: u2.displayName };
    }

    // 2.2. CREATE CALENDAR EVENT WITH THE 2 INVITEES
    if (invitee1 && invitee2) {
      const futureStart = new Date(Date.now() + 86400000 + tokenIndex * 120000).toISOString();
      const futureEnd = new Date(Date.now() + 90000000 + tokenIndex * 120000).toISOString();

      const calendarPayload = JSON.stringify({
        title: `Project Review by VU ${__VU}`,
        description: 'Automated load test calendar invite with attendee notifications',
        roomType: 'meeting',
        startDate: futureStart,
        endDate: futureEnd,
        invitees: [invitee1, invitee2],
      });

      const startCal = Date.now();
      const resCal = http.post(`${BASE_URL}/calendar`, calendarPayload, params);
      const calDuration = Date.now() - startCal;
      calendarOpsDuration.add(calDuration);
      writeOpsDuration.add(calDuration);
      opCounter.add(1);

      check(resCal, {
        'Create calendar event with invitees (200/201)': (r) =>
          r.status === 200 || r.status === 201,
      });
    }
  }

  // =========================================================================
  // 3. READ NOTIFICATIONS (First Page Polling)
  // Every VU checks their latest notifications periodically
  // =========================================================================
  const startNotif = Date.now();
  const resNotif = http.get(`${BASE_URL}/notifications?page=1&limit=20`, params);
  const notifDuration = Date.now() - startNotif;
  notificationDuration.add(notifDuration);
  readOpsDuration.add(notifDuration);
  opCounter.add(1);

  check(resNotif, {
    'Read notifications (200)': (r) => r.status === 200,
  });

  // =========================================================================
  // 4. EACH USER CREATES A POLL IN THEIR OWN ROOM (Owner Role)
  // Executed on the first iteration of each Virtual User
  // =========================================================================
  if (__ITER === 0) {
    const resEnsure = http.post(`${BASE_URL}/meetings/personal/ensure`, {}, params);
    opCounter.add(1);
    check(resEnsure, {
      'Ensure personal meeting (200/201)': (r) => r.status === 200 || r.status === 201,
    });

    const pData = extractData(resEnsure);
    const myPersonalCode = pData?.meetingCode;

    if (myPersonalCode) {
      // Host joins own room to initialize ongoing session
      http.post(
        `${BASE_URL}/meetings/join`,
        JSON.stringify({
          meetingCode: myPersonalCode,
          deviceId: `device-owner-${__VU}`,
          displayName: `Owner VU ${__VU}`,
          allowStart: true,
        }),
        params
      );

      // Create poll as OWNER in their own room (passes @Roles('owner', 'admin') 100%)
      const personalPollPayload = JSON.stringify({
        question: `Poll in personal room of VU ${__VU}: Project Feedback`,
        options: ['Agree', 'Disagree', 'Neutral'],
        allowMultiple: false,
      });

      const startPoll = Date.now();
      const resPoll = http.post(
        `${BASE_URL}/meetings/${myPersonalCode}/polls`,
        personalPollPayload,
        params
      );
      const pollDur = Date.now() - startPoll;
      pollOpsDuration.add(pollDur);
      writeOpsDuration.add(pollDur);
      opCounter.add(1);

      check(resPoll, {
        'Create poll in own room (200/201)': (r) =>
          r.status === 200 || r.status === 201,
      });
    }
  }

  // =========================================================================
  // 5. DIRECT CHAT CONVERSATION SETUP
  // VU 1 chats with VU 2; all other VUs chat with Host (VU 1)
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

  runDashboardScenario(params, setupData, myConversationId);
  runInMeetingScenario(params, meetingCode, myConversationId);

  // Think time giữa các vòng lặp: 1.0s - 1.5s (+ thêm 1s để giảm áp lực dồn dập khi chạy 500 VUs)
  sleep(Math.random() * 0.5 + 1.0);
}

/**
 * SCENARIO 1: IN-MEETING FLOW (CHANNEL MEETING, MULTI-POLL, LIVE CHAT)
 */
function runInMeetingScenario(params, meetingCode, myConversationId) {
  // 1. Join Meeting
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
    'Join meeting (200/201)': (r) => r.status === 200 || r.status === 201,
  });
  if (!joinSuccess) {
    failureRate.add(1);
    return;
  }
  failureRate.add(0);

  // Giãn cách 1s sau khi vào phòng họp
  sleep(1.0);

  // 2. POLL CREATION IN SHARED MEETING: Only Host / Owner creates polls in shared meeting
  if (__VU === 1 && (__ITER === 0 || Math.random() < 0.25)) {
    const newPollPayload = JSON.stringify({
      question: `Host Poll (Round ${__ITER}): Topic #${Math.floor(Math.random() * 900 + 100)}`,
      options: ['Option Alpha', 'Option Beta', 'Option Gamma'],
      allowMultiple: false,
    });

    const startCreatePoll = Date.now();
    const resCreatePoll = http.post(
      `${BASE_URL}/meetings/${meetingCode}/polls`,
      newPollPayload,
      params
    );
    const createPollDur = Date.now() - startCreatePoll;
    pollOpsDuration.add(createPollDur);
    writeOpsDuration.add(createPollDur);
    opCounter.add(1);

    check(resCreatePoll, {
      'Host create in-meeting poll (200/201)': (r) =>
        r.status === 200 || r.status === 201,
    });
  }

  // 3. IN-MEETING OPERATIONS: 70% Reads - 30% Writes
  const rand = Math.random();

  if (rand < 0.70) {
    // ---------------- READ OPERATIONS ----------------
    if (rand < 0.20) {
      // 3.1. Member Status
      const start = Date.now();
      const res = http.get(`${BASE_URL}/meetings/${meetingCode}/member-status`, params);
      readOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Read member status (200)': (r) => r.status === 200 });
    } else if (rand < 0.40) {
      // 3.2. Fetch all active polls in the meeting
      const start = Date.now();
      const res = http.get(`${BASE_URL}/meetings/${meetingCode}/polls`, params);
      readOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Read polls list (200)': (r) => r.status === 200 });
    } else if (rand < 0.55) {
      // 3.3. Whiteboard Access & Settings
      const start = Date.now();
      const resAccess = http.get(`${BASE_URL}/meetings/${meetingCode}/whiteboard-access`, params);
      const resSettings = http.get(`${BASE_URL}/meetings/${meetingCode}/whiteboard-settings`, params);
      readOpsDuration.add(Date.now() - start);
      opCounter.add(2);
      check(resAccess, { 'Read whiteboard access (200)': (r) => r.status === 200 });
      check(resSettings, { 'Read whiteboard settings (200/403)': (r) => r.status === 200 || r.status === 403 });
    } else {
      // 3.4. Attendance List (Channel meeting allows all members)
      const start = Date.now();
      const res = http.get(`${BASE_URL}/meetings/${meetingCode}/attendance`, params);
      readOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Read attendance list (200)': (r) => r.status === 200 });
    }
  } else {
    // ---------------- WRITE OPERATIONS ----------------
    if (rand < 0.80) {
      // 3.5. Generate Whiteboard Token
      const start = Date.now();
      const res = http.post(`${BASE_URL}/meetings/${meetingCode}/whiteboard-token`, {}, params);
      writeOpsDuration.add(Date.now() - start);
      opCounter.add(1);
      check(res, { 'Generate whiteboard token (200/201)': (r) => r.status === 200 || r.status === 201 });
    } else if (rand < 0.90) {
      // 3.6. Vote on a randomly selected active poll from the meeting
      const resPolls = http.get(`${BASE_URL}/meetings/${meetingCode}/polls`, params);
      const allPolls = extractData(resPolls);

      if (Array.isArray(allPolls) && allPolls.length > 0) {
        const randomPoll = allPolls[Math.floor(Math.random() * allPolls.length)];
        const pollOptions = randomPoll?.options || [];
        const pollId = randomPoll?._id || randomPoll?.id;

        if (pollId && pollOptions.length > 0) {
          const chosenOpt = pollOptions[Math.floor(Math.random() * pollOptions.length)];
          const chosenOptId = chosenOpt.id || chosenOpt._id;

          const startVote = Date.now();
          const resVote = http.post(
            `${BASE_URL}/meetings/${meetingCode}/polls/${pollId}/vote`,
            JSON.stringify({ optionIds: [chosenOptId] }),
            params
          );
          const voteDur = Date.now() - startVote;
          pollOpsDuration.add(voteDur);
          writeOpsDuration.add(voteDur);
          opCounter.add(1);
          check(resVote, { 'Vote poll (200)': (r) => r.status === 200 });
        }
      }
    } else if (rand < 0.95) {
      // 3.7. Screen share start/stop lifecycle
      const start = Date.now();
      const resStart = http.post(`${BASE_URL}/meetings/${meetingCode}/screen-share/start`, {}, params);
      opCounter.add(1);

      sleep(1.0); // Giãn cách 1s giữa bật và tắt chia sẻ màn hình

      const resStop = http.post(`${BASE_URL}/meetings/${meetingCode}/screen-share/stop`, {}, params);
      writeOpsDuration.add(Date.now() - start);
      opCounter.add(1);

      check(resStart, { 'Screen share start (200/204)': (r) => r.status === 200 || r.status === 204 });
      check(resStop, { 'Screen share stop (200/204)': (r) => r.status === 200 || r.status === 204 });
    } else {
      // 3.8. Rename participant
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

  // 4. IN-MEETING CONTINUOUS MESSAGING (40% Probability per loop)
  if (myConversationId && Math.random() < 0.40) {
    const startMsg = Date.now();
    const resSend = http.post(
      `${BASE_URL}/direct-chat/conversations/${myConversationId}/messages`,
      JSON.stringify({
        content: `[Meeting Chat] VU ${__VU} comment on loop ${__ITER} at ${Date.now()}`,
      }),
      params
    );
    chatSendDuration.add(Date.now() - startMsg);
    opCounter.add(1);
    check(resSend, { 'In-meeting send message (200/201)': (r) => r.status === 200 || r.status === 201 });
  }
}

/**
 * SCENARIO 2: DASHBOARD & ACTIVE MESSAGING
 */
function runDashboardScenario(params, setupData, myConversationId) {
  const start = Date.now();

  // 1. Get user rooms list
  const resRooms = http.get(`${BASE_URL}/rooms/my`, params);
  opCounter.add(1);
  check(resRooms, { 'Get /rooms/my (200)': (r) => r.status === 200 });

  sleep(1.0); // Giãn cách 1s sau khi tải danh sách phòng

  // 2. Create room
  if (__ITER === 0 && Math.random() < 0.20) {
    const startCreateRoom = Date.now();
    const resCreateRoom = http.post(
      `${BASE_URL}/rooms`,
      JSON.stringify({ name: `Room of VU ${__VU}` }),
      params
    );
    writeOpsDuration.add(Date.now() - startCreateRoom);
    opCounter.add(1);

    check(resCreateRoom, {
      'Create new room (201/200/400)': (r) =>
        r.status === 201 || r.status === 200 || r.status === 400,
    });
  }

  // 3. Join sample room by code
  if (setupData?.sampleRoomCode && __ITER === 0 && Math.random() < 0.50) {
    const startJoinRoom = Date.now();
    const resJoinRoom = http.post(
      `${BASE_URL}/rooms/join`,
      JSON.stringify({ code: setupData.sampleRoomCode }),
      params
    );
    writeOpsDuration.add(Date.now() - startJoinRoom);
    opCounter.add(1);

    check(resJoinRoom, {
      'Join room by code (200/201/400)': (r) =>
        r.status === 200 || r.status === 201 || r.status === 400,
    });
  }

  // 4. Get members of sample room
  if (setupData?.sampleRoomId) {
    const resMembers = http.get(`${BASE_URL}/rooms/${setupData.sampleRoomId}/members`, params);
    opCounter.add(1);
    check(resMembers, { 'Get /rooms/:id/members (200/403)': (r) => r.status === 200 || r.status === 403 });
  }

  // 5. Get conversations list
  const resChat = http.get(`${BASE_URL}/direct-chat/conversations`, params);
  opCounter.add(1);
  check(resChat, { 'Get /direct-chat/conversations (200)': (r) => r.status === 200 });

  // 6. CONTINUOUS ACTIVE MESSAGING (Send & Read on every iteration)
  if (myConversationId) {
    const startMsg = Date.now();
    const resSend = http.post(
      `${BASE_URL}/direct-chat/conversations/${myConversationId}/messages`,
      JSON.stringify({
        content: `Continuous chat message from VU ${__VU} [round ${__ITER}] at ${Date.now()}`,
      }),
      params
    );
    chatSendDuration.add(Date.now() - startMsg);
    writeOpsDuration.add(Date.now() - startMsg);
    opCounter.add(1);
    check(resSend, { 'Send direct chat message (200/201)': (r) => r.status === 200 || r.status === 201 });

    const startRead = Date.now();
    const resMessages = http.get(
      `${BASE_URL}/direct-chat/conversations/${myConversationId}/messages`,
      params
    );
    readOpsDuration.add(Date.now() - startRead);
    opCounter.add(1);
    check(resMessages, { 'Get direct chat messages (200)': (r) => r.status === 200 });
  }

  // 7. Personal meeting ensure
  if (Math.random() < 0.20) {
    const resPersonal = http.post(`${BASE_URL}/meetings/personal/ensure`, {}, params);
    opCounter.add(1);
    check(resPersonal, { 'Ensure personal meeting (200/201)': (r) => r.status === 200 || r.status === 201 });
  }

  dashboardDuration.add(Date.now() - start);
}

/**
 * ---------------------------------------------------------
 * TEARDOWN FUNCTION
 * ---------------------------------------------------------
 */
export function teardown(data) {
  console.log('\n======================================================');
  console.log(`[TEARDOWN] Completed load test for channel meeting: ${data.meetingCode}`);
  console.log('[TEARDOWN] All metrics and latency reports collected.');
  console.log('======================================================\n');
}

/**
 * ---------------------------------------------------------
 * HTML REPORT & CONSOLE SUMMARY EXPORTER
 * ---------------------------------------------------------
 */
export function handleSummary(data) {
  return {
    'load-tests/report.html': htmlReport(data, { title: 'ToboMeet 500 Virtual Users Load Test Report' }),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
