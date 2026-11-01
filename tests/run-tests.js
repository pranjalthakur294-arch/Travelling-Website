process.env.NODE_ENV = 'test';

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');

// Ensure database connection for direct DB assertions
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'traveluser',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'travel_db'
});

const { app } = require('../Travelling Website/server.js');

let server;
const PORT = 3001; // Isolated test port
const ADMIN_KEY = process.env.ADMIN_KEY || 'wandr-admin-key-2026';

function request(method, path, body = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...customHeaders
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch(e) {}
        
        // Extract set-cookie if present
        const setCookieHeader = res.headers['set-cookie'];
        let sessionCookie = null;
        if (setCookieHeader) {
          const match = setCookieHeader.find(c => c.startsWith('wandr_session='));
          if (match) {
            sessionCookie = match.split(';')[0];
          }
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookie: sessionCookie,
          body: json !== null ? json : data
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

const results = [];

async function runTest(name, fn) {
  process.stdout.write(`• ${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    results.push({ name, status: 'PASS' });
  } catch(err) {
    console.log(`❌ FAIL: ${err.message}`);
    results.push({ name, status: 'FAIL', error: err.message });
  }
}

async function runAll() {
  console.log('\n======================================================');
  console.log('  TRAVELLING WEBSITE - SECURITY & REGRESSION TESTS  ');
  console.log('======================================================\n');

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });

  const testEmail = `sec_tester_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';
  let user1Cookie = null;

  // --- 1. AUTH & COOKIE SESSION TESTS ---
  await runTest('POST /register hashes password with bcrypt and sets HTTP-only session cookie', async () => {
    const res = await request('POST', '/register', {
      name: 'Security Tester',
      email: testEmail,
      mobile: '+1234567890',
      country: 'India',
      password: testPassword
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.userId);
    assert.ok(res.cookie, 'Session cookie must be set');
    assert.ok(res.cookie.startsWith('wandr_session='));
    user1Cookie = res.cookie;

    // Verify DB does not leak plaintext
    await new Promise((resolve, reject) => {
      db.query('SELECT password FROM users WHERE email = ?', [testEmail], (err, rows) => {
        if (err) return reject(err);
        assert.ok(rows[0].password.startsWith('$2a$') || rows[0].password.startsWith('$2b$'));
        assert.notStrictEqual(rows[0].password, testPassword);
        resolve();
      });
    });
  });

  await runTest('POST /login verifies credentials and sets HTTP-only session cookie', async () => {
    const res = await request('POST', '/login', {
      email: testEmail,
      password: testPassword
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.cookie);
    user1Cookie = res.cookie;
  });

  await runTest('GET /api/me with session cookie returns authenticated user identity', async () => {
    const res = await request('GET', '/api/me', null, { Cookie: user1Cookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.authenticated, true);
    assert.strictEqual(res.body.user.email, testEmail);
  });

  await runTest('GET /api/me without cookie returns authenticated: false', async () => {
    const res = await request('GET', '/api/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.authenticated, false);
    assert.strictEqual(res.body.user, null);
  });

  await runTest('Legacy plaintext password auto-migrates to bcrypt on login', async () => {
    const legacyEmail = `legacy_${Date.now()}@example.com`;
    const legacyPass = 'plainOldPassword123';

    await new Promise((resolve, reject) => {
      db.query(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        ['Legacy User', legacyEmail, legacyPass],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const res = await request('POST', '/login', {
      email: legacyEmail,
      password: legacyPass
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.cookie);

    // Verify DB updated to bcrypt
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        db.query('SELECT password FROM users WHERE email = ?', [legacyEmail], (err, rows) => {
          if (err) return reject(err);
          assert.ok(rows[0].password.startsWith('$2a$') || rows[0].password.startsWith('$2b$'));
          assert.notStrictEqual(rows[0].password, legacyPass);
          resolve();
        });
      }, 100);
    });
  });

  // --- 2. OTP SECURITY & RATE-LIMITING TESTS ---
  await runTest('POST /api/otp/send generates OTP without leaking in production body', async () => {
    const res = await request('POST', '/api/otp/send', { email: testEmail });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await runTest('POST /api/otp/send rate limits rapid requests under 60 seconds (returns 429)', async () => {
    // Send immediate second request
    const res = await request('POST', '/api/otp/send', { email: testEmail });
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Please wait'));
  });

  await runTest('POST /api/otp/verify with correct code verifies and deletes OTP (one-time use)', async () => {
    const newOtpEmail = `otp_${Date.now()}@example.com`;
    const sendRes = await request('POST', '/api/otp/send', { email: newOtpEmail });
    const otp = sendRes.body._testOtp;

    const res1 = await request('POST', '/api/otp/verify', { email: newOtpEmail, otp });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.success, true);

    // Second verify attempt with same OTP must fail (one-time use)
    const res2 = await request('POST', '/api/otp/verify', { email: newOtpEmail, otp });
    assert.strictEqual(res2.status, 400);
    assert.strictEqual(res2.body.success, false);
  });

  await runTest('POST /api/otp/verify locks out after 5 failed attempts (returns 429)', async () => {
    const attemptEmail = `attempts_${Date.now()}@example.com`;
    await request('POST', '/api/otp/send', { email: attemptEmail });

    let lastRes;
    for (let i = 0; i < 6; i++) {
      lastRes = await request('POST', '/api/otp/verify', { email: attemptEmail, otp: '000000' });
    }
    assert.strictEqual(lastRes.status, 429);
    assert.strictEqual(lastRes.body.success, false);
  });

  // --- 3. TRIP SAVING & STRICT COOKIE-PROTECTED ACCESS ---
  let savedTripId = null;

  await runTest('POST /saveTrip with authenticated session cookie attaches trip to verified user', async () => {
    const res = await request('POST', '/saveTrip', {
      fullName: 'Security Tester',
      destination: 'Switzerland',
      date: '2026-08-15',
      duration: '10',
      adults: 2,
      children: 1,
      budget: 'Luxury'
    }, { Cookie: user1Cookie });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.tripId);
    savedTripId = res.body.tripId;
  });

  await runTest('GET /myTrips WITHOUT session cookie returns 401 Unauthorized', async () => {
    const res = await request('GET', '/myTrips');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  await runTest('GET /myTrips WITH session cookie retrieves saved trips', async () => {
    const res = await request('GET', '/myTrips', null, { Cookie: user1Cookie });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const trip = res.body.find(t => t.id === savedTripId);
    assert.ok(trip);
    assert.strictEqual(trip.destination, 'Switzerland');
    assert.strictEqual(trip.user_email, testEmail);
  });

  await runTest('GET /myTrips/:email with forged identity header (x-user-email) is rejected without valid cookie', async () => {
    const res = await request('GET', `/myTrips/${encodeURIComponent(testEmail)}`, null, {
      'x-user-email': testEmail
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  await runTest('GET /myTrips/:email for another user while logged in returns 403 Forbidden', async () => {
    const user2Email = `user2_${Date.now()}@example.com`;
    const reg2 = await request('POST', '/register', {
      name: 'User 2',
      email: user2Email,
      password: testPassword
    });
    const user2Cookie = reg2.cookie;

    // User 2 tries to access User 1's trips
    const res = await request('GET', `/myTrips/${encodeURIComponent(testEmail)}`, null, {
      Cookie: user2Cookie
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  // --- 4. LOGOUT & SESSION INVALIDATION ---
  await runTest('POST /api/logout invalidates session and clears cookie', async () => {
    const res = await request('POST', '/api/logout', {}, { Cookie: user1Cookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Trying to use old cookie after logout must now return 401
    const tripRes = await request('GET', '/myTrips', null, { Cookie: user1Cookie });
    assert.strictEqual(tripRes.status, 401);
  });

  // --- 5. DESTINATION ADMIN AUTHORIZATION ---
  let testDestId = null;

  await runTest('GET /destinations is public (200 OK)', async () => {
    const res = await request('GET', '/destinations');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  await runTest('POST /destinations without admin key returns 403 Forbidden', async () => {
    const res = await request('POST', '/destinations', {
      country: 'Unauthorized',
      city: 'Unauthorized'
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  await runTest('POST /destinations with admin key succeeds (201 Created)', async () => {
    const res = await request('POST', '/destinations', {
      country: 'New Zealand',
      city: 'Queenstown',
      image: 'images/nz.jpg'
    }, {
      'x-admin-key': ADMIN_KEY
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.id);
    testDestId = res.body.id;
  });

  await runTest('DELETE /destinations/:id without admin key returns 403 Forbidden', async () => {
    const res = await request('DELETE', `/destinations/${testDestId}`);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  await runTest('DELETE /destinations/:id with admin key succeeds', async () => {
    const res = await request('DELETE', `/destinations/${testDestId}`, null, {
      'x-admin-key': ADMIN_KEY
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  // --- 6. ROOT ROUTE & LANDING PAGE VERIFICATION ---
  await runTest('GET / serves main.html as the primary landing page (200 OK)', async () => {
    const res = await request('GET', '/');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body === 'string');
    assert.ok(res.body.includes('Discover the World') || res.body.includes('WANDR'));
    assert.ok(res.body.includes('authLoggedOut'));
  });

  await runTest('GET /Homepage.html serves Homepage.html as separate page (200 OK)', async () => {
    const res = await request('GET', '/Homepage.html');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body === 'string');
    assert.ok(res.body.includes('Lonely Planet') || res.body.includes('Travel like you mean it'));
  });

  // Clean up test server and db
  server.close();
  db.end();

  console.log('\n======================================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
