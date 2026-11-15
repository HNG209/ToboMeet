/**
 * SCRIPT TỰ ĐỘNG TẠO VÀ LẤY NHIỀU TOKEN SUPABASE ĐỂ LOAD TEST
 * 
 * Cách chạy:
 *   node load-tests/generate-tokens.js [số_lượng_user]
 * Ví dụ:
 *   node load-tests/generate-tokens.js 100
 *   node load-tests/generate-tokens.js 200
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Đọc biến môi trường từ .env
function loadEnv() {
  const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../apps/server/.env'),
    path.resolve(__dirname, '../apps/web/.env'),
    path.resolve(__dirname, '../apps/web/.env.local'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = value.trim();
          }
        }
      });
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Lỗi: Không tìm thấy SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env');
  process.exit(1);
}

const userCount = parseInt(process.argv[2] || '100', 10);
const DEFAULT_PASSWORD = 'TestPassword@123';

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

// Helper: Chạy một mảng tasks theo lô (batches) để tối ưu tốc độ và không làm nghẽn API
async function runInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map((item, idx) => fn(item, i + idx)));
    results.push(...chunkResults);
    // Nghỉ nhẹ 100ms giữa các lô
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return results;
}

async function signInWithRetry(u, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email: u.email,
        password: u.password,
      });

      if (!error && data?.session?.access_token) {
        return data.session.access_token;
      }

      if (error) {
        const isRateLimit = error.message.includes('rate limit') || error.status === 429;
        const isNetworkErr = error.message.includes('fetch failed') || error.message.includes('network') || error.message.includes('timeout');

        if ((isRateLimit || isNetworkErr) && attempt < retries) {
          const delay = isRateLimit ? 6000 : 2500;
          const msgType = isRateLimit ? 'Rate-limit' : 'Lỗi mạng tạm thời';
          console.warn(`   ⏳ ${msgType} tại [${u.email}] (${error.message}), chờ ${delay / 1000}s rồi thử lại... (lần ${attempt}/${retries})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        console.warn(`   ❌ Lỗi đăng nhập [${u.email}]: ${error.message}`);
        return null;
      }
    } catch (err) {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

async function main() {
  console.log(`\n🚀 Bắt đầu tạo và lấy ${userCount} access tokens từ Supabase...`);
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);

  const testUsers = [];
  for (let i = 1; i <= userCount; i++) {
    const email = `loadtest_user_${i}@tobomeet.test`;
    testUsers.push({ email, password: DEFAULT_PASSWORD, displayName: `Test User ${i}` });
  }

  // Bước 1: Tạo/đồng bộ users qua Admin API (nếu có service_role_key)
  if (supabaseAdmin) {
    console.log('⚡ Đang đồng bộ tài khoản test qua Supabase Admin API (Lô 10 users/lần)...');
    await runInBatches(testUsers, 10, async (u) => {
      try {
        const { error } = await supabaseAdmin.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.displayName, display_name: u.displayName },
        });
        if (error && !error.message.includes('already registered') && !error.message.includes('already exists')) {
          console.warn(`   ⚠️ Không thể tạo ${u.email}: ${error.message}`);
        }
      } catch (e) {
        // bỏ qua nếu đã tồn tại
      }
    });
    console.log('   ✓ Đã hoàn tất đồng bộ danh sách tài khoản.');
  }

  // Bước 2: Đăng nhập lấy Bearer token theo lô 5 users song song
  console.log('🔑 Đang đăng nhập lấy JWT token (Lô 5 users song song)...');
  const tokens = [];
  await runInBatches(testUsers, 5, async (u, index) => {
    const token = await signInWithRetry(u);
    if (token) {
      tokens.push(token);
      if ((index + 1) % 10 === 0 || index + 1 === testUsers.length) {
        process.stdout.write(`   ✓ Tiến độ: [${tokens.length}/${testUsers.length}] tokens thành công.\n`);
      }
    }
  });

  if (tokens.length === 0) {
    console.error('\n❌ Không lấy được token nào! Vui lòng kiểm tra lại cấu hình Supabase.');
    process.exit(1);
  }

  // Bước 3: Lưu ra file tokens.json
  const outputPath = path.resolve(__dirname, 'tokens.json');
  fs.writeFileSync(outputPath, JSON.stringify(tokens, null, 2), 'utf8');

  console.log(`\nĐã tạo và lưu thành công ${tokens.length} access tokens vào ${outputPath}`);
}

main().catch((err) => {
  console.error('❌ Lỗi runtime:', err);
  process.exit(1);
});
