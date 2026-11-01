let currentStep = 1;
let adults = 1, children = 0;
let selectedCards = 0;

const totalSteps = 6;

/* STEP NAVIGATION */

function goTo(n) {
  const currentEl = document.getElementById('step' + currentStep);
  if (currentEl) currentEl.classList.remove('active');
  currentStep = n;
  const targetEl = document.getElementById('step' + n);
  if (targetEl) targetEl.classList.add('active');
  const progText = document.getElementById('progressText');
  if (progText) progText.textContent = n + ' out of ' + totalSteps;

  document.querySelectorAll('.dropdown-list, .traveler-dropdown')
    .forEach(d => d.style.display = 'none');
}

function tryGoTo(n, btnId) {
  const btn = document.getElementById(btnId);
  if (btn && btn.classList.contains('active')) goTo(n);
}

/* STEP 2 VALIDATION */

document.addEventListener('change', () => {
  const d = document.getElementById('dateInput')?.value;
  const dur = document.getElementById('durationInput')?.value;
  const btn = document.getElementById('cont2');

  if (btn && d && dur && parseInt(dur) > 0) {
    btn.classList.replace('inactive', 'active');
  }
});

/* STEP 3 RADIO BUTTONS */

function selectRadio(groupId, el) {
  document.querySelectorAll('#' + groupId + ' .radio-option')
    .forEach(o => o.classList.remove('selected'));

  el.classList.add('selected');

  const a = document.querySelector('#accomGroup .radio-option.selected');
  const b = document.querySelector('#boutiqueGroup .radio-option.selected');

  const btn = document.getElementById('cont3');
  if (btn) {
    if (a && b) btn.classList.replace('inactive', 'active');
    else btn.classList.replace('active', 'inactive');
  }

  const budget = document.querySelector('#budgetGroup .radio-option.selected');
  const btn5 = document.getElementById('cont5');
  if (btn5 && budget) btn5.classList.replace('inactive', 'active');
}

/* STEP 4 IMAGE CARDS */

function toggleCard(el) {
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    selectedCards--;
  } else {
    if (selectedCards >= 4) return;
    el.classList.add('selected');
    selectedCards++;
  }

  const maxBadge = document.getElementById('maxBadge');
  if (maxBadge) maxBadge.textContent = (4 - selectedCards) + ' remaining';

  const btn = document.getElementById('cont4');
  if (btn) {
    if (selectedCards > 0) btn.classList.replace('inactive', 'active');
    else btn.classList.replace('active', 'inactive');
  }
}

/* STEP 6 VALIDATION */

function checkStep6() {
  const nameEl = document.getElementById('nameInput');
  const emailEl = document.getElementById('emailInput');
  const name = nameEl ? nameEl.value.trim() : '';
  const email = emailEl ? emailEl.value.trim() : '';

  const btn = document.getElementById('cont6');
  if (btn) {
    if (name.length > 1 && email.includes('@')) {
      btn.classList.replace('inactive', 'active');
    } else {
      btn.classList.replace('active', 'inactive');
    }
  }
}

function submitJourney() {
  const btn = document.getElementById('cont6');
  if (!btn || !btn.classList.contains('active')) return;

  const durationInput = document.getElementById("durationInput");
  const duration = durationInput ? durationInput.value : "7";

  localStorage.setItem("tripDuration", duration);

  btn.textContent = "✓ Building your itinerary...";
  btn.style.background = "linear-gradient(90deg,#16a34a,#059669)";

  setTimeout(() => {
    window.location.href = "itinerary.html";
  }, 1000);
}

/* DESTINATION DROPDOWN */

function toggleDrop(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display === 'block';

  document.querySelectorAll('.dropdown-list, .traveler-dropdown')
    .forEach(d => d.style.display = 'none');

  el.style.display = open ? 'none' : 'block';
}

function pick(inputId, listId, val) {
  const inputEl = document.getElementById(inputId);
  const listEl = document.getElementById(listId);
  if (inputEl) inputEl.value = val;
  if (listEl) listEl.style.display = 'none';
}

/* TRAVELER SELECTOR */

function changeTraveler(type, delta) {
  if (type === 'adults')
    adults = Math.max(1, adults + delta);

  if (type === 'children')
    children = Math.max(0, children + delta);

  const adultCountEl = document.getElementById('adultCount');
  const childCountEl = document.getElementById('childCount');
  const travelerDisplayEl = document.getElementById('travelerDisplay');

  if (adultCountEl) adultCountEl.textContent = adults;
  if (childCountEl) childCountEl.textContent = children;
  if (travelerDisplayEl) {
    travelerDisplayEl.textContent = `Adults ${adults}, Children ${children}`;
  }
}

/* CLOSE DROPDOWNS WHEN CLICKING OUTSIDE */

document.addEventListener('click', e => {
  if (!e.target.closest('.field-wrap')) {
    document.querySelectorAll('.dropdown-list, .traveler-dropdown')
      .forEach(d => d.style.display = 'none');
  }
});
