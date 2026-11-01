# 🌍 Travelling Website (WANDR)

An interactive, full-stack travel planning and itinerary management platform built with **Node.js**, **Express**, **MySQL**, and modern frontend web technologies.

---

## ✨ Features

- **🗺️ Interactive Destination Guides & Itineraries**: Rich travel guides, day-by-day itineraries, cultural highlights, and video tours for top global destinations including:
  - 🇮🇳 India (Rajasthan, Maharashtra, cultural & heritage circuits)
  - 🇮🇹 Italy (Rome, Florence, Venice)
  - 🇯🇵 Japan (Tokyo, Kyoto, Sapporo, Hiroshima)
  - 🇲🇽 Mexico (Mexico City, Oaxaca, Yucatan cenotes)
  - 🇪🇸 Spain (Madrid, Barcelona, La Tomatina)
  - 🇨🇭 Switzerland (Lucerne, Geneva, Alpine passes)
  - 🇲🇻 Maldives (Island stays & marine adventures)
- **📅 Trip Planner & Booking Management**: Plan custom trips with dates, party sizes, duration, and budget. Save and view your planned journeys on the **My Trips** dashboard.
- **🔐 Secure Authentication & Session Management**:
  - User registration and login powered by `bcryptjs` password hashing.
  - Automatic migration of legacy plaintext passwords to secure bcrypt hashes on login.
  - Persistent server sessions stored in MySQL (`sessions` table) with in-memory caching.
  - OTP (One-Time Password) generation and verification workflow.
- **🛡️ Admin Destination API**: Protected admin endpoints to create and remove featured destinations.
- **🧪 Comprehensive Test Suite**: Built-in backend integration tests (`tests/run-tests.js`) and automated browser QA tests using Puppeteer (`tests/browser-qa.js`).

---

## 🛠️ Tech Stack

- **Backend**: [Node.js](https://nodejs.org/), [Express 5](https://expressjs.com/)
- **Database**: [MySQL](https://www.mysql.com/) with [`mysql2`](https://www.npmjs.com/package/mysql2)
- **Security & Auth**: `bcryptjs`, `cookie-parser`, `cors`, HTTP-only session cookies
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Responsive Design, Video Backgrounds
- **Testing & QA**: Node test runner, [Puppeteer Core](https://pptr.dev/)

---

## 📁 Project Structure

```text
Travelling Website/
├── package.json              # Project dependencies and npm scripts
├── package-lock.json
├── .gitignore                # Git ignore rules (node_modules, backups, large raw media)
├── README.md                 # Project documentation
├── scripts/
│   └── migrate.js            # Database migration and destination seeder
├── tests/
│   ├── run-tests.js          # Backend API & auth integration tests
│   └── browser-qa.js         # Headless browser automated QA tests
└── Travelling Website/       # Frontend application & server root
    ├── server.js             # Express application & API routing
    ├── main.html             # Landing page
    ├── Homepage.html         # Main dashboard / featured travels
    ├── trip.html             # Trip booking & itinerary customization
    ├── mytrips.html          # User's saved trips dashboard
    ├── loginverfication.html # Authentication & OTP verification portal
    ├── community.html        # Travel community page
    ├── images/               # Destination photography and icons
    ├── videos/               # Optimized hero videos and background reels
    └── ... (itinerary & destination pages: italy, japan, spain, switzerland, etc.)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **MySQL Server** (running locally or remotely)
- **npm** (comes bundled with Node.js)

### 1. Clone the Repository

```bash
git clone https://github.com/pranjalthakur294-arch/Travelling-Website.git
cd Travelling-Website
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure the Database

Create a MySQL database and user (or use existing credentials):

```sql
CREATE DATABASE travel_db;
CREATE USER 'traveluser'@'localhost' IDENTIFIED BY '1234';
GRANT ALL PRIVILEGES ON travel_db.* TO 'traveluser'@'localhost';
FLUSH PRIVILEGES;
```

#### Environment Variables (Optional)
The server supports standard environment variable overrides:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the Express server |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_USER` | `traveluser` | MySQL username |
| `DB_PASSWORD` | `1234` | MySQL password |
| `DB_NAME` | `travel_db` | MySQL database name |
| `ADMIN_KEY` | `wandr-admin-key-2026` | Key required for admin endpoints (`x-admin-key`) |

### 4. Run Migrations & Seed Data

Run the migration script to create tables (`sessions`, `destinations`, etc.) and seed featured countries:

```bash
node scripts/migrate.js
```

### 5. Start the Server

```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📡 API Overview

### Authentication & Sessions
- `POST /register` – Register a new account (`name`, `email`, `password`, `phone`, `country`).
- `POST /login` – Authenticate user and receive HTTP-only session cookie.
- `POST /api/logout` – Destroy session and clear cookies.
- `GET /api/me` – Retrieve currently logged-in user profile.
- `POST /api/otp/send` – Request an OTP for verification.
- `POST /api/otp/verify` – Verify submitted OTP.

### Trips & Bookings
- `POST /saveTrip` – Save/book a trip plan (`full_name`, `email`, `destination`, `travel_date`, `duration`, `adults`, `children`, `budget`).
- `GET /myTrips` – Retrieve all saved trips for the authenticated user.

### Destinations
- `GET /destinations` – Retrieve list of available destinations.
- `POST /destinations` – Add a destination (Requires `x-admin-key` header).
- `DELETE /destinations/:id` – Delete a destination (Requires `x-admin-key` header).

---

## 🧪 Testing

To execute the full integration and QA test suite:

```bash
npm test
```

Or run individual suites:

```bash
# Run backend API and authentication tests
node tests/run-tests.js

# Run browser QA tests
node tests/browser-qa.js
```

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
