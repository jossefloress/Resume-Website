// ═══════════════════════════════════════════════════════════════
// FIREBASE IMPORTS
// ═══════════════════════════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ═══════════════════════════════════════════════════════════════
// FIREBASE CONFIG
// ═══════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            'AIzaSyCmF7AvWjDuJwdnZXZmSG9cALCSbJ3cHfQ',
  authDomain:        'meds-tracker-dbd22.firebaseapp.com',
  projectId:         'meds-tracker-dbd22',
  storageBucket:     'meds-tracker-dbd22.firebasestorage.app',
  messagingSenderId: '263135503978',
  appId:             '1:263135503978:web:1920ee257ee7c209718c13',
  measurementId:     'G-ZFFRK2WQNX'
};

const fbApp    = initializeApp(firebaseConfig);
const auth     = getAuth(fbApp);
const db       = getFirestore(fbApp);
const provider = new GoogleAuthProvider();

// ═══════════════════════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════════════════════
let currentUser         = null;
let isDemo              = true;
let storageKey          = 'meds_demo';
let drugDB              = {};
let drugDBReady         = false;
let prnVisible          = true;
let panelOpen           = true;
let generatedBlocks     = [];
let rowId               = 0;
let saveBannerDismissed = false;

// In-memory store of med docs fetched from Firestore.
// Shape: [ { medId, name, dose, pills, freq, foodNote,
//            prnReason, prnWait, checks: { "YYYY-MM-DD": { dose_0: true } } } ]
let firestoreMeds = [];

const DB_CACHE_KEY     = 'drugDB_cache_v1';
const DB_CACHE_VER_KEY = 'drugDB_cache_version';
const DB_SERVER_VER    = '1';

// ═══════════════════════════════════════════════════════════════
// FIRESTORE HELPERS
// Collection : users/{uid}/meds
// Each doc   : one medication + its daily check history
// ═══════════════════════════════════════════════════════════════

// Reference to the meds sub-collection for the current user
function medsColRef () {
  if (!currentUser) return null;
  return collection(db, 'users', currentUser.uid, 'meds');
}

// Reference to a single med document by its stable medId
function medDocRef (medId) {
  if (!currentUser || !medId) return null;
  return doc(db, 'users', currentUser.uid, 'meds', medId);
}

// Today's date string used as the checks key
function todayDateStr () {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// Generate a stable medId from name so the same med always maps
// to the same document (avoids duplicates on re-save).
function medIdFromName (name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 60);
}

// ═══════════════════════════════════════════════════════════════
// DEMO HERO
// ═══════════════════════════════════════════════════════════════
window.dismissDemoHero = function () {
  const hero = document.getElementById('demoHero');
  hero.classList.add('hidden');
  document.body.style.overflow = '';
  if (loadMeds().length > 0 && !saveBannerDismissed) showSaveBanner();
};

// ═══════════════════════════════════════════════════════════════
// STICKY SAVE BANNER
// ═══════════════════════════════════════════════════════════════
function showSaveBanner () {
  if (!isDemo || saveBannerDismissed) return;
  document.getElementById('demoSaveBanner').classList.add('visible');
}
function hideSaveBanner () {
  document.getElementById('demoSaveBanner').classList.remove('visible');
}
window.dismissSaveBanner = function () {
  saveBannerDismissed = true;
  hideSaveBanner();
};

// ═══════════════════════════════════════════════════════════════
// AUTH MODAL
// ═══════════════════════════════════════════════════════════════
window.openAuthModal = function (tab = 'signin') {
  switchTab(tab);
  const hasMeds = readMeds().length > 0;
  document.getElementById('authSavingNotice').classList.toggle('visible', hasMeds);
  document.getElementById('authModal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeAuthModal = function () {
  document.getElementById('authModal').classList.remove('open');
  document.body.style.overflow = '';
  clearAuthMessages();
};

document.getElementById('authModal').addEventListener('click', function (e) {
  if (e.target === this) window.closeAuthModal();
});

window.switchTab = function (tab) {
  clearAuthMessages();
  document.getElementById('formSignIn').style.display = tab === 'signin' ? '' : 'none';
  document.getElementById('formSignUp').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('tabSignIn').classList.toggle('active', tab === 'signin');
  document.getElementById('tabSignUp').classList.toggle('active', tab === 'signup');
};

function showAuthError   (msg) { const e = document.getElementById('authError');   e.textContent = msg; e.classList.add('visible'); }
function showAuthSuccess (msg) { const e = document.getElementById('authSuccess'); e.textContent = msg; e.classList.add('visible'); }
function clearAuthMessages () {
  document.getElementById('authError').classList.remove('visible');
  document.getElementById('authSuccess').classList.remove('visible');
}

function setAuthLoading (btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) { btn._orig = btn.innerHTML; btn.innerHTML = '<div class="spinner"></div> Please wait…'; }
  else         { btn.innerHTML = btn._orig || btn.innerHTML; }
}

// ═══════════════════════════════════════════════════════════════
// AUTH ACTIONS
// ═══════════════════════════════════════════════════════════════
window.signIn = async function () {
  clearAuthMessages();
  const email = document.getElementById('siEmail').value.trim();
  const pass  = document.getElementById('siPassword').value;
  if (!email || !pass) { showAuthError('Please enter your email and password.'); return; }
  setAuthLoading('btnSignIn', true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    showAuthError(friendlyError(e.code));
  } finally {
    setAuthLoading('btnSignIn', false);
  }
};

window.signUp = async function () {
  clearAuthMessages();
  const name  = document.getElementById('suName').value.trim();
  const email = document.getElementById('suEmail').value.trim();
  const pass  = document.getElementById('suPassword').value;
  if (!name)           { showAuthError('Please enter your name.');                  return; }
  if (!email)          { showAuthError('Please enter your email.');                 return; }
  if (pass.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
  setAuthLoading('btnSignUp', true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    showAuthError(friendlyError(e.code));
  } finally {
    setAuthLoading('btnSignUp', false);
  }
};

window.signInGoogle = async function () {
  clearAuthMessages();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') showAuthError(friendlyError(e.code));
  }
};

window.resetPassword = async function () {
  clearAuthMessages();
  const email = document.getElementById('siEmail').value.trim();
  if (!email) { showAuthError('Enter your email address first.'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showAuthSuccess('Password reset email sent! Check your inbox.');
  } catch (e) { showAuthError(friendlyError(e.code)); }
};

window.signOutUser = async function () {
  if (!confirm('Sign out of MedScheduler?')) return;
  await signOut(auth).catch(() => {});
  window.location.reload();
};

// ═══════════════════════════════════════════════════════════════
// AUTH STATE LISTENER
// ═══════════════════════════════════════════════════════════════
onAuthStateChanged(auth, user => {
  if (user) {
    // 1. Discard demo meds — never copy them into the real account
    localStorage.removeItem('meds_demo');

    // 2. Switch app state
    currentUser = user;
    isDemo      = false;
    storageKey  = `meds_${user.uid}`;

    // 3. Update UI
    updateHeaderForUser(user);
    hideSaveBanner();
    window.closeAuthModal();
    document.getElementById('demoHero').classList.add('hidden');
    document.body.style.overflow = '';

    // 4. Fetch meds from Firestore, rebuild form + schedule + checks
    reloadMedsForUser();
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE HEADER AFTER LOGIN
// ═══════════════════════════════════════════════════════════════
function updateHeaderForUser (user) {
  const name     = user.displayName || user.email?.split('@')[0] || 'User';
  const initials = name.slice(0, 2).toUpperCase();
  document.getElementById('demoChipBtn').style.display  = 'none';
  document.getElementById('userChip').style.display     = 'flex';
  document.getElementById('userAvatar').textContent     = initials;
  document.getElementById('userChipName').textContent   = name;
  document.getElementById('menuName').textContent       = name;
  document.getElementById('menuEmail').textContent      = user.email || '';
}

// ═══════════════════════════════════════════════════════════════
// RELOAD MEDS FOR LOGGED-IN USER
// Fetches every doc from users/{uid}/meds, rebuilds the form,
// generates the schedule, then restores today's checks —
// all from the same collection.
// ═══════════════════════════════════════════════════════════════
async function reloadMedsForUser () {
  document.getElementById('medRows').innerHTML = '';
  rowId = 0;

  // Fetch all med docs from Firestore
  firestoreMeds = await fetchMedsFromFirestore();

  if (firestoreMeds === null) {
    // Firestore failed — fall back to localStorage cache (no checks restored)
    console.warn('Firestore fetch failed, using localStorage fallback.');
    const cached = loadMeds();
    firestoreMeds = cached.map(m => ({ ...m, medId: medIdFromName(m.name), checks: {} }));
  }

  if (firestoreMeds.length) {
    // Sync plain med data back to localStorage as a cache
    saveMedsLocalOnly(firestoreMeds.map(stripChecks));
    firestoreMeds.forEach(m => addMedRow(m));
    generate({ silent: true }); // → renderChecklist → stampBlockOffsets → loadChecks
  } else {
    addMedRow(); addMedRow(); addMedRow();
  }
}

// ═════════════════════════════════════════════════════════════
// USER MENU
// ═══════════════════════════════════════════════════════════════
window.toggleUserMenu = function () {
  document.getElementById('userMenu').classList.toggle('open');
};
document.addEventListener('click', e => {
  const chip = document.getElementById('userChip');
  const menu = document.getElementById('userMenu');
  if (chip && menu && !chip.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('open');
  }
});

window.clearUserData = async function () {
  if (!confirm('Delete all your saved medications? This cannot be undone.')) return;

  // Remove from localStorage
  localStorage.removeItem(storageKey);

  // Delete every med doc from users/{uid}/meds
  const colRef = medsColRef();
  if (colRef) {
    try {
      const snap  = await getDocs(colRef);
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`Deleted ${snap.size} med docs from Firestore.`);
    } catch (e) {
      console.warn('Could not delete med docs:', e.message);
    }
  }

  firestoreMeds = [];

  // Reset UI
  document.getElementById('medRows').innerHTML = '';
  rowId = 0;
  addMedRow(); addMedRow(); addMedRow();
  generatedBlocks = [];
  ['checklist', 'scheduleBody'].forEach(id => {
    document.getElementById(id).innerHTML = '';
  });
  ['scheduleSection', 'mainControls', 'infoSection'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('userMenu').classList.remove('open');
  if (!panelOpen) togglePanel();
};

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE  (cache only — Firestore is source of truth)
// ═══════════════════════════════════════════════════════════════
function loadMeds () {
  try {
    const s = localStorage.getItem(storageKey);
    if (s) return JSON.parse(s);
  } catch (e) {}
  return [];
}

// Write plain med data (no checks) to localStorage as a quick cache
function saveMedsLocalOnly (meds) {
  localStorage.setItem(storageKey, JSON.stringify(meds));
}

// Remove the checks field — used when writing the localStorage cache
function stripChecks (m) {
  const { checks, medId, ...rest } = m;
  return rest;
}

// ═══════════════════════════════════════════════════════════════
// FIRESTORE — SAVE MEDS
// Writes each med as its own document: users/{uid}/meds/{medId}
// Preserves existing checks by merging — never overwrites them.
// Also removes docs for meds that were deleted from the form.
// ═══════════════════════════════════════════════════════════════
async function saveMedsToFirestore (meds) {
  const colRef = medsColRef();
  if (!colRef) return; // demo mode

  try {
    const batch       = writeBatch(db);
    const newIds      = new Set();

    meds.forEach(med => {
      const medId = medIdFromName(med.name);
      newIds.add(medId);

      // Find existing Firestore doc so we can preserve its checks
      const existing = firestoreMeds.find(f => f.medId === medId);
      const checks   = existing?.checks || {};

      batch.set(
        doc(db, 'users', currentUser.uid, 'meds', medId),
        {
          medId,
          name:      med.name,
          dose:      med.dose      || '',
          pills:     med.pills     || '',
          freq:      med.freq      || 'twice',
          foodNote:  med.foodNote  || '',
          prnReason: med.prnReason || '',
          prnWait:   med.prnWait   || '',
          checks,                        // ← preserved daily check history
          updatedAt: new Date().toISOString()
        }
      );
    });

    // Delete docs for meds that were removed from the form
    const snap = await getDocs(colRef);
    snap.forEach(d => {
      if (!newIds.has(d.id)) batch.delete(d.ref);
    });

    await batch.commit();

    // Keep in-memory cache in sync
    firestoreMeds = meds.map(med => {
      const medId    = medIdFromName(med.name);
      const existing = firestoreMeds.find(f => f.medId === medId);
      return { ...med, medId, checks: existing?.checks || {} };
    });

    console.log(`Meds saved to Firestore (${meds.length} docs).`);
  } catch (e) {
    console.warn('Could not save meds to Firestore:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// FIRESTORE — FETCH MEDS
// Returns array of med objects (including checks), or null on error.
// ═══════════════════════════════════════════════════════════════
async function fetchMedsFromFirestore () {
  const colRef = medsColRef();
  if (!colRef) return null;
  try {
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs.map(d => ({ ...d.data(), medId: d.id }));
  } catch (e) {
    console.warn('Could not fetch meds from Firestore:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// saveMeds — called by generate() and saveMedsOnly()
// Writes to localStorage immediately, syncs to Firestore async.
// ═══════════════════════════════════════════════════════════════
function saveMeds (meds) {
  saveMedsLocalOnly(meds);
  saveMedsToFirestore(meds); // fire-and-forget
}

window.saveMedsOnly = function () {
  const meds = readMeds();
  saveMeds(meds);
  showSaveConfirmation();
};

function showSaveConfirmation () {
  const el = document.getElementById('saveConfirmMsg');
  if (!el) return;
  el.classList.add('visible');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

// ═══════════════════════════════════════════════════════════════
// FIRESTORE DRUG DATABASE  (sessionStorage-cached)
// ═══════════════════════════════════════════════════════════════
async function loadDrugDB () {
  const banner = document.getElementById('dbLoadingBanner');
  try {
    const cachedVer  = sessionStorage.getItem(DB_CACHE_VER_KEY);
    const cachedData = sessionStorage.getItem(DB_CACHE_KEY);
    if (cachedVer === DB_SERVER_VER && cachedData) {
      drugDB      = JSON.parse(cachedData);
      drugDBReady = true;
      console.log('Drug DB loaded from cache:', Object.keys(drugDB).length, 'entries');
      populateDrugDatalist();
      if (generatedBlocks.length > 0) {
        const meds = loadMeds();
        if (meds.length) renderInfoCards(meds);
      }
      return;
    }
  } catch (e) {
    console.warn('Cache read error, falling back to Firestore:', e.message);
  }

  banner.classList.add('visible');
  try {
    const snap = await getDocs(collection(db, 'drugDatabase'));
    snap.forEach(docSnap => { drugDB[docSnap.id] = docSnap.data(); });
    drugDBReady = true;
    console.log(`Drug DB fetched from Firestore: ${snap.size} entries`);
    try {
      sessionStorage.setItem(DB_CACHE_KEY,     JSON.stringify(drugDB));
      sessionStorage.setItem(DB_CACHE_VER_KEY, DB_SERVER_VER);
    } catch (e) {
      console.warn('Could not cache drug DB:', e.message);
    }
    populateDrugDatalist();
    if (generatedBlocks.length > 0) {
      const meds = loadMeds();
      if (meds.length) renderInfoCards(meds);
    }
  } catch (e) {
    console.warn('Could not load drug DB:', e.message);
  } finally {
    banner.classList.remove('visible');
  }
}

// ═══════════════════════════════════════════════════════════════
// DRUG AUTOCOMPLETE DATALIST
// ═══════════════════════════════════════════════════════════════
function populateDrugDatalist () {
  let list = document.getElementById('drugNameList');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'drugNameList';
    document.body.appendChild(list);
  }
  const names = Object.keys(drugDB)
    .filter(k => !drugDB[k].alias)
    .map(k => k.charAt(0).toUpperCase() + k.slice(1))
    .sort();
  list.innerHTML = names.map(n => `<option value="${n}">`).join('');
}

// ═══════════════════════════════════════════════════════════════
// DRUG LOOKUP
// ═══════════════════════════════════════════════════════════════
function normalizeName (name) {
  return name.toLowerCase()
    .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?|%)/gi, '')
    .replace(/\s*(tablet|capsule|cap|tab|hcl|sodium|potassium|er|sr|xr|cr|dr|odt)\b/gi, '')
    .replace(/[^a-z]/g, '').trim();
}

function lookupDrug (name) {
  const key = normalizeName(name);
  if (!key) return null;
  if (drugDB[key]) {
    const e = drugDB[key];
    if (e.alias) return drugDB[e.alias] ? { ...drugDB[e.alias], resolvedName: e.alias } : null;
    return e;
  }
  for (const dbKey of Object.keys(drugDB)) {
    if (dbKey.startsWith(key) || key.startsWith(dbKey)) {
      const e = drugDB[dbKey];
      if (e.alias) return drugDB[e.alias] ? { ...drugDB[e.alias], resolvedName: e.alias } : null;
      return e;
    }
  }
  return null;
}

function findInteractions (medNames) {
  const result     = {};
  const normalized = medNames.map(n => ({ original: n, key: normalizeName(n) }));
  normalized.forEach(({ original, key }) => {
    const entry = lookupDrug(original);
    if (!entry?.interactions) return;
    const hits = [];
    normalized.forEach(other => {
      if (other.original === original) return;
      for (const iKey of Object.keys(entry.interactions)) {
        if (other.key.includes(iKey) || iKey.includes(other.key) ||
            other.key.startsWith(iKey) || iKey.startsWith(other.key)) {
          hits.push({ with: other.original, message: entry.interactions[iKey] });
          break;
        }
      }
    });
    if (hits.length) result[original] = hits;
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════
// RENDER INFO CARDS
// ═══════════════════════════════════════════════════════════════
const CARD_COLORS = [
  '#E1F5EE', '#FCEBEB', '#E6F1FB', '#FAEEDA', '#EAF3DE',
  '#F1EFE8', '#EEF2FF', '#FDF0F5', '#E8F4FD', '#FFF8E1'
];

function renderInfoCards (meds) {
  const grid  = document.getElementById('infoGrid');
  const badge = document.getElementById('infoBadge');
  document.getElementById('infoSection').style.display = '';
  badge.textContent = drugDBReady ? '📋 Firestore Drug Database' : '⚠ Database unavailable';

  if (!drugDBReady) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--gray-mid);font-size:0.85rem;padding:1rem 0;">
      Could not load the drug database. Check your Firestore connection.
    </div>`;
    return;
  }

  grid.innerHTML = meds.map((med, i) => `
    <div class="info-card skeleton">
      <div class="info-card-head">
        <div class="info-icon" style="background:${CARD_COLORS[i % CARD_COLORS.length]};">💊</div>
        <div style="flex:1;">
          <div class="info-card-name">${esc(med.name)}</div>
          <div class="info-card-sub">&nbsp;</div>
        </div>
      </div>
      <div class="info-card-desc">&nbsp;</div>
    </div>`).join('');

  setTimeout(() => {
    const interactions = findInteractions(meds.map(m => m.name));
    grid.innerHTML = meds.map((med, i) => {
      const info  = lookupDrug(med.name);
      const iacts = interactions[med.name] || [];
      const purposeHtml = info
        ? `<div class="info-card-desc">${esc(info.purpose)}</div>`
        : `<div class="info-card-desc" style="color:var(--gray-light);font-style:italic;">Not found in drug database.</div>`;
      const warnHtml = info?.warn
        ? `<div class="warn-flag">⚠ ${esc(info.warn)}</div>` : '';
      const iactHtml = iacts.map(ix =>
        `<div class="interaction-flag">🔴 <strong>Interacts with ${esc(ix.with)}:</strong> ${esc(ix.message)}</div>`
      ).join('');
      return `
        <div class="info-card">
          <div class="info-card-head">
            <div class="info-icon" style="background:${CARD_COLORS[i % CARD_COLORS.length]};">💊</div>
            <div>
              <div class="info-card-name">${esc(med.name)}</div>
              <div class="info-card-sub">${esc(med.dose || '')}${med.pills ? ' · ' + esc(med.pills) : ''}</div>
            </div>
          </div>
          ${purposeHtml}${warnHtml}${iactHtml}
        </div>`;
    }).join('');
  }, 300);
}

// ═══════════════════════════════════════════════════════════════
// FREQUENCY OPTIONS
// ═══════════════════════════════════════════════════════════════
const FREQ_OPTIONS = [
  { value: 'once',    label: 'Once daily',        times: 1, intervalMins: 1440 },
  { value: 'twice',   label: 'Twice daily',       times: 2, intervalMins: 720  },
  { value: '3x',      label: '3× daily',          times: 3, intervalMins: 480  },
  { value: '4x',      label: '4× daily',          times: 4, intervalMins: 360  },
  { value: '6x',      label: 'Every 4 hours',     times: 6, intervalMins: 240  },
  { value: '8x',      label: 'Every 3 hours',     times: 8, intervalMins: 180  },
  { value: 'q4prn',   label: 'Every 4 hrs (PRN)', times: 6, intervalMins: 240, prn: true },
  { value: 'q6prn',   label: 'Every 6 hrs (PRN)', times: 4, intervalMins: 360, prn: true },
  { value: 'q8prn',   label: 'Every 8 hrs (PRN)', times: 3, intervalMins: 480, prn: true },
  { value: 'prn',     label: 'As Needed (PRN)',   times: 1, intervalMins: 0,   prn: true },
  { value: 'bedtime', label: 'At Bedtime',        times: 1, intervalMins: 0,   bedtime: true },
  { value: 'wakebed', label: 'Wake + Bedtime',    times: 2, intervalMins: 0,   wakebed: true },
];

// ═══════════════════════════════════════════════════════════════
// MED FORM
// ═══════════════════════════════════════════════════════════════
function freqOptionsHTML (selected) {
  return FREQ_OPTIONS.map(f =>
    `<option value="${f.value}" ${selected === f.value ? 'selected' : ''}>${f.label}</option>`
  ).join('');
}

window.addMedRow = function (data = {}) {
  rowId++;
  const id    = rowId;
  const isPrn = data.freq && FREQ_OPTIONS.find(f => f.value === data.freq)?.prn;
  const wrapper = document.createElement('div');
  wrapper.className  = 'med-entry';
  wrapper.dataset.id = id;
  wrapper.innerHTML  = `
    <div class="med-form-row">
      <input class="span-full" type="text" placeholder="e.g. Ibuprofen"
        value="${esc(data.name  || '')}" data-field="name"
        list="drugNameList" autocomplete="off"
        oninput="onMedNameInput()">
      <input type="text" placeholder="e.g. 200 mg"
        value="${esc(data.dose  || '')}" data-field="dose">
      <input type="text" placeholder="e.g. 2 tablets"
        value="${esc(data.pills || '')}" data-field="pills">
      <select data-field="freq" onchange="onFreqChange(${id})">
        ${freqOptionsHTML(data.freq || 'twice')}
      </select>
      <select data-field="foodNote">
        <option value=""              ${!data.foodNote                    ? 'selected' : ''}>No food note</option>
        <option value="With food"     ${data.foodNote === 'With food'     ? 'selected' : ''}>With food</option>
        <option value="Empty stomach" ${data.foodNote === 'Empty stomach' ? 'selected' : ''}>Empty stomach</option>
        <option value="With water"    ${data.foodNote === 'With water'    ? 'selected' : ''}>With water</option>
      </select>
      <button class="btn-del-med" onclick="delMedRow(${id})" title="Remove">✕</button>
    </div>
    <div class="prn-subrow ${isPrn ? 'visible' : ''}" id="prnSub-${id}">
      <span>⚠ As-Needed — take only when:</span>
      <input type="text" placeholder="e.g. pain, nausea…"
        style="flex:1;min-width:180px;"
        value="${esc(data.prnReason || '')}" data-field="prnReason">
      <span>Wait between doses:</span>
      <input type="number" min="1" max="24" placeholder="hrs" style="width:58px;"
        value="${data.prnWait || ''}" data-field="prnWait">
      <span>hrs</span>
    </div>`;
  document.getElementById('medRows').appendChild(wrapper);
};

window.onMedNameInput = function () {
  if (isDemo && !saveBannerDismissed) {
    if (readMeds().length > 0) showSaveBanner();
  }
};

window.delMedRow = function (id) {
  const el = document.querySelector(`.med-entry[data-id="${id}"]`);
  if (el) el.remove();
};

window.onFreqChange = function (id) {
  const wrapper = document.querySelector(`.med-entry[data-id="${id}"]`);
  if (!wrapper) return;
  const sel  = wrapper.querySelector('[data-field="freq"]');
  const sub  = wrapper.querySelector(`#prnSub-${id}`);
  const freq = FREQ_OPTIONS.find(f => f.value === sel.value);
  if (sub) sub.classList.toggle('visible', !!(freq?.prn));
};

function readMeds () {
  const meds = [];
  document.querySelectorAll('.med-entry').forEach(wrapper => {
    const g = f => {
      const el = wrapper.querySelector(`[data-field="${f}"]`);
      return el ? el.value.trim() : '';
    };
    const name = g('name');
    if (!name) return;
    meds.push({
      name,
      dose:      g('dose'),
      pills:     g('pills'),
      freq:      g('freq'),
      foodNote:  g('foodNote'),
      prnReason: g('prnReason'),
      prnWait:   g('prnWait')
    });
  });
  return meds;
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE BUILDER
// ═══════════════════════════════════════════════════════════════
function buildBlocks (meds) {
  const blockMap = {};

  function getBlock (offsetMins, phaseHint) {
    const key = String(offsetMins);
    if (!blockMap[key]) {
      const hrs = offsetMins / 60;
      let label;
      if (offsetMins === 0) label = 'Wake-up — Morning';
      else if (hrs < 6)     label = `+${hrs < 1 ? Math.round(offsetMins) + 'min' : Math.round(hrs) + 'h'} after wake`;
      else if (hrs < 10)    label = `Midday (+${Math.round(hrs)} hrs)`;
      else if (hrs < 14)    label = `Evening (+${Math.round(hrs)} hrs)`;
      else if (hrs < 16)    label = `Bedtime (+${Math.round(hrs)} hrs)`;
      else                  label = `Overnight (+${Math.round(hrs)} hrs)`;
      blockMap[key] = {
        offsetMins,
        label,
        phase: phaseHint || (offsetMins >= 840 ? 'sleep' : 'day'),
        meds:  []
      };
    }
    return blockMap[key];
  }

  meds.forEach(med => {
    const freqDef     = FREQ_OPTIONS.find(f => f.value === med.freq) || FREQ_OPTIONS[1];
    const tag         = freqDef.prn ? 'prn' : 'rx';
    const noteParts   = [];
    if (med.foodNote) noteParts.push(med.foodNote);
    if (tag === 'prn') {
      if (med.prnReason) noteParts.push(`Only if: ${med.prnReason}`);
      if (med.prnWait)   noteParts.push(`Wait ${med.prnWait}h between doses`);
    }
    const note        = noteParts.join(' · ');
    const displayDose = [med.pills, med.dose].filter(Boolean).join(' — ');

    if (freqDef.value === 'bedtime') {
      getBlock(840, 'sleep').meds.push({ name: med.name, dose: displayDose, note, tag });
      return;
    }
    if (freqDef.value === 'wakebed') {
      getBlock(0,   'day').meds.push({ name: med.name, dose: displayDose, note, tag });
      getBlock(840, 'sleep').meds.push({ name: med.name, dose: displayDose, note, tag });
      return;
    }
    if (freqDef.value === 'prn') {
      getBlock(0, 'day').meds.push({ name: med.name, dose: displayDose, note: note || 'Take only as needed', tag });
      return;
    }
    for (let i = 0; i < freqDef.times; i++) {
      const offset = i * freqDef.intervalMins;
      getBlock(offset, offset >= 840 ? 'sleep' : 'day').meds.push({
        name: med.name, dose: displayDose, note, tag
      });
    }
  });

  const blocks = Object.values(blockMap)
    .filter(b => b.meds.length > 0)
    .sort((a, b) => a.offsetMins - b.offsetMins);
  blocks.forEach(b => { b.allPrn = b.meds.every(m => m.tag === 'prn'); });
  return blocks;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function parseWake (v) {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + (m || 0);
}
function fmtTime (t) {
  const n   = ((t % 1440) + 1440) % 1440;
  const h24 = Math.floor(n / 60), m = n % 60;
  const ap  = h24 < 12 ? 'AM' : 'PM', h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
function isNext (W, o) { return (W + o) >= 1440; }
function ckSVG () {
  return `<svg width="11" height="8" viewBox="0 0 11 8">
    <polyline points="1,4 4,7 10,1" stroke="white" stroke-width="1.8"
      fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function esc (s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════
// GENERATE
// ═══════════════════════════════════════════════════════════════
window.generate = function (opts = {}) {
  const meds = readMeds();

  if (!meds.length && !opts.silent) {
    saveMeds([]);
    alert('Please add at least one medication to generate a schedule.');
    return;
  }

  saveMeds(meds);

  if (!meds.length) return;

  const W = parseWake(document.getElementById('wakeInput').value || '09:00');
  generatedBlocks = buildBlocks(meds);

  renderChecklist(W);
  stampBlockOffsets();
  renderTable(W);
  updateBanners(W, meds);
  updateProgress();
  renderInfoCards(meds);
  loadChecks(); // restores today's dose_N checks from each med's Firestore doc

  document.getElementById('scheduleSection').style.display = '';
  document.getElementById('mainControls').style.display    = 'flex';

  const last = generatedBlocks.length
    ? generatedBlocks[generatedBlocks.length - 1].offsetMins : 0;
  document.getElementById('wakeSummary').textContent =
    `Schedule active · ${generatedBlocks.length} time blocks · ${meds.length} medication${meds.length !== 1 ? 's' : ''}`;
  document.getElementById('wakeSub').textContent =
    `First dose ${fmtTime(W)} · Last dose window ${fmtTime(W + last)}`;

  if (panelOpen) {
    panelOpen = false;
    document.getElementById('setupBody').style.display   = 'none';
    document.getElementById('setupFooter').style.display = 'none';
    document.getElementById('collapseBtn').textContent   = '▼ Edit Medications';
  }

  setPrn(prnVisible);
  if (isDemo && !saveBannerDismissed) showSaveBanner();
};

// ═══════════════════════════════════════════════════════════════
// RENDER CHECKLIST
// ═══════════════════════════════════════════════════════════════
function renderChecklist (W) {
  const cl = document.getElementById('checklist');
  cl.innerHTML = '';
  let slept = false;

  generatedBlocks.forEach(b => {
    const ts = fmtTime(W + b.offsetMins);
    const nd = isNext(W, b.offsetMins);

    if (b.phase === 'sleep' && !slept) {
      slept = true;
      const d = document.createElement('div');
      d.className = 'sleep-divider';
      d.innerHTML = `<div class="sleep-divider-line"></div>
        <div class="sleep-divider-pill">🌙 Sleep Period — Overnight Doses</div>
        <div class="sleep-divider-line"></div>`;
      cl.appendChild(d);
    }

    let bc = 'time-badge';
    if (b.phase === 'sleep' && !nd) bc += ' night';
    if (nd) bc = 'time-badge next-day';
    const ndL = nd ? ` <span style="font-size:0.68rem;opacity:0.82;">(next day)</span>` : '';

    const rows = b.meds.map(m => `
      <div class="med-row${m.tag === 'prn' ? ' is-prn' : ''}" onclick="toggle(this)">
        <div class="checkbox">${ckSVG()}</div>
        <div class="med-info">
          <div class="med-name">${esc(m.name)}</div>
          <div class="med-dose">${esc(m.dose)}${m.note ? ' — ' + esc(m.note) : ''}</div>
        </div>
        <span class="med-tag tag-${m.tag}">${m.tag === 'prn' ? 'As Needed' : 'Scheduled'}</span>
      </div>`).join('');

    const wrap = document.createElement('div');
    wrap.className = 'time-block' + (b.allPrn ? ' all-prn' : '');
    wrap.innerHTML = `
      <div class="time-header">
        <span class="${bc}">${ts} — ${esc(b.label)}${ndL}</span>
        <div class="time-line"></div>
      </div>${rows}`;
    cl.appendChild(wrap);
  });
}

// ═══════════════════════════════════════════════════════════════
// RENDER TABLE
// ═══════════════════════════════════════════════════════════════
function renderTable (W) {
  const tb = document.getElementById('scheduleBody');
  tb.innerHTML = '';
  let slept = false;

  generatedBlocks.forEach(b => {
    const ts = fmtTime(W + b.offsetMins);
    const nd = isNext(W, b.offsetMins);

    if (b.phase === 'sleep' && !slept) {
      slept = true;
      const s = document.createElement('tr');
      s.className = 'table-sleep-row';
      s.innerHTML = `<td colspan="5">🌙 Sleep Period — Overnight Doses</td>`;
      tb.appendChild(s);
    }

    const tc  = nd ? 'td-time next-day' : (b.phase === 'sleep' ? 'td-time night' : 'td-time');
    const ndT = nd ? ` <span style="font-size:0.7em;color:#8b7ecc;">(+1)</span>` : '';

    b.meds.forEach(m => {
      const tr = document.createElement('tr');
      if (m.tag === 'prn') tr.classList.add('tr-prn');
      tr.innerHTML = `
        <td class="${tc}">${ts}${ndT}</td>
        <td>${esc(m.name)}</td>
        <td>${esc(m.dose)}</td>
        <td class="${m.tag === 'prn' ? 'td-prn' : 'td-rx'}">${m.tag === 'prn' ? 'As Needed ⚡' : 'Scheduled'}</td>
        <td class="td-note">${esc(m.note)}</td>`;
      tb.appendChild(tr);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// BANNERS
// ═══════════════════════════════════════════════════════════════
function updateBanners (W, meds) {
  const mb       = document.getElementById('midnightBanner');
  const crossing = generatedBlocks.filter(b => isNext(W, b.offsetMins));
  if (crossing.length) {
    const times = [...new Set(crossing.map(b => fmtTime(W + b.offsetMins)))].join(', ');
    mb.innerHTML = `🌙 Some overnight doses fall <strong>after midnight</strong> (${times}) — shown in
      <span style="color:#6b5fc7;font-weight:600;">purple</span>.`;
    mb.classList.add('visible');
  } else {
    mb.classList.remove('visible');
    mb.innerHTML = '';
  }

  const pb      = document.getElementById('prnBanner');
  const prnMeds = meds.filter(m => FREQ_OPTIONS.find(f => f.value === m.freq)?.prn);
  if (prnMeds.length) {
    const names = [...new Set(prnMeds.map(m => m.name))].join(', ');
    pb.innerHTML = `⚠ <strong>As-Needed:</strong> ${esc(names)}. Take only when needed.`;
    pb.classList.add('visible');
  } else {
    pb.classList.remove('visible');
    pb.innerHTML = '';
  }
}

// ═══════════════════════════════════════════════════════════════
// PRN / PROGRESS
// ═══════════════════════════════════════════════════════════════
window.togglePrn = function () { prnVisible = !prnVisible; setPrn(prnVisible); };

function setPrn (show) {
  prnVisible = show;
  document.getElementById('checklist').classList.toggle('prn-hidden', !show);
  document.getElementById('scheduleTableWrap').classList.toggle('prn-hidden', !show);
  const btn = document.getElementById('prnToggleBtn');
  if (btn) {
    btn.textContent       = show ? '🚫 Hide As-Needed' : '👁 Show As-Needed';
    btn.style.borderColor = show ? 'var(--amber)'       : 'var(--green-bright)';
    btn.style.color       = show ? 'var(--amber)'       : 'var(--green-mid)';
  }
  updateProgress();
}

function updateProgress () {
  const all  = [...document.querySelectorAll('.med-row')];
  const vis  = all.filter(r => r.offsetParent !== null);
  const done = vis.filter(r => r.classList.contains('taken'));
  const pct  = vis.length ? Math.round(done.length / vis.length * 100) : 0;
  document.getElementById('progressFill').style.width  = pct + '%';
  document.getElementById('progressLabel').textContent = `${done.length} / ${vis.length} doses taken`;
}

window.toggle = function (row) { row.classList.toggle('taken'); updateProgress(); saveChecks(); };

window.resetChecks = function () {
  if (!confirm('Clear all checkmarks?')) return;
  document.querySelectorAll('.med-row.taken').forEach(r => r.classList.remove('taken'));
  document.getElementById('datePicker').valueAsDate = new Date();
  updateProgress();
  saveChecks();
};

window.checkAll = function () {
  [...document.querySelectorAll('.med-row')]
    .filter(r => r.offsetParent !== null)
    .forEach(r => r.classList.add('taken'));
  updateProgress();
  saveChecks();
};

// ═══════════════════════════════════════════════════════════════
// PANEL COLLAPSE
// ═══════════════════════════════════════════════════════════════
window.togglePanel = function () {
  panelOpen = !panelOpen;
  document.getElementById('setupBody').style.display   = panelOpen ? '' : 'none';
  document.getElementById('setupFooter').style.display = panelOpen ? '' : 'none';
  document.getElementById('collapseBtn').textContent   = panelOpen ? '▲ Collapse' : '▼ Edit Medications';
};

// ═══════════════════════════════════════════════════════════════
// WAKE TIME CHANGE
// ═══════════════════════════════════════════════════════════════
function setupWakeListener () {
  document.getElementById('wakeInput').addEventListener('change', () => {
    if (generatedBlocks.length) {
      const W = parseWake(document.getElementById('wakeInput').value);
      renderChecklist(W);
      renderTable(W);
      updateBanners(W, loadMeds());
      updateProgress();
      setPrn(prnVisible);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// DEMO MODE INIT
// ═══════════════════════════════════════════════════════════════
function initDemoMeds () {
  const saved = loadMeds();
  if (saved.length) {
    saved.forEach(m => addMedRow(m));
    setTimeout(generate, 80);
  } else {
    addMedRow(); addMedRow(); addMedRow();
  }
}

// ═══════════════════════════════════════════════════════════════
// CHECKS PERSISTENCE
//
// Stored inside each med's own Firestore document:
//   users/{uid}/meds/{medId}
//     checks: {
//       "2026-04-27": {
//         dose_0: true,
//         dose_1: true
//       }
//     }
//
// dose_0 = first dose of that med today
// dose_1 = second dose, etc.
//
// The DOM row's check key is built from:
//   medName + its occurrence index across ALL rows today
//   e.g. Ibuprofen appears in dose block 0 and dose block 2
//        → dose_0, dose_1
// ═══════════════════════════════════════════════════════════════

// Stamp data-offset onto every .time-block after renderChecklist
function stampBlockOffsets () {
  const timeBlocks = document.querySelectorAll('.time-block');
  generatedBlocks.forEach((b, i) => {
    if (timeBlocks[i]) timeBlocks[i].dataset.offset = b.offsetMins;
  });
}

// Build a map of  medName → [rowEl, rowEl, ...]  (in DOM order)
// so we can assign dose_0, dose_1, … per med
function buildDoseIndexMap () {
  const map = {};
  document.querySelectorAll('.med-row').forEach(row => {
    const name = row.querySelector('.med-name')?.textContent?.trim() || '';
    if (!map[name]) map[name] = [];
    map[name].push(row);
  });
  return map;
}

// Save today's checks back into each med's Firestore doc
async function saveChecks () {
  if (!currentUser) return; // demo mode — skip

  const today      = todayDateStr();
  const doseMap    = buildDoseIndexMap();
  const batch      = writeBatch(db);
  let   batchDirty = false;

  for (const [medName, rows] of Object.entries(doseMap)) {
    const medId = medIdFromName(medName);
    const ref   = medDocRef(medId);
    if (!ref) continue;

    // Build { dose_0: true/false, dose_1: true/false, … }
    const todayChecks = {};
    rows.forEach((row, idx) => {
      todayChecks[`dose_${idx}`] = row.classList.contains('taken');
    });

    // Merge only the today key so other dates are never touched
    batch.set(ref, { checks: { [today]: todayChecks } }, { merge: true });
    batchDirty = true;

    // Keep in-memory firestoreMeds cache in sync
    const cached = firestoreMeds.find(f => f.medId === medId);
    if (cached) {
      if (!cached.checks) cached.checks = {};
      cached.checks[today] = todayChecks;
    }
  }

  if (!batchDirty) return;
  try {
    await batch.commit();
  } catch (e) {
    console.warn('Could not save checks:', e.message);
  }
}

// Restore today's checks from firestoreMeds into the DOM
async function loadChecks () {
  if (!currentUser) return; // demo mode — skip

  // If firestoreMeds is empty (e.g. called from generate before fetch),
  // do a fresh fetch so we always have the latest check state
  if (!firestoreMeds.length) {
    const fresh = await fetchMedsFromFirestore();
    if (fresh) firestoreMeds = fresh;
  }

  const today   = todayDateStr();
  const doseMap = buildDoseIndexMap();

  for (const [medName, rows] of Object.entries(doseMap)) {
    const medId      = medIdFromName(medName);
    const medData    = firestoreMeds.find(f => f.medId === medId);
    const todayData  = medData?.checks?.[today];
    if (!todayData) continue;

    rows.forEach((row, idx) => {
      if (todayData[`dose_${idx}`] === true) {
        row.classList.add('taken');
      }
    });
  }

  updateProgress();
}

// ═══════════════════════════════════════════════════════════════
// FRIENDLY FIREBASE ERROR MESSAGES
// ═══════════════════════════════════════════════════════════════
function friendlyError (code) {
  const map = {
    'auth/invalid-email':           'Invalid email address.',
    'auth/user-not-found':          'No account found with that email.',
    'auth/wrong-password':          'Incorrect password.',
    'auth/invalid-credential':      'Incorrect email or password.',
    'auth/email-already-in-use':    'An account with that email already exists.',
    'auth/weak-password':           'Password must be at least 6 characters.',
    'auth/too-many-requests':       'Too many attempts. Please try again later.',
    'auth/network-request-failed':  'Network error. Check your connection.',
    'auth/popup-blocked':           'Popup was blocked. Please allow popups.',
    'auth/configuration-not-found': 'Firebase not configured — check your config.',
  };
  return map[code] || `Authentication error (${code}).`;
}

// ═══════════════════════════════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════════════════════════════
(function initTheme () {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
})();

function applyTheme (theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeToggle')?.querySelector('.theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
}

window.toggleTheme = function () {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
};

// ═══════════════════════════════════════════════════════════════
// INIT — runs on page load
// ═══════════════════════════════════════════════════════════════
document.getElementById('datePicker').valueAsDate = new Date();
loadDrugDB();
initDemoMeds();
setupWakeListener();