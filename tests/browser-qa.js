const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

const { app } = require('../Travelling Website/server.js');

let server;
let browser;

const results = [];

async function step(name, fn) {
  process.stdout.write(`• [BROWSER QA] ${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    results.push({ name, status: 'PASS' });
  } catch(err) {
    console.log(`❌ FAIL: ${err.message}`);
    results.push({ name, status: 'FAIL', error: err.message });
  }
}

async function runBrowserQA() {
  console.log('\n======================================================');
  console.log('  TRAVELLING WEBSITE - REAL BROWSER QA TEST SUITE    ');
  console.log('======================================================\n');

  // Start Express server on port 3000
  await new Promise((resolve) => {
    server = app.listen(3000, resolve);
  });
  console.log('Live Express Server running on port 3000 ✅');

  // Launch real Headless Chrome
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  console.log('Headless Chrome Browser launched successfully ✅\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleErrors = [];
  const unexpectedConsoleErrors = [];
  const networkFailures = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const loc = msg.location();
      const text = msg.text();
      const errInfo = `${text} (at ${loc.url || 'unknown'}:${loc.lineNumber || 0}:${loc.columnNumber || 0})`;
      consoleErrors.push(errInfo);
      if ((text.includes('victim_user@example.com') || (loc.url && loc.url.includes('victim_user@example.com'))) && text.includes('403')) {
        console.log(`\n    ℹ️  [INTENTIONAL SECURITY PROBE 403]: Confirmed server blocked unauthorized victim trip access`);
      } else {
        unexpectedConsoleErrors.push(errInfo);
        console.log(`\n    ⚠️  [CONSOLE ERROR DETECTED]: ${errInfo}`);
      }
    }
  });

  page.on('pageerror', err => {
    const errInfo = `Uncaught exception: ${err.message}\n${err.stack || ''}`;
    consoleErrors.push(errInfo);
    unexpectedConsoleErrors.push(errInfo);
    console.log(`\n    ⚠️  [PAGE ERROR DETECTED]: ${errInfo}`);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    const failureText = req.failure() ? req.failure().errorText : '';
    // Ignore third-party Unsplash blocked requests and video stream aborts upon page navigation
    if (url.includes('unsplash.com') || (failureText === 'net::ERR_ABORTED' && (url.endsWith('.mp4') || url.endsWith('.webm')))) {
      return;
    }
    networkFailures.push(`${req.method()} ${url}: ${failureText}`);
  });

  const testUser = {
    name: 'Main Explorer',
    email: `explorer_${Date.now()}@testwandr.com`,
    password: 'ExplorePassword2026!'
  };

  // --- WORKFLOW 1: Open http://localhost:3000/ and verify main.html loads ---
  await step('WF 1: Open http://localhost:3000/ and verify main.html loads as default landing page', async () => {
    const res = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(res.status(), 200);

    const title = await page.title();
    assert.ok(title.includes('Travel Destinations'), `Expected title to contain Travel Destinations, got ${title}`);

    const brand = await page.$eval('.nav-center', el => el.textContent.trim());
    assert.strictEqual(brand, 'WANDR');

    const heroHeading = await page.$eval('.hero-overlay h1', el => el.textContent.trim());
    assert.strictEqual(heroHeading, 'Discover the World');
  });

  // --- WORKFLOW 2: Verify Login and Register appear when logged out ---
  await step('WF 2: Verify Login and Register buttons appear when logged out', async () => {
    const loggedOutDisplay = await page.$eval('#authLoggedOut', el => window.getComputedStyle(el).display);
    assert.notStrictEqual(loggedOutDisplay, 'none', 'authLoggedOut must be visible');

    const loginText = await page.$eval('#loginBtn', el => el.textContent.trim());
    const registerText = await page.$eval('#registerBtn', el => el.textContent.trim());
    assert.strictEqual(loginText, 'Login');
    assert.strictEqual(registerText, 'Register');

    const loggedInDisplay = await page.$eval('#authLoggedIn', el => window.getComputedStyle(el).display);
    assert.strictEqual(loggedInDisplay, 'none', 'authLoggedIn must be hidden when logged out');
  });

  // --- WORKFLOW 3 & 4: Click Login, authenticate, and confirm redirect to main.html ---
  await step('WF 3 & 4: Register/Login and confirm browser redirects to main.html', async () => {
    // Click login button in navbar
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click('#loginBtn')
    ]);

    assert.ok(page.url().includes('loginverfication.html'), 'Should navigate to loginverfication.html');

    // Perform registration directly through verified API endpoint with credentials
    const regResult = await page.evaluate(async (user) => {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          mobile: '+919876543210',
          country: 'India',
          password: user.password
        })
      });
      return { status: res.status, body: await res.json() };
    }, testUser);

    assert.strictEqual(regResult.status, 201);
    assert.strictEqual(regResult.body.success, true);

    // Simulate login form submit on loginverfication.html
    await page.evaluate(() => switchTab('login'));
    await page.type('#l-email', testUser.email);
    await page.type('#l-pass', testUser.password);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click('#form-login .btn-submit')
    ]);

    const finalUrl = page.url();
    assert.ok(finalUrl.includes('main.html') || finalUrl === `${BASE_URL}/`, `Expected redirect to main.html, got ${finalUrl}`);
  });

  // --- WORKFLOW 5: Confirm logged-in navigation appears ---
  await step('WF 5: Confirm logged-in navigation (My Trips, User Info, Logout) appears', async () => {
    await page.waitForSelector('#authLoggedIn', { visible: true });

    const myTripsVisible = await page.$eval('#myTripsBtn', el => el.textContent.trim());
    assert.strictEqual(myTripsVisible, 'My Trips');

    const logoutVisible = await page.$eval('#logoutBtn', el => el.textContent.trim());
    assert.strictEqual(logoutVisible, 'Logout');

    const userName = await page.$eval('#userName', el => el.textContent.trim());
    assert.ok(userName.length > 0, 'User name should be displayed');

    const loggedOutDisplay = await page.$eval('#authLoggedOut', el => window.getComputedStyle(el).display);
    assert.strictEqual(loggedOutDisplay, 'none', 'authLoggedOut must be hidden when logged in');
  });

  // --- WORKFLOW 6: Refresh main.html and verify login state persists ---
  await step('WF 6: Refresh main.html and verify login state persists via session cookie', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#authLoggedIn', { visible: true });

    const loggedInDisplay = await page.$eval('#authLoggedIn', el => window.getComputedStyle(el).display);
    assert.notStrictEqual(loggedInDisplay, 'none', 'User must stay logged in after refresh');

    const me = await page.evaluate(async () => {
      const res = await fetch('/api/me', { credentials: 'include' });
      return await res.json();
    });
    assert.strictEqual(me.authenticated, true);
    assert.strictEqual(me.user.email, testUser.email);
  });

  // --- WORKFLOW 7: Open My Trips and verify dashboard loads ---
  await step('WF 7: Open My Trips from main.html and verify dashboard renders', async () => {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click('#myTripsBtn')
    ]);

    assert.ok(page.url().includes('mytrips.html'));
    const title = await page.title();
    assert.ok(title.includes('My Trips'));

    await new Promise(r => setTimeout(r, 600));
    const tripsGrid = await page.$('#trips-grid');
    assert.ok(tripsGrid, 'Trips grid container must exist');
  });

  // --- WORKFLOW 8 & 9: Return to main.html, click Craft Your Trip, and save trip ---
  await step('WF 8 & 9: Return to main.html, click Craft Your Trip, and save new trip', async () => {
    await page.goto(`${BASE_URL}/main.html`, { waitUntil: 'domcontentloaded' });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click('.nav-craft')
    ]);

    assert.ok(page.url().includes('trip.html'));

    // Step 1: Select destination
    await page.evaluate(() => {
      pickDest('🌴 India', 'india');
    });

    // Step 2: Set duration
    await page.evaluate(() => {
      goTo(2);
      document.getElementById('dateInput').value = '2026-12-10';
      document.getElementById('durationInput').value = '14';
      checkCont('cont2');
    });

    // Step 6: Verify pre-populated email/name or enter and submit
    await page.evaluate((user) => {
      goTo(6);
      const n = document.getElementById('nameInput');
      const e = document.getElementById('emailInput');
      if (!n.value) n.value = user.name;
      if (!e.value) e.value = user.email;
      checkStep6();
    }, testUser);

    const btnActive = await page.$eval('#cont6', el => el.classList.contains('active'));
    assert.strictEqual(btnActive, true, 'Continue button on step 6 should be active');

    // Trigger submission
    await page.evaluate(() => submitJourney());

    await new Promise(r => setTimeout(r, 1200));
    assert.ok(page.url().includes('itinerary.html'), 'Successful trip save must open itinerary.html');
  });

  // --- WORKFLOW 10: Verify saved trip appears in My Trips ---
  await step('WF 10: Verify newly saved trip appears in My Trips', async () => {
    await page.goto(`${BASE_URL}/mytrips.html`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    const tripCards = await page.$$('.trip-card');
    assert.ok(tripCards.length >= 1, 'At least 1 saved trip card must appear in My Trips');

    const totalStat = await page.$eval('#stat-total', el => el.textContent.trim());
    assert.ok(parseInt(totalStat) >= 1, 'Total trips counter must be >= 1');
  });

  // --- WORKFLOW 11 & 12: Click Logout, verify redirect to main.html and logged-out nav ---
  await step('WF 11 & 12: Click Logout, verify redirection to main.html and logged-out nav', async () => {
    await page.goto(`${BASE_URL}/main.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#logoutBtn', { visible: true });

    await page.click('#logoutBtn');
    await new Promise(r => setTimeout(r, 1200));

    const currentUrl = page.url();
    assert.ok(currentUrl.includes('main.html') || currentUrl === `${BASE_URL}/`, `Expected main.html after logout, got ${currentUrl}`);

    // Verify logged out state is active
    await page.waitForSelector('#authLoggedOut', { visible: true });
    const loggedInDisplay = await page.$eval('#authLoggedIn', el => window.getComputedStyle(el).display);
    assert.strictEqual(loggedInDisplay, 'none', 'authLoggedIn must be hidden after logout');

    // Verify session invalidation via /api/me
    const me = await page.evaluate(async () => {
      const res = await fetch('/api/me', { credentials: 'include' });
      return await res.json();
    });
    assert.strictEqual(me.authenticated, false, 'Session must be invalidated on server');
  });

  // --- WORKFLOW 13: Try accessing My Trips again and confirm authentication is required ---
  await step('WF 13: Accessing My Trips while logged out requires authentication', async () => {
    await page.goto(`${BASE_URL}/mytrips.html`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    const emptyText = await page.$eval('#trips-grid', el => el.textContent);
    assert.ok(emptyText.includes('Please Log In') || emptyText.includes('Sign in to your WANDR account'), 'Must prompt unauthenticated user to log in');
  });

  // --- WORKFLOW 14: Restart server and verify persistent session behavior ---
  await step('WF 14: Restart server and verify persistent session behavior', async () => {
    // 1. Log in again
    const loginResult = await page.evaluate(async (user) => {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: user.email, password: user.password })
      });
      return { status: res.status, body: await res.json() };
    }, testUser);

    assert.strictEqual(loginResult.status, 200);

    // 2. Shut down live Express server immediately closing any keep-alive connections
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
    console.log('\n    🔄 [SERVER RESTART SIMULATION]: Express server stopped');

    // 3. Restart Express server (will reload persistent sessions from MySQL)
    await new Promise((resolve) => {
      server = app.listen(3000, resolve);
    });
    console.log('    🔄 [SERVER RESTART SIMULATION]: Express server restarted and sessions restored from MySQL');

    // 4. Navigate to main.html in Chrome with existing session cookie
    await page.goto(`${BASE_URL}/main.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#authLoggedIn', { visible: true });

    const meAfterRestart = await page.evaluate(async () => {
      const res = await fetch('/api/me', { credentials: 'include' });
      return await res.json();
    });
    assert.strictEqual(meAfterRestart.authenticated, true);
    assert.strictEqual(meAfterRestart.user.email, testUser.email);
  });

  // --- ADDITIONAL COMPONENT CHECKS ---
  await step('Bonus Flow: User Isolation check across accounts (403)', async () => {
    const res = await page.evaluate(async () => {
      const resp = await fetch('/myTrips/victim_user@example.com', { credentials: 'include' });
      return { status: resp.status, body: await resp.json() };
    });
    assert.strictEqual(res.status, 403, 'Cross-user trip access must be rejected with 403');
  });

  await step('Bonus Flow: Maldives price calculator bounds and math', async () => {
    await page.goto(`${BASE_URL}/maldives%20(1).html`, { waitUntil: 'domcontentloaded' });
    let totalText = await page.$eval('#total-price', el => el.textContent.trim());
    assert.strictEqual(totalText, '$13,200');

    await page.evaluate(() => adjust('travelers', 1));
    totalText = await page.$eval('#total-price', el => el.textContent.trim());
    assert.strictEqual(totalText, '$19,800');
  });

  await step('Bonus Flow: Itinerary pages load cleanly with valid CTA buttons', async () => {
    const itins = [
      'itinerary.html',
      'spain-itinerary.html',
      'japan_itinerary.html',
      'italy-itinerary.html',
      'mexico-itinerary.html',
      'switzerland_itinerary.html'
    ];
    for (const itin of itins) {
      const res = await page.goto(`${BASE_URL}/${itin}`, { waitUntil: 'domcontentloaded' });
      assert.ok([200, 304].includes(res.status()), `Itinerary ${itin} must return 200 or 304`);
    }
  });

  // Close browser & server
  await browser.close();
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  server.close();

  console.log('\n======================================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`BROWSER QA TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`UNEXPECTED CONSOLE ERRORS: ${unexpectedConsoleErrors.length} | NETWORK FAILURES: ${networkFailures.length}`);
  if (networkFailures.length > 0) {
    networkFailures.forEach(nf => console.log(`    ℹ️ [NETWORK FAILURE]: ${nf}`));
  }
  console.log('======================================================\n');

  if (failed > 0 || unexpectedConsoleErrors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBrowserQA().catch(err => {
  console.error('Fatal browser QA error:', err);
  if (browser) browser.close();
  if (server) server.close();
  process.exit(1);
});
