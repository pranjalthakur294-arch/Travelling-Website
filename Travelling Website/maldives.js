/* ─────────────────────────────────────────
   Maldives Price Calculator & Interactions
   maldives.js
───────────────────────────────────────── */

let state = {
  travelers: 2,
  days: 6,
  tierMultiplier: 1100, // Mid tier per traveler per day ($1,100)
  minPerDay: 400,
  maxPerDay: 1800
};

function formatCurrency(val) {
  return "$" + val.toLocaleString();
}

function updatePrice() {
  const travelersEl = document.getElementById("travelers");
  const daysEl = document.getElementById("days");
  const totalPriceEl = document.getElementById("total-price");
  const perTravelerEl = document.getElementById("per-traveler");
  const summaryEl = document.getElementById("trip-summary");
  const minLabelEl = document.getElementById("min-label");
  const maxLabelEl = document.getElementById("max-label");

  if (travelersEl) travelersEl.textContent = state.travelers;
  if (daysEl) daysEl.textContent = state.days;

  const total = state.travelers * state.days * state.tierMultiplier;
  const perPerson = state.days * state.tierMultiplier;
  const minTotal = state.travelers * state.days * state.minPerDay;
  const maxTotal = state.travelers * state.days * state.maxPerDay;

  if (totalPriceEl) totalPriceEl.textContent = formatCurrency(total);
  if (perTravelerEl) perTravelerEl.textContent = formatCurrency(perPerson) + " / traveler";
  if (summaryEl) {
    const tLabel = state.travelers === 1 ? "1 traveler" : `${state.travelers} travelers`;
    const dLabel = state.days === 1 ? "1 day" : `${state.days} days`;
    summaryEl.textContent = `${tLabel}, ${dLabel}`;
  }
  if (minLabelEl) minLabelEl.textContent = `USD ${formatCurrency(minTotal)}`;
  if (maxLabelEl) maxLabelEl.textContent = `USD ${formatCurrency(maxTotal)}`;
}

function adjust(type, delta) {
  if (type === "travelers") {
    state.travelers = Math.max(1, Math.min(20, state.travelers + delta));
  } else if (type === "days") {
    state.days = Math.max(1, Math.min(60, state.days + delta));
  }
  updatePrice();
}

document.addEventListener("DOMContentLoaded", () => {
  updatePrice();

  // Wire craft trip buttons
  document.querySelectorAll(".btn-craft, .btn-primary, .btn-main").forEach(btn => {
    if (btn.textContent.toLowerCase().includes("craft")) {
      btn.style.cursor = "pointer";
      btn.addEventListener("click", () => {
        localStorage.setItem("tripDestination", "maldives");
        localStorage.setItem("tripDuration", state.days);
        window.location.href = "trip.html";
      });
    }
  });

  // Wire login button
  document.querySelectorAll(".btn-outline").forEach(btn => {
    if (btn.textContent.toLowerCase().includes("login")) {
      btn.style.cursor = "pointer";
      btn.addEventListener("click", () => {
        window.location.href = "loginverfication.html";
      });
    }
  });
});
