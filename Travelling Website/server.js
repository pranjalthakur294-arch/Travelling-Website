const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");

const app = express();

/* ===========================
   🔧 MIDDLEWARE
   =========================== */

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from website folder
const staticDir = path.resolve(__dirname);
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(staticDir, "favicon.ico"));
});

// 🏠 PRIMARY LANDING PAGE: GET / serves main.html
app.get("/", (req, res) => {
  res.sendFile(path.join(staticDir, "main.html"));
});

app.use(express.static(staticDir));

/* ===========================
   🛢 DATABASE CONNECTION
   =========================== */

const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "traveluser",
  password: process.env.DB_PASSWORD || "1234",
  database: process.env.DB_NAME || "travel_db"
});

db.connect((err) => {
  if (err) {
    console.error("Database Connection Error:", err.message);
  } else {
    console.log("Database Connected ✅");
    initSessionStore();
  }
});

/* ===========================
   🔐 SERVER-SIDE SESSION STORE (MySQL PERSISTENT + IN-MEMORY CACHE)
   =========================== */

// Session store: token -> { userId, email, name, role, expiresAt }
const sessionStore = new Map();
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function initSessionStore() {
  const createSessionsTable = `
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) PRIMARY KEY,
      session_data TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  db.query(createSessionsTable, (err) => {
    if (err) {
      console.error("Failed to ensure sessions table:", err.message);
      return;
    }
    const now = Date.now();
    db.query("SELECT id, session_data, expires_at FROM sessions WHERE expires_at > ?", [now], (err, rows) => {
      if (err) {
        console.error("Failed to load sessions from database:", err.message);
        return;
      }
      let loaded = 0;
      for (const row of rows) {
        try {
          const session = JSON.parse(row.session_data);
          session.expiresAt = row.expires_at;
          sessionStore.set(row.id, session);
          loaded++;
        } catch (e) {}
      }
      if (loaded > 0) {
        console.log(`Restored ${loaded} persistent sessions from database ✅`);
      }
      // Purge expired sessions
      db.query("DELETE FROM sessions WHERE expires_at <= ?", [now], () => {});
    });
  });
}

function createSession(user, res) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL;
  const session = {
    userId: user.id,
    email: user.email.toLowerCase(),
    name: user.name,
    role: user.role || "user",
    expiresAt
  };
  sessionStore.set(token, session);

  // Persist session to MySQL
  db.query(
    "INSERT INTO sessions (id, session_data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE session_data = VALUES(session_data), expires_at = VALUES(expires_at)",
    [token, JSON.stringify(session), expiresAt],
    (err) => {
      if (err) console.error("Database session save error:", err.message);
    }
  );

  if (res) {
    res.cookie("wandr_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL,
      path: "/"
    });
  }
  return { token, session };
}

function getSession(req) {
  const token = req.cookies && req.cookies.wandr_session;
  if (!token) return null;

  const session = sessionStore.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessionStore.delete(token);
    db.query("DELETE FROM sessions WHERE id = ?", [token], () => {});
    return null;
  }
  return session;
}

function destroySession(req, res) {
  const token = req.cookies && req.cookies.wandr_session;
  if (token) {
    sessionStore.delete(token);
    db.query("DELETE FROM sessions WHERE id = ?", [token], (err) => {
      if (err) console.error("Database session destroy error:", err.message);
    });
  }
  if (res) {
    res.clearCookie("wandr_session", { path: "/" });
  }
}

// Authentication middleware (strict)
function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in."
    });
  }
  req.user = session;
  next();
}

// Optional authentication middleware (for guest/hybrid actions)
function optionalAuth(req, res, next) {
  const session = getSession(req);
  if (session) {
    req.user = session;
  }
  next();
}

// Admin authorization middleware
const ADMIN_API_KEY = process.env.ADMIN_KEY || "wandr-admin-key-2026";

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["x-admin-key"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  const session = getSession(req);
  const isAdminSession = session && session.role === "admin";

  if (token === ADMIN_API_KEY || isAdminSession) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Forbidden: Admin authorization required for this action."
  });
}

/* ===========================
   👤 USER AUTH APIs
   =========================== */

/* REGISTER USER */
app.post("/register", (req, res) => {
  const { name, email, mobile, country, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Name, email, and password are required fields."
    });
  }

  const emailClean = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailClean)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format."
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters."
    });
  }

  db.query("SELECT id FROM users WHERE email = ?", [emailClean], (err, existing) => {
    if (err) {
      console.error("Register check error:", err);
      return res.status(500).json({ success: false, message: "Database error during registration check" });
    }

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email ❌"
      });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const sql = "INSERT INTO users (name, phone, email, country, password) VALUES (?, ?, ?, ?, ?)";

    db.query(sql, [name.trim(), mobile || null, emailClean, country || null, hashedPassword], (err, result) => {
      if (err) {
        console.error("Register insert error:", err);
        return res.status(500).json({
          success: false,
          message: "Could not create user account ❌"
        });
      }

      const newUser = {
        id: result.insertId,
        name: name.trim(),
        email: emailClean,
        country: country || null
      };

      // Create session and set HTTP-only cookie
      createSession(newUser, res);

      res.status(201).json({
        success: true,
        message: "User Registered Successfully ✅",
        userId: newUser.id,
        user: { name: newUser.name, email: newUser.email, country: newUser.country }
      });
    });
  });
});

/* LOGIN USER */
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required."
    });
  }

  const emailClean = email.trim().toLowerCase();
  const sql = "SELECT id, name, phone, email, country, password FROM users WHERE email = ?";

  db.query(sql, [emailClean], (err, result) => {
    if (err) {
      console.error("Login database error:", err);
      return res.status(500).json({ success: false, message: "Server error during authentication" });
    }

    if (result.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid Credentials ❌"
      });
    }

    const user = result[0];
    let passwordMatches = false;

    // Check bcrypt hash
    if (user.password && (user.password.startsWith("$2a$") || user.password.startsWith("$2b$"))) {
      passwordMatches = bcrypt.compareSync(password, user.password);
    } else {
      // Legacy plaintext password check
      passwordMatches = (user.password === password);
      // Transparently upgrade legacy plaintext password to bcrypt hash on successful login
      if (passwordMatches) {
        const upgradedHash = bcrypt.hashSync(password, 10);
        db.query("UPDATE users SET password = ? WHERE id = ?", [upgradedHash, user.id], (upErr) => {
          if (upErr) console.warn("Password hash upgrade warning:", upErr.message);
        });
      }
    }

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid Credentials ❌"
      });
    }

    // Create session and set HTTP-only cookie
    createSession(user, res);

    res.json({
      success: true,
      message: "Login Successful ✅",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        country: user.country
      }
    });
  });
});

/* LOGOUT USER */
app.post("/api/logout", (req, res) => {
  destroySession(req, res);
  res.json({
    success: true,
    message: "Logged out successfully ✅"
  });
});

/* GET CURRENT AUTHENTICATED USER */
app.get("/api/me", (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.json({
      authenticated: false,
      user: null
    });
  }
  res.json({
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      role: session.role
    }
  });
});

/* ===========================
   🔐 SERVER-SIDE OTP APIs (SECURED)
   =========================== */

// In-memory store: email -> { otp, expiresAt, attempts, lastSentAt }
const otpStore = new Map();

app.post("/api/otp/send", (req, res) => {
  const { email, name } = req.body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ success: false, message: "Valid email is required." });
  }

  const emailClean = email.trim().toLowerCase();
  const existing = otpStore.get(emailClean);

  // Rate-limiting: Minimum 60 seconds between OTP requests per email
  const now = Date.now();
  if (existing && existing.lastSentAt && (now - existing.lastSentAt < 60 * 1000)) {
    const waitSec = Math.ceil((60 * 1000 - (now - existing.lastSentAt)) / 1000);
    return res.status(429).json({
      success: false,
      message: `Please wait ${waitSec}s before requesting a new code.`
    });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry

  otpStore.set(emailClean, {
    otp,
    expiresAt,
    attempts: 0,
    lastSentAt: now
  });

  // DO NOT leak OTP in production response!
  const responseData = {
    success: true,
    message: "OTP sent to your email.",
    email: emailClean
  };

  // Only expose OTP in test environment so automated test suites can verify the flow
  if (process.env.NODE_ENV === "test") {
    responseData._testOtp = otp;
  }

  res.json(responseData);
});

app.post("/api/otp/verify", (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Email and OTP are required." });
  }

  const emailClean = email.trim().toLowerCase();
  const record = otpStore.get(emailClean);

  if (!record) {
    return res.status(400).json({ success: false, message: "No OTP requested or code expired. Please request a new code." });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(emailClean);
    return res.status(400).json({ success: false, message: "OTP has expired. Please request a new code." });
  }

  record.attempts++;
  if (record.attempts > 5) {
    otpStore.delete(emailClean);
    return res.status(429).json({ success: false, message: "Too many failed attempts. Please request a new OTP." });
  }

  if (record.otp !== String(otp).trim()) {
    return res.status(400).json({ success: false, message: "Incorrect OTP ❌" });
  }

  // One-time use: delete on successful verification
  otpStore.delete(emailClean);
  res.json({ success: true, message: "OTP Verified Successfully ✅" });
});

/* ===========================
   🌍 DESTINATION APIs
   =========================== */

/* GET DESTINATIONS (PUBLIC) */
app.get("/destinations", (req, res) => {
  db.query("SELECT id, country, city, image, created_at FROM destinations ORDER BY id ASC", (err, result) => {
    if (err) {
      console.error("Get destinations error:", err);
      return res.status(500).json({ success: false, message: "Error fetching destinations", error: err.message });
    }
    res.json(result);
  });
});

/* ADD DESTINATION (RESTRICTED TO ADMIN) */
app.post("/destinations", requireAdminAuth, (req, res) => {
  const { country, city, image } = req.body;

  if (!country || !city) {
    return res.status(400).json({ success: false, message: "Country and city are required." });
  }

  const sql = "INSERT INTO destinations (country, city, image) VALUES (?, ?, ?)";
  db.query(sql, [country.trim(), city.trim(), image ? image.trim() : null], (err, result) => {
    if (err) {
      console.error("Add destination error:", err);
      return res.status(500).json({ success: false, message: "Error saving destination", error: err.message });
    }
    res.status(201).json({
      success: true,
      message: "Destination Added Successfully",
      id: result.insertId
    });
  });
});

/* DELETE DESTINATION (RESTRICTED TO ADMIN) */
app.delete("/destinations/:id", requireAdminAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ success: false, message: "Invalid destination ID." });
  }

  db.query("DELETE FROM destinations WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error("Delete destination error:", err);
      return res.status(500).json({ success: false, message: "Error deleting destination", error: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Destination not found" });
    }
    res.json({
      success: true,
      message: "Destination Deleted Successfully"
    });
  });
});

/* ===========================
   ✈️ SAVE TRIP API (SECURE SESSION INTEGRATION)
   =========================== */

app.post("/saveTrip", optionalAuth, (req, res) => {
  const {
    fullName,
    destination,
    date,
    duration,
    adults,
    children,
    budget,
    email
  } = req.body;

  // Validate required fields
  const submittedEmail = (email && typeof email === "string" ? email.trim().toLowerCase() : "");
  const sessionEmail = req.user ? req.user.email : null;
  const targetEmail = sessionEmail || submittedEmail;

  if (!targetEmail || !targetEmail.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "A valid email address is required to save your trip."
    });
  }

  if (!destination || typeof destination !== "string") {
    return res.status(400).json({
      success: false,
      message: "Destination is required."
    });
  }

  const nameClean = (fullName && typeof fullName === "string" ? fullName.trim() : (req.user ? req.user.name : "Traveler"));
  const destClean = destination.trim();
  const durNum = parseInt(duration) || 7;
  const adultsNum = Math.max(1, parseInt(adults) || 1);
  const childrenNum = Math.max(0, parseInt(children) || 0);
  const budgetClean = budget ? String(budget).trim() : "Standard";

  let validDate = null;
  if (date) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      validDate = d.toISOString().split("T")[0];
    }
  }
  if (!validDate) {
    validDate = new Date().toISOString().split("T")[0];
  }

  const insertTripRecord = (userId) => {
    const insertTripSql = `
      INSERT INTO trips 
      (full_name, destination, travel_date, duration, adults, children, budget, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      insertTripSql,
      [
        nameClean,
        destClean,
        validDate,
        durNum,
        adultsNum,
        childrenNum,
        budgetClean,
        userId
      ],
      (err, result) => {
        if (err) {
          console.error("Trip save error:", err);
          return res.status(500).json({
            success: false,
            message: "Failed to save trip to database.",
            error: err.message
          });
        }

        res.status(201).json({
          success: true,
          message: "Trip Saved Successfully ✅",
          tripId: result.insertId,
          data: {
            destination: destClean,
            date: validDate,
            duration: durNum,
            adults: adultsNum,
            children: childrenNum,
            budget: budgetClean
          }
        });
      }
    );
  };

  // Case 1: Caller is already authenticated
  if (req.user) {
    return insertTripRecord(req.user.userId);
  }

  // Case 2: Unauthenticated guest submission with email
  db.query("SELECT id, name, email FROM users WHERE email = ?", [targetEmail], (err, users) => {
    if (err) {
      console.error("User lookup error:", err);
      return res.status(500).json({ success: false, message: "Database error during user lookup" });
    }

    if (users.length > 0) {
      // User already exists in DB: attach trip and establish session
      const existingUser = users[0];
      createSession(existingUser, res);
      insertTripRecord(existingUser.id);
    } else {
      // New user: create traveler account with secure placeholder hash and establish session
      const tempPasswordHash = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10);
      const createUserSql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";

      db.query(createUserSql, [nameClean, targetEmail, tempPasswordHash], (err, newUser) => {
        if (err) {
          console.error("Auto user creation error:", err);
          return res.status(500).json({ success: false, message: "Could not create user account for trip" });
        }
        createSession({ id: newUser.insertId, name: nameClean, email: targetEmail }, res);
        insertTripRecord(newUser.insertId);
      });
    }
  });
});

/* ===========================
   📄 GET USER TRIPS (PROTECTED BY AUTHENTICATED SESSION COOKIE)
   =========================== */

app.get(["/myTrips", "/myTrips/:email"], requireAuth, (req, res) => {
  // Always query by verified session userId, not untrusted client input!
  const sessionUser = req.user;

  // If a URL parameter is provided, ensure it matches the authenticated session identity
  if (req.params.email) {
    const requestedEmail = req.params.email.trim().toLowerCase();
    if (requestedEmail !== sessionUser.email) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot access another user's trips."
      });
    }
  }

  const sql = `
    SELECT 
      t.id,
      t.full_name,
      t.destination,
      DATE_FORMAT(t.travel_date, '%Y-%m-%d') AS travel_date,
      t.duration,
      t.adults,
      t.children,
      t.budget,
      t.user_id,
      u.email AS user_email,
      u.name AS user_name
    FROM trips t
    JOIN users u ON t.user_id = u.id
    WHERE t.user_id = ?
    ORDER BY t.id DESC
  `;

  db.query(sql, [sessionUser.userId], (err, result) => {
    if (err) {
      console.error("Get trips error:", err);
      return res.status(500).json({
        success: false,
        message: "Error retrieving trips",
        error: err.message
      });
    }

    res.json(result);
  });
});

/* ===========================
   🚀 START SERVER
   =========================== */

const PORT = process.env.PORT || 3000;
let server = null;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} 🚀`);
  });
}

module.exports = { app, server, db, sessionStore, otpStore };
