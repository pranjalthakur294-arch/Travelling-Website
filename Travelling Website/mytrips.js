/* ─────────────────────────────────────────
   WANDR — My Trips Dashboard
   mytrips.js
───────────────────────────────────────── */

/* ── STATE ── */
let trips = [];
let activeFilter = "all";
let searchQuery = "";
let activeModalId = null;

/* ── DESTINATION MAPS ── */
const destImages = {
  india: "images/tajmahal.jpg",
  spain: "images/spain.jpg",
  japan: "images/cherry.jpg",
  italy: "images/flo.png",
  mexico: "images/Mexico.jpg",
  switzerland: "images/Switzerland.jpg"
};

const destItineraries = {
  india: "itinerary.html",
  spain: "spain-itinerary.html",
  japan: "japan_itinerary.html",
  italy: "italy-itinerary.html",
  mexico: "mexico-itinerary.html",
  switzerland: "switzerland_itinerary.html"
};

function getDestinationImage(dest) {
  if (!dest) return "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800";
  const key = dest.toLowerCase().replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(destImages)) {
    if (key.includes(k)) return v;
  }
  return "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800";
}

function getItineraryLink(dest) {
  if (!dest) return "itinerary.html";
  const key = dest.toLowerCase().replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(destItineraries)) {
    if (key.includes(k)) return v;
  }
  return "itinerary.html";
}

/* ── HELPERS ── */
const statusLabel = { upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled", planning: "Planning" };
const colors = ["#7c3aed", "#e8521a", "#3d6b46", "#c9882a", "#0e8a8a", "#c42b1a"];

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function avatarColor(i) { return colors[i % colors.length]; }

function travelerString(adults, children) {
  const parts = [];
  if (adults) parts.push(`${adults} Adult${adults > 1 ? "s" : ""}`);
  if (children) parts.push(`${children} Child${children > 1 ? "ren" : ""}`);
  return parts.join(", ") || "1 Adult";
}

function initials(name) {
  if (!name) return "TR";
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

/* ── RENDER STATS ── */
function renderStats() {
  const statTotal = document.getElementById("stat-total");
  const statUpcoming = document.getElementById("stat-upcoming");
  const statCompleted = document.getElementById("stat-completed");
  const statDays = document.getElementById("stat-days");

  if (statTotal) statTotal.textContent = trips.length;
  if (statUpcoming) statUpcoming.textContent = trips.filter(t => t.status === "upcoming" || t.status === "planning").length;
  if (statCompleted) statCompleted.textContent = trips.filter(t => t.status === "completed").length;
  const totalDays = trips.reduce((s, t) => s + (parseInt(t.duration) || 0), 0);
  if (statDays) statDays.textContent = totalDays;
}

/* ── RENDER CARDS ── */
function renderCards() {
  const grid = document.getElementById("trips-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = trips.filter(t => {
    const matchFilter = activeFilter === "all" || t.status === activeFilter;
    const dest = (t.destination || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchSearch = dest.includes(query);
    return matchFilter && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✈️</span>
        <div class="empty-title">No trips found</div>
        <p class="empty-sub">${searchQuery ? "Try a different search term." : "No trips planned yet — let's fix that."}</p>
        <a href="trip.html" class="btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
          <span>＋</span> Plan New Trip
        </a>
      </div>`;
    return;
  }

  filtered.forEach((trip, i) => {
    const totalTravelers = (trip.adults || 1) + (trip.children || 0);
    const avatarDots = Array.from({ length: Math.min(totalTravelers, 4) }, (_, j) =>
      `<div class="traveler-dot" style="background:${avatarColor(j)}">${j === 0 ? initials(trip.destination) : ""}</div>`
    ).join("");

    const card = document.createElement("div");
    card.className = "trip-card";
    card.style.animationDelay = `${i * 0.08}s`;
    card.dataset.id = trip.id;

    card.innerHTML = `
      <div class="card-img-wrap">
        <img src="${escapeHtml(trip.image)}" alt="${escapeHtml(trip.destination)}" loading="lazy"/>
        <div class="card-img-overlay"></div>
        <span class="status-badge ${escapeHtml(trip.status)}">${escapeHtml(statusLabel[trip.status] || "Planning")}</span>
        <div class="card-dest">
          <div class="card-dest-name">${escapeHtml(trip.destination)}</div>
          <div class="card-dest-country">${escapeHtml(trip.country || "Journey")}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-meta-row">
          <div class="card-meta-item">
            <div class="meta-key">📅 Date</div>
            <div class="meta-val" style="font-size:12px;font-weight:500">${escapeHtml(trip.date)}</div>
          </div>
          <div class="card-meta-item">
            <div class="meta-key">🌙 Duration</div>
            <div class="meta-val">${escapeHtml(String(trip.duration))} Days</div>
          </div>
          <div class="card-meta-item">
            <div class="meta-key">💰 Budget</div>
            <div class="meta-val">${escapeHtml(String(trip.budget))}</div>
          </div>
          <div class="card-meta-item">
            <div class="meta-key">👥 Travelers</div>
            <div class="meta-val">${totalTravelers}</div>
          </div>
        </div>
        <div class="card-divider"></div>
        <div class="card-travelers">
          <div class="traveler-avatars">${avatarDots}</div>
          <span>${escapeHtml(travelerString(trip.adults, trip.children))}</span>
        </div>
      </div>
      <div class="card-footer">
        <button class="btn-view" onclick="openModal(${trip.id})">View Details</button>
        <a href="${getItineraryLink(trip.destination)}" class="btn-view" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;background:#1a1a18;color:#fff;">Itinerary →</a>
      </div>`;

    grid.appendChild(card);
  });
}

/* ── MODAL ── */
function openModal(id) {
  const trip = trips.find(t => t.id === id);
  if (!trip) return;
  activeModalId = id;

  document.getElementById("modal-img").src = trip.image;
  document.getElementById("modal-img").alt = trip.destination;
  document.getElementById("modal-title").textContent = trip.destination;
  document.getElementById("modal-country").textContent = trip.country || "Personalized Journey";
  document.getElementById("modal-date").textContent = trip.date;
  document.getElementById("modal-duration").textContent = `${trip.duration} Days`;
  document.getElementById("modal-budget").textContent = trip.budget;
  document.getElementById("modal-travelers").textContent = travelerString(trip.adults, trip.children);
  
  const statusEl = document.getElementById("modal-status");
  statusEl.textContent = statusLabel[trip.status] || "Planning";
  statusEl.className = `status-badge ${trip.status}`;

  document.getElementById("modal-notes").textContent = trip.notes || `Curated bespoke travel journey for ${trip.destination}.`;

  const itinBtn = document.getElementById("modal-itin-btn");
  if (itinBtn) {
    itinBtn.onclick = () => {
      window.location.href = getItineraryLink(trip.destination);
    };
  }

  document.getElementById("modal-backdrop").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) backdrop.classList.remove("open");
  document.body.style.overflow = "";
  activeModalId = null;
}

/* ── TOAST ── */
let toastTimer = null;
function showToast(icon, message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  document.getElementById("toast-icon").textContent = icon;
  document.getElementById("toast-message").textContent = message;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

/* ── FILTER & SEARCH ── */
function setFilter(val) {
  activeFilter = val;
  document.querySelectorAll(".filter-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === val);
  });
  renderCards();
}

function handleSearch(e) {
  searchQuery = e.target.value;
  renderCards();
}

/* ── LOGOUT ── */
function handleLogout() {
  const apiBase = (window.location.protocol.startsWith("http") && !window.location.origin.includes(":3000")) ? "" : "http://localhost:3000";
  fetch(apiBase + "/api/logout", {
    method: "POST",
    credentials: "include"
  }).catch(() => null);

  sessionStorage.removeItem("userEmail");
  localStorage.removeItem("userEmail");
  sessionStorage.clear();
  showToast("👋", "You've been logged out. Safe travels!");
  setTimeout(() => {
    window.location.href = "main.html";
  }, 900);
}

/* ── KEYBOARD ── */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); }
});

/* ── LOAD TRIPS ── */
async function loadTrips() {
  const avatarEl = document.getElementById("userAvatar");
  const grid = document.getElementById("trips-grid");
  const apiBase = (window.location.protocol.startsWith("http") && !window.location.origin.includes(":3000")) ? "" : "http://localhost:3000";

  try {
    // 1. Verify authenticated session
    const authRes = await fetch(apiBase + "/api/me", { credentials: "include" });
    const authData = await authRes.json().catch(() => null);

    if (!authData || !authData.authenticated) {
      if (grid) {
        grid.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🔐</span>
            <div class="empty-title">Please Log In</div>
            <p class="empty-sub">Sign in to your WANDR account to view your saved trips and customized itineraries.</p>
            <a href="loginverfication.html?mode=login" class="btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
              <span>→</span> Sign In / Register
            </a>
          </div>`;
      }
      return;
    }

    const email = authData.user.email;
    sessionStorage.setItem("userEmail", email);
    localStorage.setItem("userEmail", email);
    if (avatarEl) {
      avatarEl.textContent = (authData.user.name || email).slice(0, 2).toUpperCase();
    }

    // 2. Load trips for the verified session identity
    const res = await fetch(apiBase + "/myTrips", { credentials: "include" });
    if (!res.ok) {
      if (res.status === 401) {
        if (grid) {
          grid.innerHTML = `
            <div class="empty-state">
              <span class="empty-icon">🔐</span>
              <div class="empty-title">Please Log In</div>
              <p class="empty-sub">Sign in to your WANDR account to view your saved trips and customized itineraries.</p>
              <a href="loginverfication.html" class="btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
                <span>→</span> Sign In / Register
              </a>
            </div>`;
        }
        return;
      }
      const err = await res.json().catch(() => null);
      throw new Error((err && err.message) || "Failed to load trips.");
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      trips = [];
    } else {
      trips = data.map(trip => ({
        id: trip.id,
        destination: trip.destination || "Custom Journey",
        country: "Curated Trip",
        image: getDestinationImage(trip.destination),
        date: trip.travel_date || "Upcoming",
        duration: trip.duration || 7,
        budget: trip.budget || "Standard",
        adults: trip.adults || 1,
        children: trip.children || 0,
        status: "planning",
        notes: `Full itinerary reserved for ${trip.full_name || "Traveler"}.`
      }));
    }

    renderStats();
    renderCards();
  } catch (err) {
    console.error("Error loading trips:", err);
    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⚠️</span>
          <div class="empty-title">Could not load trips</div>
          <p class="empty-sub">${escapeHtml(err.message || "Please make sure the server is running.")}</p>
          <button class="btn-primary" onclick="loadTrips()">Retry</button>
        </div>`;
    }
  }
}

/* ── INIT ── */
document.addEventListener("DOMContentLoaded", () => {
  loadTrips();
});
