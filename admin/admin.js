/* ============================================================
   JOYBRINGERS ADMIN PANEL — admin.js
   All GitHub operations go through /api/admin (serverless).
   Volunteers only need email + password — no GitHub token.
   ============================================================ */

const API = '/api/admin';

/* ── session ─────────────────────────────────────────────── */

function getSession()    { return localStorage.getItem('jb_session') || ''; }
function getRole()       { return localStorage.getItem('jb_role') || 'admin'; }
function isAdmin()       { return getRole() === 'admin'; }
function clearSession()  {
  localStorage.removeItem('jb_session');
  localStorage.removeItem('jb_email');
  localStorage.removeItem('jb_role');
}
function isLoggedIn()    { return !!getSession(); }

function logout() {
  clearSession();
  location.reload();
}

/* ── API helper ──────────────────────────────────────────── */

async function apiCall(action, data = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getSession()}`
    },
    body: JSON.stringify({ action, ...data })
  });

  const json = await res.json().catch(() => ({ error: `Server error (${res.status})` }));

  if (res.status === 401) {
    clearSession();
    showAlert('warning', 'Your session expired. Please log in again.');
    setTimeout(() => location.reload(), 2000);
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

async function apiReadJSON(path) {
  const raw  = await apiCall('read', { path });
  const text = decodeURIComponent(escape(atob(raw.content.replace(/\n/g, ''))));
  return { data: JSON.parse(text), sha: raw.sha };
}

async function apiWriteJSON(path, content, sha, message) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
  return apiCall('write', { path, content: encoded, sha, message });
}

async function apiUploadImage(file, targetPath) {
  if (file.size > 3 * 1024 * 1024) throw new Error('Image is too large (max 3 MB). Please resize it first.');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload  = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        // check if file already exists to get its sha
        let sha = null;
        try { sha = (await apiCall('read', { path: targetPath })).sha; } catch (_) { /* new file */ }
        await apiCall('write', { path: targetPath, content: base64, sha, message: `Admin: upload ${targetPath}` });
        resolve(targetPath);
      } catch (err) { reject(err); }
    };
    reader.readAsDataURL(file);
  });
}

/* ── UI helpers ──────────────────────────────────────────── */

function showLoading(msg = 'Saving...') {
  document.getElementById('loading-message').textContent = msg;
  document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function showAlert(type, message) {
  const c   = document.getElementById('alert-container');
  const div = document.createElement('div');
  div.className = `alert alert-${type} alert-dismissible fade show shadow-sm mb-0`;
  div.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  c.appendChild(div);
  setTimeout(() => div.classList.remove('show'), 5500);
  setTimeout(() => div.remove(), 6100);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}

function togglePasswordVisibility() {
  const input = document.getElementById('login-password');
  const icon  = document.getElementById('pw-eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).style.display = 'block';
  const link = document.querySelector(`[data-tab="${tabId}"]`);
  if (link) link.classList.add('active');
  const titles = { events: 'Events', roles: 'Volunteer Roles', photos: 'Photos & Gallery', content: 'Website Content', dataentry: 'Data Entry', visitors: 'Visitor Log', attendance: 'Event Attendance', 'venue-hire': 'Venue Hire Bookings', 'vol-expenses': 'Volunteer Expenses', exports: 'Export Data', settings: 'Settings' };
  document.getElementById('page-title').textContent = titles[tabId] || tabId;
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');

  if (tabId === 'events')      loadEvents();
  if (tabId === 'roles')       loadRoles();
  if (tabId === 'photos')      { renderGallery('events'); renderGallery('partners'); }
  if (tabId === 'content')     loadContentTab();
  if (tabId === 'dataentry')   loadDataEntryTab();
  if (tabId === 'visitors')    initVisitorTab();
  if (tabId === 'attendance')  loadAttendanceTab();
  if (tabId === 'venue-hire')   loadVenueHire();
  if (tabId === 'vol-expenses') loadVolExpenses();
  if (tabId === 'exports')      loadExportTab();
  if (tabId === 'settings')    loadUsers();
}

/* ── Role-based UI restriction ───────────────────────────── */

function applyRoleUI() {
  const role = getRole();
  document.querySelectorAll('.sidebar-link[data-roles]').forEach(el => {
    const allowed = el.dataset.roles.split(',');
    el.style.display = allowed.includes(role) ? '' : 'none';
  });
}

/* ── SHA-256 (for password hashing in browser) ───────────── */

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── INIT ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  // If a session is stored, verify it quickly with the server
  if (isLoggedIn()) {
    apiCall('list', { path: 'data' })
      .then(() => { showAdminPanel(); switchTab(getRole() === 'data_entry' ? 'dataentry' : 'events'); })
      .catch(() => { clearSession(); showLoginScreen(); });
    return;
  }
  showLoginScreen();
});

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-panel').style.display  = 'none';
}

function showAdminPanel() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-panel').style.display  = 'flex';
  const email = localStorage.getItem('jb_email') || '';
  document.getElementById('logged-in-email').textContent = email;
  applyRoleUI();
}

/* ── LOGIN ───────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorBox = document.getElementById('login-error');
    errorBox.style.display = 'none';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const result = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const data = await result.json().catch(() => ({ error: `Server error (${result.status})` }));
      if (!result.ok) throw new Error(data.error || `Login failed (${result.status})`);

      localStorage.setItem('jb_session', data.token);
      localStorage.setItem('jb_email',   email);
      localStorage.setItem('jb_role',    data.role || 'admin');
      showAdminPanel();
      switchTab(data.role === 'data_entry' ? 'dataentry' : 'events');
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Request timed out — check your connection.' : err.message;
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
      window.alert('Login error: ' + msg);
    }
  });
});

/* ============================================================
   EVENTS
   ============================================================ */

let eventsData = { items: [], sha: null };

async function loadEvents() {
  document.getElementById('events-list').innerHTML = '<p class="text-muted">Loading events...</p>';
  try {
    const { data, sha } = await apiReadJSON('data/events.json');
    eventsData = { items: data.items || [], sha };
    renderEventsList();
    updateStats();
  } catch (err) {
    document.getElementById('events-list').innerHTML =
      `<div class="alert alert-danger">Could not load events: ${err.message}</div>`;
  }
}

function todayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function updateStats() {
  const today    = todayMidnight();
  const upcoming = eventsData.items.filter(e => new Date(e.date + 'T00:00:00') >= today).length;
  document.getElementById('stat-upcoming').textContent = upcoming;
  document.getElementById('stat-past').textContent     = eventsData.items.length - upcoming;
  document.getElementById('stat-featured').textContent = eventsData.items.filter(e => e.featured).length;
  document.getElementById('stat-paid').textContent     = eventsData.items.filter(e => e.paidEvent).length;
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderEventsList(filter = '') {
  const container = document.getElementById('events-list');
  const today     = todayMidnight();
  const lc        = filter.toLowerCase();

  const items = eventsData.items
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => !lc || e.title.toLowerCase().includes(lc) || (e.venue || '').toLowerCase().includes(lc));

  if (!items.length) {
    container.innerHTML = filter
      ? '<p class="text-muted">No events match your search.</p>'
      : '<p class="text-muted">No events yet. Click <strong>Add New Event</strong> to get started.</p>';
    return;
  }

  items.sort(({ e: a }, { e: b }) => {
    const da = new Date(a.date + 'T00:00:00'), db = new Date(b.date + 'T00:00:00');
    const aUp = da >= today, bUp = db >= today;
    if (aUp !== bUp) return aUp ? -1 : 1;
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return da - db;
  });

  const raw = 'https://raw.githubusercontent.com/Beau34-max/joybringerswebsitesep/main/';

  container.innerHTML = items.map(({ e, idx }) => {
    const isUp = new Date(e.date + 'T00:00:00') >= today;
    const statusBadge   = isUp
      ? '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle">Upcoming</span>'
      : '<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">Past</span>';
    const featuredBadge = e.featured  ? ' <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle"><i class="fas fa-star fa-xs"></i> Featured</span>' : '';
    const paidBadge     = e.paidEvent ? ' <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle"><i class="fas fa-ticket fa-xs"></i> Paid</span>' : '';
    const imgSrc = e.image ? (e.image.startsWith('http') ? e.image : raw + e.image.replace(/^\//, '')) : '';

    return `
      <div class="event-row">
        <img class="event-row-thumb" src="${imgSrc}"
             onerror="this.style.background='#e5e7eb';this.removeAttribute('src')" alt="">
        <div class="event-row-info">
          <strong>${e.title}</strong>
          <small class="text-muted d-block">${fmtDate(e.date)}${e.time ? ' &bull; ' + e.time : ''} &bull; ${e.venue || '—'}</small>
          <div class="mt-1">${statusBadge}${featuredBadge}${paidBadge}</div>
        </div>
        <div class="event-row-actions">
          <button class="btn btn-sm btn-outline-primary" onclick="openEditModal(${idx})">
            <i class="fas fa-pen"></i> Edit
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="duplicateEvent(${idx})" title="Duplicate this event">
            <i class="fas fa-copy"></i>
          </button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${idx})"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function filterEvents() {
  renderEventsList(document.getElementById('event-search').value);
}

/* ── Event modal ─────────────────────────────────────────── */

function openNewEventModal() {
  document.getElementById('event-modal-title').textContent = 'Add New Event';
  document.getElementById('event-form').reset();
  document.getElementById('event-idx').value = '';
  document.getElementById('event-current-image').value = '';
  document.getElementById('event-image-preview-wrap').style.display = 'none';
  new bootstrap.Modal(document.getElementById('eventModal')).show();
}

function openEditModal(idx) {
  const e = eventsData.items[idx];
  document.getElementById('event-modal-title').textContent   = 'Edit Event';
  document.getElementById('event-idx').value                 = idx;
  document.getElementById('event-title').value               = e.title        || '';
  document.getElementById('event-date').value                = e.date         || '';
  document.getElementById('event-time').value                = e.time         || '';
  document.getElementById('event-venue').value               = e.venue        || '';
  document.getElementById('event-joining-link').value        = e.joiningLink        || '';
  document.getElementById('event-description').value         = e.description         || '';
  document.getElementById('event-featured').checked          = !!e.featured;
  document.getElementById('event-paid').checked              = !!e.paidEvent;
  document.getElementById('event-reg-override').checked      = !!e.regOverrideOpen;
  document.getElementById('event-current-image').value       = e.image               || '';
  document.getElementById('event-image').value               = '';
  document.getElementById('event-programme-type').value      = e.programmeType       || 'general';
  document.getElementById('event-requires-knowledge').checked = !!e.requiresKnowledgeLevel;
  document.getElementById('event-pre-event-info').value      = e.preEventInfo        || '';
  toggleKnowledgeOption(e.programmeType || 'general');

  const wrap = document.getElementById('event-image-preview-wrap');
  const img  = document.getElementById('event-image-preview');
  if (e.image) {
    const raw = 'https://raw.githubusercontent.com/Beau34-max/joybringerswebsitesep/main/';
    img.src = e.image.startsWith('http') ? e.image : raw + e.image.replace(/^\//, '');
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
  new bootstrap.Modal(document.getElementById('eventModal')).show();
}

function duplicateEvent(idx) {
  const e = eventsData.items[idx];
  document.getElementById('event-modal-title').textContent    = 'Duplicate Event';
  document.getElementById('event-idx').value                  = '';
  document.getElementById('event-title').value                = e.title + ' (Copy)';
  document.getElementById('event-date').value                 = '';
  document.getElementById('event-time').value                 = e.time              || '';
  document.getElementById('event-venue').value                = e.venue             || '';
  document.getElementById('event-joining-link').value         = e.joiningLink       || '';
  document.getElementById('event-description').value          = e.description       || '';
  document.getElementById('event-featured').checked           = !!e.featured;
  document.getElementById('event-paid').checked               = !!e.paidEvent;
  document.getElementById('event-reg-override').checked       = !!e.regOverrideOpen;
  document.getElementById('event-current-image').value        = e.image             || '';
  document.getElementById('event-image').value                = '';
  document.getElementById('event-programme-type').value       = e.programmeType     || 'general';
  document.getElementById('event-requires-knowledge').checked = !!e.requiresKnowledgeLevel;
  document.getElementById('event-pre-event-info').value       = e.preEventInfo      || '';
  toggleKnowledgeOption(e.programmeType || 'general');

  const wrap = document.getElementById('event-image-preview-wrap');
  const img  = document.getElementById('event-image-preview');
  if (e.image) {
    const raw = 'https://raw.githubusercontent.com/Beau34-max/joybringerswebsitesep/main/';
    img.src = e.image.startsWith('http') ? e.image : raw + e.image.replace(/^\//, '');
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
  new bootstrap.Modal(document.getElementById('eventModal')).show();
}

function toggleKnowledgeOption(type) {
  const el = document.getElementById('event-knowledge-option');
  if (type === 'training' || type === 'workshop') {
    el.style.display = '';
  } else {
    el.style.display = 'none';
    document.getElementById('event-requires-knowledge').checked = false;
  }
}

function previewEventImage() {
  const file = document.getElementById('event-image').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('event-image-preview').src = e.target.result;
    document.getElementById('event-image-preview-wrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function saveEvent() {
  const idx       = document.getElementById('event-idx').value;
  const imageFile = document.getElementById('event-image').files[0];
  const title     = document.getElementById('event-title').value.trim();

  if (!title || !document.getElementById('event-date').value ||
      !document.getElementById('event-venue').value || !document.getElementById('event-description').value) {
    showAlert('warning', 'Please fill in all required fields (title, date, venue, description).');
    return;
  }

  showLoading(idx !== '' ? 'Updating event...' : 'Adding event...');

  try {
    let imagePath = document.getElementById('event-current-image').value;

    if (imageFile) {
      const ext    = imageFile.name.split('.').pop().toLowerCase();
      const slug   = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const target = `images/events/${slug}-${Date.now()}.${ext}`;
      showLoading('Uploading image...');
      await apiUploadImage(imageFile, target);
      imagePath = target;
    }

    const joiningLink   = document.getElementById('event-joining-link').value.trim();
    const programmeType = document.getElementById('event-programme-type').value || 'general';
    const preEventInfo  = document.getElementById('event-pre-event-info').value.trim();
    const eventObj = {
      title,
      date:                   document.getElementById('event-date').value,
      time:                   document.getElementById('event-time').value,
      venue:                  document.getElementById('event-venue').value,
      description:            document.getElementById('event-description').value,
      image:                  imagePath,
      featured:               document.getElementById('event-featured').checked,
      paidEvent:              document.getElementById('event-paid').checked,
      regOverrideOpen:        document.getElementById('event-reg-override').checked,
      programmeType,
      ...(joiningLink  && { joiningLink }),
      ...(document.getElementById('event-requires-knowledge').checked && { requiresKnowledgeLevel: true }),
      ...(preEventInfo && { preEventInfo }),
    };

    if (idx !== '') eventsData.items[parseInt(idx)] = eventObj;
    else            eventsData.items.push(eventObj);

    showLoading('Saving to website...');
    const result = await apiWriteJSON(
      'data/events.json',
      { items: eventsData.items },
      eventsData.sha,
      `Admin: ${idx !== '' ? 'update' : 'add'} event — ${title}`
    );
    eventsData.sha = result.content.sha;

    bootstrap.Modal.getInstance(document.getElementById('eventModal')).hide();
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Event saved! The website will update in ~1 minute.`);
    renderEventsList();
    updateStats();
  } catch (err) {
    hideLoading();
    showAlert('danger', `<i class="fas fa-times-circle"></i> ${err.message}`);
  }
}

async function deleteEvent(idx) {
  const e = eventsData.items[idx];
  if (!confirm(`Delete "${e.title}"?\n\nThis cannot be undone.`)) return;

  showLoading('Deleting event...');
  try {
    eventsData.items.splice(idx, 1);
    const result = await apiWriteJSON(
      'data/events.json',
      { items: eventsData.items },
      eventsData.sha,
      `Admin: delete event — ${e.title}`
    );
    eventsData.sha = result.content.sha;
    hideLoading();
    showAlert('success', `"${e.title}" deleted.`);
    renderEventsList();
    updateStats();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

/* ============================================================
   PHOTOS / GALLERY
   ============================================================ */

function previewUploadPhoto() {
  const file = document.getElementById('photo-upload-input').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('photo-preview-img').src = e.target.result;
    document.getElementById('photo-preview-name').textContent = file.name;
    document.getElementById('photo-preview-size').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('photo-upload-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function uploadPhoto() {
  const file = document.getElementById('photo-upload-input').files[0];
  if (!file) { showAlert('warning', 'Please select a photo first.'); return; }

  const folder = document.getElementById('photo-folder').value;
  const target = `${folder}/${file.name}`;

  showLoading('Uploading photo...');
  try {
    await apiUploadImage(file, target);
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Photo uploaded to <code>${target}</code>`);
    document.getElementById('photo-upload-input').value = '';
    document.getElementById('photo-upload-preview').style.display = 'none';
    if (folder.includes('events'))   renderGallery('events');
    if (folder.includes('partners')) renderGallery('partners');
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function renderGallery(folder = 'events') {
  const gridId = folder === 'partners' ? 'partners-gallery-grid' : 'gallery-grid';
  const grid   = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '<div class="col-12"><p class="text-muted">Loading...</p></div>';
  try {
    const files  = await apiCall('list', { path: `images/${folder}` });
    const images = Array.isArray(files) ? files.filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name)) : [];

    if (!images.length) {
      grid.innerHTML = `<div class="col-12"><p class="text-muted">No photos in images/${folder}/ yet.</p></div>`;
      return;
    }
    const raw = 'https://raw.githubusercontent.com/Beau34-max/joybringerswebsitesep/main/';
    grid.innerHTML = images.map(f => `
      <div class="col-6 col-md-3 col-lg-2">
        <div class="gallery-photo-card" style="position:relative;">
          <img src="${raw}${f.path}" alt="${f.name}" loading="lazy">
          <div class="photo-caption" title="${f.path}"><code style="font-size:10px">${f.name}</code></div>
          ${isAdmin() ? `<button onclick="deletePhoto('${f.path}','${f.sha}','${folder}')"
            title="Delete photo"
            style="position:absolute;top:4px;right:4px;background:rgba(220,38,38,0.85);border:none;border-radius:50%;width:26px;height:26px;color:white;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">
            <i class="fas fa-trash"></i>
          </button>` : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    grid.innerHTML = `<div class="col-12"><div class="alert alert-danger">Could not load: ${err.message}</div></div>`;
  }
}

async function deletePhoto(path, sha, folder) {
  if (!confirm(`Delete "${path.split('/').pop()}"?\n\nThis cannot be undone.`)) return;
  showLoading('Deleting photo...');
  try {
    await apiCall('delete', { path, sha, message: `Admin: delete photo — ${path}` });
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Photo deleted.`);
    renderGallery(folder);
  } catch (err) {
    hideLoading();
    showAlert('danger', `<i class="fas fa-times-circle"></i> ${err.message}`);
  }
}

/* ============================================================
   CONTENT SECTIONS
   ============================================================ */

let contentShas = {};

async function loadContentTab() {
  /* impact */
  try {
    const { data, sha } = await apiReadJSON('data/impact.json');
    contentShas.impact = sha;
    document.getElementById('impact-young-people').value = data.young_people_supported || '';
    document.getElementById('impact-events').value       = data.events_workshops       || '';
    document.getElementById('impact-partner-orgs').value = data.partner_orgs           || '';
    document.getElementById('impact-volunteers').value   = data.active_volunteers      || '';
    document.getElementById('impact-donation').value     = data.donation_message       || '';
    document.getElementById('impact-volunteer').value    = data.volunteer_message      || '';
  } catch (_) {}

  /* footer */
  try {
    const { data, sha } = await apiReadJSON('data/footer.json');
    contentShas.footer = sha;
    document.getElementById('footer-email').value      = data.email      || '';
    document.getElementById('footer-phone').value      = data.phone      || '';
    document.getElementById('footer-company').value    = data.company    || '';
    document.getElementById('footer-company-no').value = data.company_no || '';
    document.getElementById('footer-charity-no').value = data.charity_no || '';
    document.getElementById('footer-address').value    = data.address    || '';
    document.getElementById('footer-map-url').value    = data.map_url    || '';
    const get = (plat) => ((data.socials || []).find(s => s.platform.toLowerCase() === plat) || {}).url || '';
    document.getElementById('footer-facebook').value  = get('facebook');
    document.getElementById('footer-instagram').value = get('instagram');
    document.getElementById('footer-linkedin').value  = get('linkedin');
    document.getElementById('footer-twitter').value   = get('twitter');
    document.getElementById('footer-tiktok').value    = get('tiktok');
  } catch (_) {}

  /* partners */
  try {
    const { data, sha } = await apiReadJSON('data/partners.json');
    contentShas.partners = sha;
    renderPartnersEditor(data.items || []);
  } catch (_) {}

  /* foodbank impact */
  try {
    const { data, sha } = await apiReadJSON('data/foodbank-impact.json');
    contentShas.foodbank = sha;
    document.getElementById('fb-impact-people').value      = data.people_supported      || '';
    document.getElementById('fb-impact-volunteers').value  = data.volunteers            || '';
    document.getElementById('fb-impact-collections').value = data.collections_completed || '';
    document.getElementById('fb-impact-kg').value          = data.food_rescued_kg       || '';
    document.getElementById('fb-impact-meals').value       = data.meals_provided        || '';
    document.getElementById('fb-impact-co2').value         = data.co2_saved_kg          || '';
  } catch (_) {}
}

async function saveFoodbankImpact() {
  showLoading('Saving...');
  try {
    const payload = {
      people_supported:      parseInt(document.getElementById('fb-impact-people').value)      || 0,
      volunteers:            parseInt(document.getElementById('fb-impact-volunteers').value)  || 0,
      collections_completed: parseInt(document.getElementById('fb-impact-collections').value) || 0,
      food_rescued_kg:       parseInt(document.getElementById('fb-impact-kg').value)          || 0,
      meals_provided:        parseInt(document.getElementById('fb-impact-meals').value)       || 0,
      co2_saved_kg:          parseInt(document.getElementById('fb-impact-co2').value)          || 0
    };
    const r = await apiWriteJSON('data/foodbank-impact.json', payload, contentShas.foodbank, 'Admin: update foodbank impact numbers');
    contentShas.foodbank = r.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Foodbank numbers saved! Goes live in ~1 minute.');
  } catch (err) { hideLoading(); showAlert('danger', err.message); }
}

async function saveImpact() {
  showLoading('Saving...');
  try {
    const payload = {
      young_people_supported: parseInt(document.getElementById('impact-young-people').value) || 0,
      events_workshops:       parseInt(document.getElementById('impact-events').value)       || 0,
      partner_orgs:           parseInt(document.getElementById('impact-partner-orgs').value) || 0,
      active_volunteers:      parseInt(document.getElementById('impact-volunteers').value)   || 0,
      donation_message:  document.getElementById('impact-donation').value,
      volunteer_message: document.getElementById('impact-volunteer').value
    };
    const r = await apiWriteJSON('data/impact.json', payload, contentShas.impact, 'Admin: update impact numbers');
    contentShas.impact = r.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Impact numbers saved! Goes live in ~1 minute.');
  } catch (err) { hideLoading(); showAlert('danger', err.message); }
}

async function saveFooter() {
  showLoading('Saving...');
  try {
    const { data, sha } = await apiReadJSON('data/footer.json');
    const socialMap = {
      facebook: document.getElementById('footer-facebook').value,
      instagram: document.getElementById('footer-instagram').value,
      linkedin: document.getElementById('footer-linkedin').value,
      twitter: document.getElementById('footer-twitter').value,
      tiktok: document.getElementById('footer-tiktok').value
    };
    const updatedSocials = (data.socials || []).map(s => ({
      ...s, url: socialMap[s.platform.toLowerCase()] || s.url
    }));
    Object.entries(socialMap).forEach(([plat, url]) => {
      if (url && !updatedSocials.find(s => s.platform.toLowerCase() === plat))
        updatedSocials.push({ platform: plat.charAt(0).toUpperCase() + plat.slice(1), url, icon: `icon-${plat}` });
    });
    const payload = {
      ...data,
      email:      document.getElementById('footer-email').value,
      phone:      document.getElementById('footer-phone').value,
      company:    document.getElementById('footer-company').value,
      company_no: document.getElementById('footer-company-no').value,
      charity_no: document.getElementById('footer-charity-no').value,
      address:    document.getElementById('footer-address').value,
      map_url:    document.getElementById('footer-map-url').value,
      socials:    updatedSocials
    };
    const r = await apiWriteJSON('data/footer.json', payload, sha, 'Admin: update footer info');
    contentShas.footer = r.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Footer info saved! Goes live in ~1 minute.');
  } catch (err) { hideLoading(); showAlert('danger', err.message); }
}

/* partners editor */
function renderPartnersEditor(items) {
  document.getElementById('partners-list-editor').innerHTML = '';
  items.forEach((p, i) => appendPartnerRow(p));
}
function appendPartnerRow(p = {}) {
  const container = document.getElementById('partners-list-editor');
  const div = document.createElement('div');
  div.className = 'partner-row';
  div.innerHTML = `
    <div class="flex-grow-1">
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label mb-1">Name</label>
          <input type="text" class="form-control form-control-sm partner-name" value="${p.name || ''}" placeholder="Partner name">
        </div>
        <div class="col-md-4">
          <label class="form-label mb-1">Logo Path</label>
          <input type="text" class="form-control form-control-sm partner-logo" value="${p.logo || ''}" placeholder="images/partners/logo.png">
        </div>
        <div class="col-md-4">
          <label class="form-label mb-1">Website</label>
          <input type="url" class="form-control form-control-sm partner-link" value="${p.link || ''}" placeholder="https://...">
        </div>
      </div>
    </div>
    <button type="button" class="btn btn-outline-danger btn-sm align-self-end ms-2" onclick="this.closest('.partner-row').remove()">
      <i class="fas fa-trash"></i>
    </button>`;
  container.appendChild(div);
}
function addPartnerRow() { appendPartnerRow(); }

async function savePartners() {
  showLoading('Saving...');
  try {
    const items = Array.from(document.querySelectorAll('.partner-row')).map(row => ({
      name: row.querySelector('.partner-name').value,
      logo: row.querySelector('.partner-logo').value,
      link: row.querySelector('.partner-link').value
    })).filter(p => p.name);
    const r = await apiWriteJSON('data/partners.json', { items }, contentShas.partners, 'Admin: update partners');
    contentShas.partners = r.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Partners saved! Goes live in ~1 minute.');
  } catch (err) { hideLoading(); showAlert('danger', err.message); }
}

/* ============================================================
   DATA ENTRY — Event Attendance & Grants Received
   Stored in Supabase, not GitHub — available to both admin
   and data_entry roles. Deleting entries is admin-only.
   ============================================================ */

function loadDataEntryTab() {
  populateAttendanceEventOptions();
  loadAttendanceList();
  loadGrantsList();
  loadFoodbankList();
  loadAssetsList();
}

let attendanceRows = [];
let grantsRows     = [];
let foodbankRows   = [];
let assetsRows     = [];

let editingAttendanceId = null;
let editingGrantId       = null;
let editingFoodbankId    = null;
let editingAssetId       = null;

async function populateAttendanceEventOptions() {
  const select = document.getElementById('attendance-event-select');
  try {
    const { data } = await apiReadJSON('data/events.json');
    const items = (data.items || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    select.innerHTML = '<option value="">Select an event...</option>' +
      items.map(e => `<option value="${e.title}">${e.title} — ${fmtDate(e.date)}</option>`).join('');
  } catch (_) {
    select.innerHTML = '<option value="">Could not load events — type the name below</option>';
  }
}

async function submitAttendance() {
  const selected   = document.getElementById('attendance-event-select').value;
  const custom     = document.getElementById('attendance-event-custom').value.trim();
  const eventName  = custom || selected;
  const date       = document.getElementById('attendance-date').value;
  const count      = document.getElementById('attendance-count').value;

  if (!eventName || !date || count === '') {
    showAlert('warning', 'Please select/enter an event, a date, and the number attended.');
    return;
  }

  const record = {
    event_name: eventName,
    event_date: date,
    attendees_count: parseInt(count) || 0,
    volunteer_name: document.getElementById('attendance-volunteer').value.trim() || null,
    notes: document.getElementById('attendance-notes').value.trim() || null
  };

  showLoading(editingAttendanceId ? 'Updating attendance...' : 'Saving attendance...');
  try {
    if (editingAttendanceId) {
      await apiCall('update_attendance', { id: editingAttendanceId, record });
    } else {
      await apiCall('add_attendance', { record });
    }
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Attendance ${editingAttendanceId ? 'updated' : 'saved'}.`);
    cancelEditAttendance();
    loadAttendanceList();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function loadAttendanceList() {
  const body = document.getElementById('attendance-list-body');
  body.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">Loading...</td></tr>';
  try {
    const rows = await apiCall('list_attendance');
    attendanceRows = Array.isArray(rows) ? rows : [];
    if (!attendanceRows.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">No attendance logged yet.</td></tr>';
      return;
    }
    body.innerHTML = attendanceRows.map(r => `
      <tr>
        <td>${r.event_name}</td>
        <td>${fmtDate(r.event_date)}</td>
        <td>${r.attendees_count}</td>
        <td>${r.volunteer_name || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editAttendance(${r.id})"><i class="fas fa-pen"></i></button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteAttendance(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function editAttendance(id) {
  const r = attendanceRows.find(x => x.id === id);
  if (!r) return;
  editingAttendanceId = id;

  const select = document.getElementById('attendance-event-select');
  const hasOption = Array.from(select.options).some(o => o.value === r.event_name);
  select.value = hasOption ? r.event_name : '';
  document.getElementById('attendance-event-custom').value = hasOption ? '' : r.event_name;
  document.getElementById('attendance-date').value      = r.event_date;
  document.getElementById('attendance-count').value     = r.attendees_count;
  document.getElementById('attendance-volunteer').value = r.volunteer_name || '';
  document.getElementById('attendance-notes').value     = r.notes || '';

  document.getElementById('attendance-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Attendance';
  document.getElementById('attendance-cancel-btn').style.display = 'inline-block';
  document.getElementById('attendance-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditAttendance() {
  editingAttendanceId = null;
  document.getElementById('attendance-form').reset();
  document.getElementById('attendance-submit-btn').innerHTML = '<i class="fas fa-save"></i> Save Attendance';
  document.getElementById('attendance-cancel-btn').style.display = 'none';
}

async function deleteAttendance(id) {
  if (!confirm('Delete this attendance record?\n\nThis cannot be undone.')) return;
  try {
    await apiCall('delete_attendance', { id });
    showAlert('success', 'Attendance record deleted.');
    loadAttendanceList();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

async function submitGrant() {
  const name   = document.getElementById('grant-name').value.trim();
  const amount = document.getElementById('grant-amount').value;
  const method = document.getElementById('grant-method').value;
  const date   = document.getElementById('grant-date').value;

  if (!name || amount === '' || !method || !date) {
    showAlert('warning', 'Please fill in grantor name, amount, payment method, and date received.');
    return;
  }

  const record = {
    grantor_name: name,
    amount: parseFloat(amount) || 0,
    payment_method: method,
    date_received: date,
    reference: document.getElementById('grant-reference').value.trim() || null,
    volunteer_name: document.getElementById('grant-volunteer').value.trim() || null,
    notes: document.getElementById('grant-notes').value.trim() || null
  };

  showLoading(editingGrantId ? 'Updating grant...' : 'Saving grant...');
  try {
    if (editingGrantId) {
      await apiCall('update_grant', { id: editingGrantId, record });
    } else {
      await apiCall('add_grant', { record });
    }
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Grant ${editingGrantId ? 'updated' : 'saved'}.`);
    cancelEditGrant();
    loadGrantsList();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function loadGrantsList() {
  const body = document.getElementById('grants-list-body');
  body.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">Loading...</td></tr>';
  try {
    const rows = await apiCall('list_grants');
    grantsRows = Array.isArray(rows) ? rows : [];
    if (!grantsRows.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">No grants logged yet.</td></tr>';
      return;
    }
    body.innerHTML = grantsRows.map(r => `
      <tr>
        <td>${r.grantor_name}</td>
        <td>£${parseFloat(r.amount).toFixed(2)}</td>
        <td>${{ cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', other: 'Other' }[r.payment_method] || r.payment_method}</td>
        <td>${fmtDate(r.date_received)}</td>
        <td>${r.volunteer_name || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editGrant(${r.id})"><i class="fas fa-pen"></i></button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteGrant(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function editGrant(id) {
  const r = grantsRows.find(x => x.id === id);
  if (!r) return;
  editingGrantId = id;

  document.getElementById('grant-name').value      = r.grantor_name;
  document.getElementById('grant-amount').value    = r.amount;
  document.getElementById('grant-method').value    = r.payment_method;
  document.getElementById('grant-date').value      = r.date_received;
  document.getElementById('grant-reference').value = r.reference || '';
  document.getElementById('grant-volunteer').value = r.volunteer_name || '';
  document.getElementById('grant-notes').value     = r.notes || '';

  document.getElementById('grant-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Grant';
  document.getElementById('grant-cancel-btn').style.display = 'inline-block';
  document.getElementById('grant-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditGrant() {
  editingGrantId = null;
  document.getElementById('grant-form').reset();
  document.getElementById('grant-submit-btn').innerHTML = '<i class="fas fa-save"></i> Save Grant';
  document.getElementById('grant-cancel-btn').style.display = 'none';
}

async function deleteGrant(id) {
  if (!confirm('Delete this grant record?\n\nThis cannot be undone.')) return;
  try {
    await apiCall('delete_grant', { id });
    showAlert('success', 'Grant record deleted.');
    loadGrantsList();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

async function submitFoodbank() {
  const date   = document.getElementById('foodbank-date').value;
  const people = document.getElementById('foodbank-people').value;

  if (!date || people === '') {
    showAlert('warning', 'Please fill in the date and number of people.');
    return;
  }

  const households = document.getElementById('foodbank-households').value;
  const record = {
    distribution_date: date,
    people_count: parseInt(people) || 0,
    households_count: households !== '' ? (parseInt(households) || 0) : null,
    volunteer_name: document.getElementById('foodbank-volunteer').value.trim() || null,
    notes: document.getElementById('foodbank-notes').value.trim() || null
  };

  showLoading(editingFoodbankId ? 'Updating foodbank record...' : 'Saving foodbank record...');
  try {
    if (editingFoodbankId) {
      await apiCall('update_foodbank', { id: editingFoodbankId, record });
    } else {
      await apiCall('add_foodbank', { record });
    }
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Foodbank record ${editingFoodbankId ? 'updated' : 'saved'}.`);
    cancelEditFoodbank();
    loadFoodbankList();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function loadFoodbankList() {
  const body = document.getElementById('foodbank-list-body');
  body.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">Loading...</td></tr>';
  try {
    const rows = await apiCall('list_foodbank');
    foodbankRows = Array.isArray(rows) ? rows : [];
    if (!foodbankRows.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">No foodbank records yet.</td></tr>';
      return;
    }
    body.innerHTML = foodbankRows.map(r => `
      <tr>
        <td>${fmtDate(r.distribution_date)}</td>
        <td>${r.people_count}</td>
        <td>${r.households_count ?? '—'}</td>
        <td>${r.volunteer_name || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editFoodbank(${r.id})"><i class="fas fa-pen"></i></button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteFoodbank(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function editFoodbank(id) {
  const r = foodbankRows.find(x => x.id === id);
  if (!r) return;
  editingFoodbankId = id;

  document.getElementById('foodbank-date').value       = r.distribution_date;
  document.getElementById('foodbank-people').value     = r.people_count;
  document.getElementById('foodbank-households').value = r.households_count ?? '';
  document.getElementById('foodbank-volunteer').value  = r.volunteer_name || '';
  document.getElementById('foodbank-notes').value      = r.notes || '';

  document.getElementById('foodbank-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Record';
  document.getElementById('foodbank-cancel-btn').style.display = 'inline-block';
  document.getElementById('foodbank-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditFoodbank() {
  editingFoodbankId = null;
  document.getElementById('foodbank-form').reset();
  document.getElementById('foodbank-submit-btn').innerHTML = '<i class="fas fa-save"></i> Save Foodbank Record';
  document.getElementById('foodbank-cancel-btn').style.display = 'none';
}

async function deleteFoodbank(id) {
  if (!confirm('Delete this foodbank record?\n\nThis cannot be undone.')) return;
  try {
    await apiCall('delete_foodbank', { id });
    showAlert('success', 'Foodbank record deleted.');
    loadFoodbankList();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

const ASSET_TYPE_LABELS = { purchased: 'Purchased', donated: 'Donated' };

async function submitAsset() {
  const name  = document.getElementById('asset-name').value.trim();
  const type  = document.getElementById('asset-type').value;
  const value = document.getElementById('asset-value').value;
  const date  = document.getElementById('asset-date').value;

  if (!name || !type || value === '' || !date) {
    showAlert('warning', 'Please fill in asset name, acquired by, value, and date acquired.');
    return;
  }

  const record = {
    asset_name: name,
    category: document.getElementById('asset-category').value || null,
    acquisition_type: type,
    value: parseFloat(value) || 0,
    date_acquired: date,
    source_name: document.getElementById('asset-source').value.trim() || null,
    condition: document.getElementById('asset-condition').value || null,
    volunteer_name: document.getElementById('asset-volunteer').value.trim() || null,
    notes: document.getElementById('asset-notes').value.trim() || null
  };

  showLoading(editingAssetId ? 'Updating asset...' : 'Saving asset...');
  try {
    if (editingAssetId) {
      await apiCall('update_asset', { id: editingAssetId, record });
    } else {
      await apiCall('add_asset', { record });
    }
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Asset ${editingAssetId ? 'updated' : 'saved'}.`);
    cancelEditAsset();
    loadAssetsList();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function loadAssetsList() {
  const body = document.getElementById('assets-list-body');
  body.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">Loading...</td></tr>';
  try {
    const rows = await apiCall('list_asset');
    assetsRows = Array.isArray(rows) ? rows : [];
    if (!assetsRows.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">No assets logged yet.</td></tr>';
      return;
    }
    body.innerHTML = assetsRows.map(r => `
      <tr>
        <td>${r.asset_name}</td>
        <td>${ASSET_TYPE_LABELS[r.acquisition_type] || r.acquisition_type}</td>
        <td>£${parseFloat(r.value).toFixed(2)}</td>
        <td>${fmtDate(r.date_acquired)}</td>
        <td>${r.volunteer_name || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editAsset(${r.id})"><i class="fas fa-pen"></i></button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteAsset(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function editAsset(id) {
  const r = assetsRows.find(x => x.id === id);
  if (!r) return;
  editingAssetId = id;

  document.getElementById('asset-name').value      = r.asset_name;
  document.getElementById('asset-category').value   = r.category || '';
  document.getElementById('asset-type').value      = r.acquisition_type;
  document.getElementById('asset-value').value     = r.value;
  document.getElementById('asset-date').value      = r.date_acquired;
  document.getElementById('asset-source').value    = r.source_name || '';
  document.getElementById('asset-condition').value = r.condition || '';
  document.getElementById('asset-volunteer').value = r.volunteer_name || '';
  document.getElementById('asset-notes').value     = r.notes || '';

  document.getElementById('asset-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Asset';
  document.getElementById('asset-cancel-btn').style.display = 'inline-block';
  document.getElementById('asset-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditAsset() {
  editingAssetId = null;
  document.getElementById('asset-form').reset();
  document.getElementById('asset-submit-btn').innerHTML = '<i class="fas fa-save"></i> Save Asset';
  document.getElementById('asset-cancel-btn').style.display = 'none';
}

async function deleteAsset(id) {
  if (!confirm('Delete this asset record?\n\nThis cannot be undone.')) return;
  try {
    await apiCall('delete_asset', { id });
    showAlert('success', 'Asset record deleted.');
    loadAssetsList();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

/* ════════════════════════════════════════════════════════════
   VISITOR LOG
   ════════════════════════════════════════════════════════════ */

let allVisitorRows = [];

function initVisitorTab() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('v-date-from').value = today;
  document.getElementById('v-date-to').value   = today;
  loadVisitors();
}

async function loadVisitors() {
  const from = document.getElementById('v-date-from').value;
  const to   = document.getElementById('v-date-to').value;
  const tbody = document.getElementById('visitor-table-body');
  tbody.innerHTML = '<tr><td colspan="10" class="text-muted text-center py-4"><i class="fas fa-spinner fa-spin me-2"></i>Loading…</td></tr>';

  try {
    const data = await apiCall('list_visitors_range', { date_from: from, date_to: to });
    allVisitorRows = Array.isArray(data) ? data : [];
    renderVisitorTable(allVisitorRows);
    updateVisitorStats(allVisitorRows);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-danger text-center py-4">${err.message}</td></tr>`;
  }
}

function renderVisitorTable(rows) {
  const tbody = document.getElementById('visitor-table-body');
  document.getElementById('v-count').textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-muted text-center py-4">No visitor records for this date range.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(v => {
    const inTime  = v.signed_in_at  ? new Date(v.signed_in_at).toLocaleTimeString('en-GB',  { hour: '2-digit', minute: '2-digit' }) : '—';
    const outTime = v.signed_out_at ? new Date(v.signed_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
    const inDate  = v.signed_in_at  ? new Date(v.signed_in_at).toLocaleDateString('en-GB',  { day: 'numeric', month: 'short' }) : '';
    const isIn    = !v.signed_out_at;
    const statusBadge = isIn
      ? '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle"><i class="fas fa-circle-dot" style="font-size:8px"></i> In Building</span>'
      : '<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">Signed Out</span>';
    const signOutBtn = isIn
      ? `<button class="btn btn-outline-danger btn-sm" onclick="adminSignOut('${v.id}', '${v.first_name} ${v.last_name}')"><i class="fas fa-sign-out-alt"></i></button>`
      : '';
    return `<tr>
      <td><strong>${v.first_name} ${v.last_name}</strong></td>
      <td class="text-muted small">${v.organisation || '—'}</td>
      <td>${v.host_name}</td>
      <td><span class="badge bg-light text-dark border">${v.purpose}</span></td>
      <td class="small">${v.dbs_status || '—'}</td>
      <td><code>${v.badge_id || '—'}</code></td>
      <td class="small">${inDate} ${inTime}</td>
      <td class="small">${outTime}</td>
      <td>${statusBadge}</td>
      <td>${signOutBtn}</td>
    </tr>`;
  }).join('');
}

function updateVisitorStats(rows) {
  const today    = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter(v => v.signed_in_at && v.signed_in_at.startsWith(today));
  const inBldg   = rows.filter(v => !v.signed_out_at);
  const signedOut = rows.filter(v =>  v.signed_out_at);
  const now      = new Date();
  const monthRows = rows.filter(v => {
    const d = new Date(v.signed_in_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  document.getElementById('vstat-today').textContent    = todayRows.length;
  document.getElementById('vstat-in').textContent       = inBldg.length;
  document.getElementById('vstat-month').textContent    = monthRows.length;
  document.getElementById('vstat-signedout').textContent = signedOut.length;
}

function filterVisitorTable() {
  const q = document.getElementById('v-search').value.toLowerCase();
  const filtered = allVisitorRows.filter(v =>
    `${v.first_name} ${v.last_name} ${v.organisation || ''} ${v.host_name} ${v.purpose}`.toLowerCase().includes(q)
  );
  renderVisitorTable(filtered);
}

async function adminSignOut(id, name) {
  if (!confirm(`Sign out ${name}?\n\nThis will record their departure time.`)) return;
  try {
    await apiCall('admin_signout_visitor', { id });
    showAlert('success', `${name} has been signed out.`);
    loadVisitors();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

/* ── User Management (Settings tab) ─────────────────────── */

function toggleAddUserForm() {
  const wrap = document.getElementById('add-user-form-wrap');
  const hidden = wrap.style.display === 'none';
  wrap.style.display = hidden ? '' : 'none';
  if (hidden) document.getElementById('new-user-name').focus();
  else document.getElementById('add-user-form').reset();
}

async function loadUsers() {
  const wrap = document.getElementById('users-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="text-center text-muted py-3 small">Loading team members…</div>';
  try {
    const users = await apiCall('list_users');
    window._adminUsers = users || [];
    if (!Array.isArray(users) || !users.length) {
      wrap.innerHTML = '<p class="text-muted small text-center py-3 mb-0">No team members added yet — use the button above to invite someone.</p>';
      return;
    }
    const roleLabel = { admin: 'Full Admin', editor: 'Editor', data_entry: 'Data Entry' };
    const roleBadge = { admin: 'bg-danger', editor: 'bg-primary', data_entry: 'bg-secondary' };
    wrap.innerHTML = `<table class="table table-sm mb-0">
      <thead class="table-light"><tr>
        <th>Name</th><th>Email</th><th>Role</th><th>Added</th><th></th>
      </tr></thead>
      <tbody>${users.map((u, i) => `<tr>
        <td>${u.name}${u.invite_pending ? ' <span class="badge bg-warning text-dark ms-1">Invite pending</span>' : ''}</td>
        <td class="text-muted">${u.email}</td>
        <td><span class="badge ${roleBadge[u.role] || 'bg-secondary'}">${roleLabel[u.role] || u.role}</span></td>
        <td class="text-muted small">${u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB') : ''}</td>
        <td class="text-end text-nowrap">
          ${u.invite_pending
            ? `<button class="btn btn-outline-secondary btn-sm" onclick="resendInvite(${i})"><i class="fas fa-envelope"></i> Resend</button>`
            : `<button class="btn btn-outline-secondary btn-sm" onclick="sendResetLink(${i})"><i class="fas fa-envelope"></i> Reset PW</button>`
          }
          <button class="btn btn-outline-danger btn-sm ms-1" onclick="removeUser(${i})">Remove</button>
        </td>
      </tr>`).join('')}</tbody>
    </table>`;
  } catch (err) {
    wrap.innerHTML = `<p class="text-danger small text-center py-3 mb-0">${err.message}</p>`;
  }
}

async function addUser(e) {
  e.preventDefault();
  const name      = document.getElementById('new-user-name').value.trim();
  const email     = document.getElementById('new-user-email').value.trim();
  const user_role = document.getElementById('new-user-role').value;
  const btn = document.getElementById('add-user-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Sending…';
  try {
    const result = await apiCall('create_user', { name, email, user_role });
    document.getElementById('add-user-form').reset();
    document.getElementById('add-user-form-wrap').style.display = 'none';
    loadUsers();
    if (result.email_sent) {
      showAlert('success', `Invite email sent to <strong>${email}</strong> — ${name} will receive a link to set their own password.`);
    } else {
      showInviteModal(result.invite_token, name, `Email could not be sent — share this link with ${name} directly:`);
    }
  } catch (err) {
    showAlert('danger', err.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Invite';
  }
}

function showInviteModal(token, name, customMsg) {
  const link = `${window.location.origin}/admin/set-password?token=${token}`;
  document.getElementById('invite-modal-desc').innerHTML = customMsg
    || `Share this link with <strong>${name}</strong> — they click it to set their own password and log in. The link can only be used once.`;
  document.getElementById('invite-link-box').value = link;
  document.getElementById('invite-copied-msg').style.display = 'none';
  new bootstrap.Modal(document.getElementById('inviteLinkModal')).show();
}

function copyInviteLink() {
  const box = document.getElementById('invite-link-box');
  navigator.clipboard.writeText(box.value).then(() => {
    document.getElementById('invite-copied-msg').style.display = '';
  });
}

async function removeUser(i) {
  const u = (window._adminUsers || [])[i];
  if (!u) return;
  if (!confirm(`Remove ${u.name} from the team? They will no longer be able to log in.`)) return;
  try {
    await apiCall('delete_user', { id: u.id });
    showAlert('success', `${u.name} has been removed.`);
    loadUsers();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

async function sendResetLink(i) {
  const u = (window._adminUsers || [])[i];
  if (!u) return;
  if (!confirm(`Send ${u.name} a link to reset their password? A new invite email will be sent to ${u.email}.`)) return;
  try {
    const result = await apiCall('resend_invite', { id: u.id, email: u.email, name: u.name });
    if (result.email_sent) {
      showAlert('success', `Password reset link sent to <strong>${u.email}</strong>.`);
    } else {
      showInviteModal(result.invite_token, u.name, `Email could not be sent — share this link with ${u.name} directly:`);
    }
  } catch (err) {
    showAlert('danger', err.message);
  }
}

async function resendInvite(i) {
  const u = (window._adminUsers || [])[i];
  if (!u) return;
  try {
    const result = await apiCall('resend_invite', { id: u.id, email: u.email, name: u.name });
    if (result.email_sent) {
      showAlert('success', `Invite email resent to <strong>${u.email}</strong>.`);
    } else {
      showInviteModal(result.invite_token, u.name, `Email could not be sent — share this link with ${u.name} directly:`);
    }
  } catch (err) {
    showAlert('danger', err.message);
  }
}

/* ════════════════════════════════════════════════════════════
   EVENT ATTENDANCE
   ════════════════════════════════════════════════════════════ */

let _attendanceData = [];
let _regDataById    = {};

async function loadAttendanceTab() {
  const sel = document.getElementById('att-event-select');
  sel.innerHTML = '<option value="">Loading…</option>';
  document.getElementById('att-save-wrap').style.display   = 'none';
  document.getElementById('att-filter-row').style.display  = 'none';
  document.getElementById('att-participants-wrap').innerHTML =
    '<p class="text-muted text-center py-4">Select an event above to load participants.</p>';
  try {
    const events = await apiCall('get_event_list_for_attendance');
    if (!Array.isArray(events) || !events.length) {
      sel.innerHTML = '<option value="">No registrations found</option>';
      return;
    }
    sel.innerHTML = '<option value="">Select an event…</option>' +
      events.map(e => {
        const key   = `${e.event_name}|||${e.event_date}`;
        const label = `${e.event_name} — ${fmtDate(e.event_date)} (${e.count} registration${e.count !== 1 ? 's' : ''})`;
        return `<option value="${key.replace(/"/g, '&quot;')}">${label}</option>`;
      }).join('');
  } catch (err) {
    sel.innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

async function loadEventRegistrations() {
  const sel = document.getElementById('att-event-select');
  if (!sel.value) { showAlert('warning', 'Please select an event first.'); return; }
  const [event_name, event_date] = sel.value.split('|||');
  const wrap = document.getElementById('att-participants-wrap');
  wrap.innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin me-2"></i>Loading…</div>';
  document.getElementById('att-save-wrap').style.display  = 'none';
  document.getElementById('att-filter-row').style.display = 'none';
  try {
    const regs = await apiCall('get_registrations_for_event', { event_name, event_date });
    _regDataById    = {};
    _attendanceData = [];
    for (const reg of (Array.isArray(regs) ? regs : [])) {
      _regDataById[reg.id] = reg;
      _attendanceData.push({
        regId: reg.id, regRef: reg.reg_ref || '—',
        name: `${reg.first_name} ${reg.last_name}`,
        type: 'Main', age_group: reg.age_range || '—',
        email: reg.email, personIndex: -1,
        attended: !!reg.main_attended
      });
      (reg.family_members || []).forEach((fm, i) => {
        _attendanceData.push({
          regId: reg.id, regRef: reg.reg_ref || '—',
          name: fm.name, type: fm.type === 'child' ? 'Child' : 'Adult',
          age_group: fm.age_group || '—', email: '',
          personIndex: i, attended: !!fm.attended
        });
      });
    }
    renderAttendanceTable(_attendanceData);
    document.getElementById('att-save-wrap').style.display  = '';
    document.getElementById('att-filter-row').style.display = '';
  } catch (err) {
    wrap.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderAttendanceTable(rows) {
  const wrap    = document.getElementById('att-participants-wrap');
  const attended = rows.filter(r => r.attended).length;
  document.getElementById('att-stats').textContent =
    `${attended} / ${rows.length} attended`;

  if (!rows.length) {
    wrap.innerHTML = '<div class="card"><div class="card-body text-center text-muted py-4">No registrations found for this event.</div></div>';
    return;
  }

  const TYPE_BADGE = {
    Main:  'bg-primary',
    Child: 'bg-warning text-dark',
    Adult: 'bg-secondary'
  };

  wrap.innerHTML = `
    <div class="card">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-sm table-hover mb-0" id="att-table">
            <thead class="table-light">
              <tr><th>Ref</th><th>Name</th><th>Type</th><th>Age Group</th><th>Email</th><th class="text-center">Attended</th></tr>
            </thead>
            <tbody>
              ${rows.map((r, i) => `
                <tr class="${r.attended ? 'table-success' : ''}" data-idx="${i}">
                  <td class="text-nowrap"><code>${r.regRef}</code></td>
                  <td class="fw-semibold">${r.name}</td>
                  <td><span class="badge ${TYPE_BADGE[r.type] || 'bg-secondary'}">${r.type}</span></td>
                  <td class="text-nowrap">${r.age_group}</td>
                  <td class="text-muted small">${r.email || '—'}</td>
                  <td class="text-center">
                    <input type="checkbox" class="form-check-input att-check" data-idx="${i}"
                           ${r.attended ? 'checked' : ''} onchange="toggleAttendance(${i}, this.checked)">
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function toggleAttendance(idx, checked) {
  _attendanceData[idx].attended = checked;
  const tr = document.querySelector(`tr[data-idx="${idx}"]`);
  if (tr) tr.className = checked ? 'table-success' : '';
  const attended = _attendanceData.filter(r => r.attended).length;
  document.getElementById('att-stats').textContent =
    `${attended} / ${_attendanceData.length} attended`;
}

function markAllAttended(val) {
  _attendanceData.forEach((r, i) => {
    r.attended = val;
    const cb = document.querySelector(`.att-check[data-idx="${i}"]`);
    const tr = document.querySelector(`tr[data-idx="${i}"]`);
    if (cb) cb.checked = val;
    if (tr) tr.className = val ? 'table-success' : '';
  });
  const attended = val ? _attendanceData.length : 0;
  document.getElementById('att-stats').textContent =
    `${attended} / ${_attendanceData.length} attended`;
}

function filterAttendanceTable() {
  const q = document.getElementById('att-search').value.toLowerCase();
  const filtered = q
    ? _attendanceData.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
    : _attendanceData;
  renderAttendanceTable(filtered);
}

async function saveAttendance() {
  const byReg = {};
  for (const row of _attendanceData) {
    if (!byReg[row.regId]) {
      const orig = _regDataById[row.regId];
      byReg[row.regId] = {
        id: row.regId,
        main_attended: false,
        family_members: JSON.parse(JSON.stringify(orig.family_members || []))
      };
    }
    if (row.personIndex === -1) {
      byReg[row.regId].main_attended = row.attended;
    } else {
      if (byReg[row.regId].family_members[row.personIndex]) {
        byReg[row.regId].family_members[row.personIndex].attended = row.attended;
      }
    }
  }
  showLoading('Saving attendance…');
  try {
    await apiCall('save_attendance', { updates: Object.values(byReg) });
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Attendance saved successfully.');
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

/* ════════════════════════════════════════════════════════════
   EXPORT DATA
   ════════════════════════════════════════════════════════════ */

let _exportRows = [];
window._currentExportType = 'registrations';

const EXPORT_SECTION_LABELS = {
  registrations:          'Event Registrations',
  attendance:             'Event Attendance',
  grants:                 'Grants & Income',
  foodbank:               'Foodbank Distribution',
  assets:                 'Assets',
  visitors:               'Visitors',
  volunteer_applications: 'Volunteer Applications',
  volunteer_expenses:     'Volunteer Expenses',
};

async function loadExportTab() {
  setExportRange('month');
  window._currentExportType = 'registrations';
  switchExportSection('registrations');
}

function switchExportSection(type) {
  window._currentExportType = type;
  document.querySelectorAll('#exports-nav button').forEach(btn => {
    const active = btn.id === `exp-tab-${type}`;
    btn.className = active ? 'btn btn-success btn-sm' : 'btn btn-outline-secondary btn-sm';
  });
  const showFilter = type === 'registrations' || type === 'attendance';
  document.getElementById('exp-event-filter-row').style.display = showFilter ? '' : 'none';
  if (!showFilter) document.getElementById('exp-event-filter').value = '';
  loadExportSection(type);
}

async function loadExportSection(type) {
  if (!type) return;
  window._currentExportType = type;
  const from      = document.getElementById('exp-date-from').value;
  const to        = document.getElementById('exp-date-to').value;
  const eventName = document.getElementById('exp-event-filter').value.trim();
  const wrap      = document.getElementById('exports-section-wrap');
  wrap.innerHTML  = '<div class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin me-2"></i>Loading…</div>';
  try {
    const data = await apiCall('export_data', {
      type,
      date_from:   from || null,
      date_to:     to   || null,
      event_name:  (type === 'registrations' || type === 'attendance') && eventName ? eventName : null
    });
    const raw = Array.isArray(data) ? data : [];
    _exportRows = type === 'registrations' ? flattenRegistrations(raw) : raw;
    renderExportTable(type, _exportRows);
  } catch (err) {
    wrap.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderExportTable(type, rows) {
  const wrap   = document.getElementById('exports-section-wrap');
  const label  = EXPORT_SECTION_LABELS[type] || type;
  const exclude = ['id', 'created_at', 'entered_by', 'updated_at'];
  const from   = document.getElementById('exp-date-from').value;
  const to     = document.getElementById('exp-date-to').value;

  const header = `
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span><i class="fas fa-list-ul"></i> ${label}
          <span class="text-muted fw-normal ms-1">(${rows.length} record${rows.length !== 1 ? 's' : ''})</span>
        </span>
        ${rows.length ? `<button class="btn btn-success btn-sm" onclick="runExport('${type}')">
          <i class="fas fa-download"></i> Export CSV</button>` : ''}
      </div>`;

  if (!rows.length) {
    wrap.innerHTML = header + '<div class="card-body text-center text-muted py-4">No records found for this date range.</div></div>';
    return;
  }

  const keys    = Object.keys(rows[0]).filter(k => !exclude.includes(k));
  const headers = keys.map(k => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  const isTs    = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);

  const tRows = rows.map(r => `<tr>${keys.map(k => {
    let v = r[k] ?? '—';
    if (isTs(String(v))) v = new Date(v).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
    return `<td class="text-nowrap">${v}</td>`;
  }).join('')}</tr>`).join('');

  wrap.innerHTML = header + `
      <div class="card-body p-0">
        <div class="table-responsive" style="max-height:520px;overflow-y:auto">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light" style="position:sticky;top:0;z-index:1">
              <tr>${headers.map(h => `<th class="text-nowrap">${h}</th>`).join('')}</tr>
            </thead>
            <tbody>${tRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function flattenRegistrations(rows) {
  const flat = [];
  for (const r of rows) {
    flat.push({
      participant_id: r.participant_id   || '—',
      ref:            r.reg_ref          || '—',
      name:           `${r.first_name} ${r.last_name}`,
      type:           'Main Registrant',
      age_group:      r.age_range        || '—',
      knowledge_level: r.knowledge_level || '',
      email:          r.email            || '',
      phone:          r.phone            || '',
      gender:         r.gender           || '',
      event_name:     r.event_name,
      event_date:     r.event_date,
      location:       r.location         || '',
      hear_about_us:  r.hear_about_us    || '',
      attended:       r.main_attended ? 'Yes' : 'No',
    });
    for (const fm of (r.family_members || [])) {
      flat.push({
        participant_id: fm.participant_id || '—',
        ref:            r.reg_ref         || '—',
        name:           fm.name,
        type:           fm.type === 'child' ? 'Child' : 'Additional Adult',
        age_group:      fm.age_group      || '—',
        knowledge_level: '',
        email:          '',
        phone:          '',
        gender:         '',
        event_name:     r.event_name,
        event_date:     r.event_date,
        location:       '',
        hear_about_us:  '',
        attended:       fm.attended ? 'Yes' : 'No',
      });
    }
  }
  return flat;
}

function setExportRange(preset) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const y = now.getFullYear(), m = now.getMonth();
  let from, to;
  if (preset === 'month') {
    from = `${y}-${pad(m + 1)}-01`;
    to   = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
  } else if (preset === 'year') {
    from = `${y}-01-01`;
    to   = `${y}-12-31`;
  } else {
    from = '2020-01-01';
    to   = `${y}-12-31`;
  }
  document.getElementById('exp-date-from').value = from;
  document.getElementById('exp-date-to').value   = to;
}

function runExport(type) {
  if (!_exportRows.length) { showAlert('warning', 'No records to export.'); return; }
  const from = document.getElementById('exp-date-from').value;
  const to   = document.getElementById('exp-date-to').value;
  downloadCsv(`joybringers-${type}-${from}-to-${to}.csv`, _exportRows);
  showAlert('success', `<i class="fas fa-check-circle"></i> Exported ${_exportRows.length} record${_exportRows.length !== 1 ? 's' : ''}.`);
}

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const exclude = ['id', 'created_at', 'entered_by', 'updated_at'];
  const keys   = Object.keys(rows[0]).filter(k => !exclude.includes(k));
  const header = keys.map(k => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  const isTs   = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
  const lines  = rows.map(r => keys.map(k => {
    let v = r[k] ?? '';
    if (isTs(String(v))) v = new Date(v).toLocaleString('en-GB');
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(','));
  const csv  = '﻿' + [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportVisitorsCsv() {
  if (!allVisitorRows.length) { showAlert('warning', 'No records to export.'); return; }
  const headers = ['First Name','Last Name','Organisation','Host','Purpose','DBS Status','Badge','Signed In','Signed Out'];
  const rows = allVisitorRows.map(v => [
    v.first_name, v.last_name, v.organisation || '', v.host_name, v.purpose,
    v.dbs_status || '', v.badge_id || '',
    v.signed_in_at  ? new Date(v.signed_in_at).toLocaleString('en-GB')  : '',
    v.signed_out_at ? new Date(v.signed_out_at).toLocaleString('en-GB') : ''
  ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = document.getElementById('v-date-from').value;
  a.href     = url;
  a.download = `joybringers-visitors-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── VOLUNTEER ROLES ─────────────────────────────────────── */

const ROLES_PATH = 'data/roles.json';
let rolesData = { items: [], sha: null };

const CAT_META = {
  operations: { label: 'Leadership & Ops',       color: '#006526' },
  finance:    { label: 'Finance & Business',      color: '#1e40af' },
  digital:    { label: 'Digital & Technology',    color: '#7c3aed' },
  community:  { label: 'Community & Education',   color: '#b45309' },
  marketing:  { label: 'Marketing & Fundraising', color: '#be185d' },
  support:    { label: 'Support Services',        color: '#0e7490' }
};

async function loadRoles() {
  document.getElementById('roles-list').innerHTML = '<p class="text-muted">Loading roles...</p>';
  try {
    const { data, sha } = await apiReadJSON(ROLES_PATH);
    rolesData = { items: data.items || [], sha };
    renderRolesList();
  } catch (e) {
    document.getElementById('roles-list').innerHTML = `<p class="text-danger">Error: ${e.message}</p>`;
  }
}

function renderRolesList() {
  const search    = (document.getElementById('roles-search')?.value || '').toLowerCase();
  const catFilter = document.getElementById('roles-category-filter')?.value || '';
  const isFiltering = search || catFilter;

  const filtered = rolesData.items.filter(r => {
    if (catFilter && r.category !== catFilter) return false;
    if (search && !r.title.toLowerCase().includes(search) && !r.summary.toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    document.getElementById('roles-list').innerHTML = '<p class="text-muted">No roles found.</p>';
    return;
  }

  const tierBadge = { trustee: 'warning', senior: 'info', volunteer: 'secondary' };
  const tierLabel  = { trustee: 'Trustee', senior: 'Senior', volunteer: 'Volunteer' };

  const list = document.getElementById('roles-list');
  list.innerHTML = filtered.map(r => {
    const idx    = rolesData.items.indexOf(r);
    const meta   = CAT_META[r.category] || { label: r.category, color: '#555' };
    const isOpen = r.open !== false;
    return `<div class="roles-row d-flex align-items-center gap-3 py-2 border-bottom ${isOpen ? '' : 'opacity-50'}"
                 draggable="${!isFiltering}" data-idx="${idx}"
                 ondragstart="rolesDragStart(event)" ondragover="rolesDragOver(event)"
                 ondragleave="rolesDragLeave(event)" ondrop="rolesDrop(event)" ondragend="rolesDragEnd(event)">
      <span class="roles-drag-handle text-muted ${isFiltering ? 'invisible' : ''}" title="Drag to reorder">
        <i class="fas fa-grip-vertical"></i>
      </span>
      <div class="d-flex align-items-center gap-3 flex-wrap flex-grow-1">
        <span class="badge rounded-pill" style="background:${meta.color}18;color:${meta.color};border:1px solid ${meta.color}35;font-size:0.75rem;">${meta.label}</span>
        <span class="fw-semibold">${r.title}</span>
        <span class="badge bg-${tierBadge[r.tier] || 'secondary'}">${tierLabel[r.tier] || r.tier}</span>
        ${r.urgent ? '<span class="badge bg-danger">Urgent</span>' : ''}
        <span class="badge ${isOpen ? 'bg-success' : 'bg-secondary'}">${isOpen ? 'Open' : 'Closed'}</span>
        <small class="text-muted">${r.location || ''}</small>
      </div>
      <div class="d-flex gap-2 flex-shrink-0">
        <button class="btn btn-sm ${isOpen ? 'btn-outline-success' : 'btn-outline-warning'}" title="${isOpen ? 'Close this role' : 'Reopen this role'}" onclick="toggleRoleOpen(${idx})">
          <i class="fas ${isOpen ? 'fa-lock-open' : 'fa-lock'}"></i> ${isOpen ? 'Close' : 'Reopen'}
        </button>
        <button class="btn btn-sm btn-outline-secondary" onclick="openEditRoleModal(${idx})"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteRole(${idx})"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

/* ── Drag-and-drop reorder ───────────────────────────────── */

let _dragSrcIdx = null;

function rolesDragStart(e) {
  _dragSrcIdx = parseInt(e.currentTarget.dataset.idx, 10);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function rolesDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const row = e.currentTarget;
  if (parseInt(row.dataset.idx, 10) !== _dragSrcIdx) {
    row.classList.add('drag-over');
  }
}

function rolesDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function rolesDragEnd(e) {
  document.querySelectorAll('.roles-row').forEach(r => r.classList.remove('dragging', 'drag-over'));
}

async function rolesDrop(e) {
  e.preventDefault();
  const targetIdx = parseInt(e.currentTarget.dataset.idx, 10);
  e.currentTarget.classList.remove('drag-over');
  if (_dragSrcIdx === null || _dragSrcIdx === targetIdx) return;

  const items   = [...rolesData.items];
  const [moved] = items.splice(_dragSrcIdx, 1);
  items.splice(targetIdx, 0, moved);
  _dragSrcIdx = null;

  /* optimistic update */
  rolesData.items = items;
  renderRolesList();

  showLoading('Saving order...');
  try {
    const { sha } = await apiReadJSON(ROLES_PATH);
    await apiWriteJSON(ROLES_PATH, { items }, sha, `Admin: reorder roles`);
  } catch (e) {
    showAlert('danger', `Could not save order: ${e.message}`);
  } finally {
    hideLoading();
  }
}

function onRoleCategoryChange(val) {
  /* auto-populate catLabel/catColor from the selected category — stored invisibly */
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function openNewRoleModal() {
  document.getElementById('role-modal-title').textContent = 'Add New Role';
  document.getElementById('role-edit-index').value = '';
  document.getElementById('role-title').value        = '';
  document.getElementById('role-tier').value         = 'volunteer';
  document.getElementById('role-category').value     = 'operations';
  document.getElementById('role-icon').value         = '';
  document.getElementById('role-urgent').checked     = false;
  document.getElementById('role-location').value     = '';
  document.getElementById('role-commitment').value   = '5–8 hrs/week';
  document.getElementById('role-summary').value      = '';
  document.getElementById('role-about').value        = '';
  document.getElementById('role-responsibilities').value = '';
  document.getElementById('role-requirements').value = '';
  document.getElementById('role-gains').value        = '';
  new bootstrap.Modal(document.getElementById('roleModal')).show();
}

function openEditRoleModal(idx) {
  const r = rolesData.items[idx];
  if (!r) return;
  document.getElementById('role-modal-title').textContent = 'Edit Role';
  document.getElementById('role-edit-index').value        = idx;
  document.getElementById('role-title').value             = r.title || '';
  document.getElementById('role-tier').value              = r.tier  || 'volunteer';
  document.getElementById('role-category').value          = r.category || 'operations';
  document.getElementById('role-icon').value              = r.icon || '';
  document.getElementById('role-urgent').checked          = !!r.urgent;
  document.getElementById('role-location').value          = r.location || '';
  document.getElementById('role-commitment').value        = r.commitment || '';
  document.getElementById('role-summary').value           = r.summary || '';
  document.getElementById('role-about').value             = r.about || '';
  document.getElementById('role-responsibilities').value  = (r.responsibilities || []).join('\n');
  document.getElementById('role-requirements').value      = (r.requirements     || []).join('\n');
  document.getElementById('role-gains').value             = (r.gains            || []).join('\n');
  new bootstrap.Modal(document.getElementById('roleModal')).show();
}

async function saveRole() {
  const title = document.getElementById('role-title').value.trim();
  if (!title) { showAlert('warning', 'Role title is required.'); return; }

  const category = document.getElementById('role-category').value;
  const meta     = CAT_META[category] || { label: category, color: '#555' };

  const splitLines = v => v.split('\n').map(s => s.trim()).filter(Boolean);

  const role = {
    id:              slugify(title),
    title,
    category,
    catLabel:        meta.label,
    catColor:        meta.color,
    icon:            document.getElementById('role-icon').value.trim() || 'fa-hands-helping',
    location:        document.getElementById('role-location').value.trim(),
    commitment:      document.getElementById('role-commitment').value.trim(),
    tier:            document.getElementById('role-tier').value,
    urgent:          document.getElementById('role-urgent').checked,
    summary:         document.getElementById('role-summary').value.trim(),
    about:           document.getElementById('role-about').value.trim(),
    responsibilities: splitLines(document.getElementById('role-responsibilities').value),
    requirements:    splitLines(document.getElementById('role-requirements').value),
    gains:           splitLines(document.getElementById('role-gains').value)
  };

  const idxVal = document.getElementById('role-edit-index').value;
  const idx    = idxVal !== '' ? parseInt(idxVal, 10) : -1;

  const updated = [...rolesData.items];
  if (idx >= 0) {
    role.id = rolesData.items[idx].id || role.id;
    updated[idx] = role;
  } else {
    /* ensure unique id */
    let base = role.id, n = 2;
    while (updated.find(r => r.id === role.id)) role.id = `${base}-${n++}`;
    updated.push(role);
  }

  showLoading('Saving role...');
  try {
    const { sha } = await apiReadJSON(ROLES_PATH);
    await apiWriteJSON(ROLES_PATH, { items: updated }, sha, `Admin: ${idx >= 0 ? 'update' : 'add'} role "${title}"`);
    rolesData.items = updated;
    rolesData.sha   = null;
    bootstrap.Modal.getInstance(document.getElementById('roleModal'))?.hide();
    renderRolesList();
    showAlert('success', `Role "${title}" saved successfully.`);
  } catch (e) {
    showAlert('danger', `Save failed: ${e.message}`);
  } finally {
    hideLoading();
  }
}

async function deleteRole(idx) {
  const r = rolesData.items[idx];
  if (!r) return;
  if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;

  showLoading('Deleting role...');
  try {
    const { data, sha } = await apiReadJSON(ROLES_PATH);
    const updated = (data.items || []).filter((_, i) => i !== idx);
    await apiWriteJSON(ROLES_PATH, { items: updated }, sha, `Admin: delete role "${r.title}"`);
    rolesData.items = updated;
    renderRolesList();
    showAlert('success', `Role "${r.title}" deleted.`);
  } catch (e) {
    showAlert('danger', `Delete failed: ${e.message}`);
  } finally {
    hideLoading();
  }
}

async function toggleRoleOpen(idx) {
  const r = rolesData.items[idx];
  if (!r) return;
  const nowOpen = r.open === false;

  showLoading(nowOpen ? 'Reopening role...' : 'Closing role...');
  try {
    const { data, sha } = await apiReadJSON(ROLES_PATH);
    const updated = data.items.map((item, i) => i === idx ? { ...item, open: nowOpen } : item);
    await apiWriteJSON(ROLES_PATH, { items: updated }, sha, `Admin: ${nowOpen ? 'reopen' : 'close'} role "${r.title}"`);
    rolesData.items = updated;
    renderRolesList();
    showAlert('success', `"${r.title}" is now ${nowOpen ? 'open' : 'closed'} for applications.`);
  } catch (e) {
    showAlert('danger', `Failed: ${e.message}`);
  } finally {
    hideLoading();
  }
}

/* ═══════════════════════════════════════════════════════════
   VENUE HIRE
   ═══════════════════════════════════════════════════════════ */

let vhBookings = [];
let vhCurrent  = null;

const VH_STATUS_BADGE = {
  pending:   'bg-warning text-dark',
  confirmed: 'bg-success',
  cancelled: 'bg-danger',
  completed: 'bg-secondary'
};

function fmtDateVh(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

async function apiVh(body) {
  const token = getSession();
  const r = await fetch('/api/venue-hire', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...body, token })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function loadVenueHire() {
  document.getElementById('vh-tbody').innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading…</td></tr>';
  try {
    vhBookings = await apiVh({ action: 'list' });
    updateVhStats();
    renderVhTable();
  } catch (e) {
    document.getElementById('vh-tbody').innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Failed to load: ${e.message}</td></tr>`;
  }
}

function updateVhStats() {
  const total     = vhBookings.length;
  const pending   = vhBookings.filter(b => b.status === 'pending').length;
  const confirmed = vhBookings.filter(b => b.status === 'confirmed').length;
  const cancelled = vhBookings.filter(b => b.status === 'cancelled').length;
  document.getElementById('vh-stat-total').textContent     = total;
  document.getElementById('vh-stat-pending').textContent   = pending;
  document.getElementById('vh-stat-confirmed').textContent = confirmed;
  document.getElementById('vh-stat-cancelled').textContent = cancelled;
}

function renderVhTable() {
  const q      = (document.getElementById('vh-search')?.value || '').toLowerCase();
  const status = document.getElementById('vh-filter-status')?.value || '';
  const filtered = vhBookings.filter(b => {
    if (status && b.status !== status) return false;
    if (q && !`${b.org_name} ${b.responsible_person} ${b.booking_ref} ${b.event_name}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (!filtered.length) {
    document.getElementById('vh-tbody').innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No bookings found.</td></tr>';
    return;
  }

  document.getElementById('vh-tbody').innerHTML = filtered.map(b => {
    const badge = VH_STATUS_BADGE[b.status] || 'bg-secondary';
    return `<tr>
      <td><code style="font-size:12px">${b.booking_ref || '—'}</code></td>
      <td>${b.org_name || '—'}</td>
      <td><div style="font-size:13px">${b.responsible_person || '—'}</div><small class="text-muted">${b.email || ''}</small></td>
      <td>${b.event_name || '—'}</td>
      <td>${fmtDateVh(b.event_date)}</td>
      <td>${fmtDateVh(b.created_at)}</td>
      <td><span class="badge ${badge} text-capitalize">${b.status || 'pending'}</span></td>
      <td><button class="btn btn-outline-success btn-sm" onclick="openVhModal('${b.id}')"><i class="fas fa-eye"></i></button></td>
    </tr>`;
  }).join('');
}

async function openVhModal(id) {
  const modalEl = document.getElementById('vhModal');
  const modal   = bootstrap.Modal.getOrCreate(modalEl);
  document.getElementById('vhModalLabel').innerHTML = '<i class="fas fa-building text-success me-2"></i>Venue Hire Booking';
  document.getElementById('vhModalBody').innerHTML  = '<p class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading…</p>';
  modal.show();

  try {
    const b = await apiVh({ action: 'get', id });
    vhCurrent = b;

    const f  = b.financials   || {};
    const ac = b.admin_checks || {};
    const sup = b.suppliers   || {};

    document.getElementById('vhModalLabel').innerHTML = `<i class="fas fa-building text-success me-2"></i>${b.booking_ref || '—'} — ${b.org_name}`;

    const badge = VH_STATUS_BADGE[b.status] || 'bg-secondary';

    document.getElementById('vhModalBody').innerHTML = `
    <!-- Status bar -->
    <div class="d-flex align-items-center gap-3 mb-4 p-3 bg-light rounded">
      <span class="badge ${badge} fs-6 text-capitalize">${b.status || 'pending'}</span>
      <select class="form-select form-select-sm" id="vh-status-sel" style="max-width:180px">
        <option value="pending"   ${b.status==='pending'   ? 'selected':''}>Pending</option>
        <option value="confirmed" ${b.status==='confirmed' ? 'selected':''}>Confirmed</option>
        <option value="cancelled" ${b.status==='cancelled' ? 'selected':''}>Cancelled</option>
        <option value="completed" ${b.status==='completed' ? 'selected':''}>Completed</option>
      </select>
      <small class="text-muted ms-auto">Submitted: ${fmtDateVh(b.created_at)}</small>
    </div>

    <!-- Nav tabs -->
    <ul class="nav nav-tabs mb-4" id="vhDetailTabs">
      <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#vhTabDetails">Booking Details</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#vhTabFinance">Financial Summary</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#vhTabChecks">Admin Checklist</button></li>
    </ul>
    <div class="tab-content">

      <!-- Booking Details -->
      <div class="tab-pane fade show active" id="vhTabDetails">
        <div class="row g-4">
          <div class="col-md-6">
            <h6 class="text-success fw-bold border-bottom pb-2">A. Hirer Details</h6>
            <dl class="row small mb-0">
              <dt class="col-5">Organisation</dt><dd class="col-7">${b.org_name}</dd>
              <dt class="col-5">Responsible</dt><dd class="col-7">${b.responsible_person}</dd>
              <dt class="col-5">Address</dt><dd class="col-7">${(b.address||'—').replace(/\n/g,'<br>')}</dd>
              <dt class="col-5">Telephone</dt><dd class="col-7">${b.telephone||'—'}</dd>
              <dt class="col-5">Email</dt><dd class="col-7"><a href="mailto:${b.email}">${b.email}</a></dd>
            </dl>
          </div>
          <div class="col-md-6">
            <h6 class="text-success fw-bold border-bottom pb-2">B. Event Details</h6>
            <dl class="row small mb-0">
              <dt class="col-5">Event Name</dt><dd class="col-7">${b.event_name||'—'}</dd>
              <dt class="col-5">Type</dt><dd class="col-7">${b.event_type||'—'}</dd>
              <dt class="col-5">Date</dt><dd class="col-7">${fmtDateVh(b.event_date)}</dd>
              <dt class="col-5">Attendance</dt><dd class="col-7">${b.expected_attendance||'—'}</dd>
              <dt class="col-5">Setup from</dt><dd class="col-7">${b.setup_time||'—'}</dd>
              <dt class="col-5">Start</dt><dd class="col-7">${b.event_start_time||'—'}</dd>
              <dt class="col-5">Finish</dt><dd class="col-7">${b.event_finish_time||'—'}</dd>
            </dl>
          </div>
          <div class="col-md-6">
            <h6 class="text-success fw-bold border-bottom pb-2">C. External Suppliers</h6>
            <dl class="row small mb-0">
              <dt class="col-5">Caterer</dt><dd class="col-7">${sup.caterer||'—'}</dd>
              <dt class="col-5">DJ</dt><dd class="col-7">${sup.dj||'—'}</dd>
              <dt class="col-5">Decorator</dt><dd class="col-7">${sup.decorator||'—'}</dd>
              <dt class="col-5">Photographer</dt><dd class="col-7">${sup.photographer||'—'}</dd>
              <dt class="col-5">Security</dt><dd class="col-7">${sup.security||'—'}</dd>
              <dt class="col-5">Other</dt><dd class="col-7">${sup.other||'—'}</dd>
            </dl>
          </div>
          <div class="col-md-6">
            <h6 class="text-success fw-bold border-bottom pb-2">D. Insurance Details</h6>
            <dl class="row small mb-0">
              <dt class="col-5">Company</dt><dd class="col-7">${b.insurance_company||'—'}</dd>
              <dt class="col-5">Policy No.</dt><dd class="col-7">${b.policy_number||'—'}</dd>
              <dt class="col-5">PL Cover</dt><dd class="col-7">${b.public_liability_cover||'—'}</dd>
              <dt class="col-5">Expires</dt><dd class="col-7">${fmtDateVh(b.insurance_expiry)}</dd>
              <dt class="col-5">Premises</dt><dd class="col-7">${b.damage_premises_covered ? '✅ Yes' : '❌ No'}</dd>
              <dt class="col-5">Fixtures</dt><dd class="col-7">${b.damage_fixtures_covered ? '✅ Yes' : '❌ No'}</dd>
              <dt class="col-5">Evidence</dt><dd class="col-7">${b.insurance_evidence_supplied ? '✅ Supplied' : '⏳ Pending'}</dd>
            </dl>
          </div>
          <div class="col-12">
            <h6 class="text-success fw-bold border-bottom pb-2">F. Declaration</h6>
            <dl class="row small mb-0">
              <dt class="col-3">Name</dt><dd class="col-9">${b.declarant_name||'—'}</dd>
              <dt class="col-3">Position</dt><dd class="col-9">${b.declarant_position||'—'}</dd>
              <dt class="col-3">Agreed</dt><dd class="col-9">${b.declaration_agreed ? '✅ Yes' : '❌ No'} on ${fmtDateVh(b.declaration_date)}</dd>
            </dl>
          </div>
        </div>
      </div>

      <!-- Financial Summary -->
      <div class="tab-pane fade" id="vhTabFinance">
        <p class="text-muted small mb-3">Record the financial details for this booking. These are internal notes only.</p>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold small">Hire Fee (£)</label>
            <input type="number" class="form-control" id="vh-fin-fee" value="${f.fee||''}" placeholder="0.00" step="0.01">
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold small">Security Deposit (£)</label>
            <input type="number" class="form-control" id="vh-fin-deposit" value="${f.deposit||''}" placeholder="0.00" step="0.01">
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold small">Amount Paid (£)</label>
            <input type="number" class="form-control" id="vh-fin-paid" value="${f.paid||''}" placeholder="0.00" step="0.01">
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold small">Balance Outstanding (£)</label>
            <input type="number" class="form-control" id="vh-fin-balance" value="${f.balance||''}" placeholder="0.00" step="0.01">
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold small">Payment Method</label>
            <select class="form-select" id="vh-fin-method">
              <option value="">— Select —</option>
              <option ${f.payment_method==='Bank Transfer'?'selected':''}>Bank Transfer</option>
              <option ${f.payment_method==='Card'?'selected':''}>Card</option>
              <option ${f.payment_method==='Cash'?'selected':''}>Cash</option>
              <option ${f.payment_method==='Cheque'?'selected':''}>Cheque</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold small">Invoice Number</label>
            <input type="text" class="form-control" id="vh-fin-invoice" value="${f.invoice_no||''}" placeholder="e.g. INV-2026-001">
          </div>
          <div class="col-12">
            <label class="form-label fw-semibold small">Payment Notes</label>
            <textarea class="form-control" id="vh-fin-notes" rows="2" placeholder="Any additional payment notes">${f.notes||''}</textarea>
          </div>
        </div>
      </div>

      <!-- Admin Checklist -->
      <div class="tab-pane fade" id="vhTabChecks">
        <p class="text-muted small mb-3">Track the internal admin steps for this booking.</p>
        ${[
          ['insurance_received',  'Insurance certificate received'],
          ['deposit_paid',        'Security deposit paid'],
          ['balance_paid',        'Full balance received'],
          ['room_allocated',      'Room / space confirmed and allocated'],
          ['key_issued',          'Keys / access arranged'],
          ['risk_assessed',       'Risk assessment reviewed'],
          ['suppliers_approved',  'External suppliers approved'],
          ['post_event_check',    'Post-event inspection completed'],
          ['deposit_returned',    'Security deposit returned / cleared'],
        ].map(([k, label]) => `
          <div class="form-check form-switch mb-3">
            <input class="form-check-input" type="checkbox" id="vh-chk-${k}" ${ac[k] ? 'checked' : ''} style="cursor:pointer">
            <label class="form-check-label" for="vh-chk-${k}">${label}</label>
          </div>`).join('')}
        <div class="mt-4">
          <label class="form-label fw-semibold small">Admin Notes</label>
          <textarea class="form-control" id="vh-admin-notes" rows="4" placeholder="Internal notes for this booking">${b.admin_notes||''}</textarea>
        </div>
      </div>
    </div>`;

  } catch (e) {
    document.getElementById('vhModalBody').innerHTML = `<p class="text-danger py-4 text-center">Failed to load booking: ${e.message}</p>`;
  }
}

async function saveVhAdmin() {
  if (!vhCurrent) return;

  const f  = vhCurrent.financials   || {};
  const ac = vhCurrent.admin_checks || {};

  const financials = {
    fee:            document.getElementById('vh-fin-fee')?.value     || f.fee,
    deposit:        document.getElementById('vh-fin-deposit')?.value || f.deposit,
    paid:           document.getElementById('vh-fin-paid')?.value    || f.paid,
    balance:        document.getElementById('vh-fin-balance')?.value || f.balance,
    payment_method: document.getElementById('vh-fin-method')?.value  || f.payment_method,
    invoice_no:     document.getElementById('vh-fin-invoice')?.value || f.invoice_no,
    notes:          document.getElementById('vh-fin-notes')?.value   || f.notes
  };

  const checkKeys = ['insurance_received','deposit_paid','balance_paid','room_allocated','key_issued','risk_assessed','suppliers_approved','post_event_check','deposit_returned'];
  const admin_checks = {};
  checkKeys.forEach(k => {
    const el = document.getElementById(`vh-chk-${k}`);
    admin_checks[k] = el ? el.checked : (ac[k] || false);
  });

  const status      = document.getElementById('vh-status-sel')?.value || vhCurrent.status;
  const admin_notes = document.getElementById('vh-admin-notes')?.value ?? vhCurrent.admin_notes;

  showLoading('Saving…');
  try {
    await apiVh({ action: 'update_admin', id: vhCurrent.id, financials, admin_checks, status, admin_notes });
    showAlert('success', 'Booking updated successfully.');
    bootstrap.Modal.getInstance(document.getElementById('vhModal'))?.hide();
    loadVenueHire();
  } catch (e) {
    showAlert('danger', `Failed: ${e.message}`);
  } finally {
    hideLoading();
  }
}

/* ═══════════════════════════════════════════════════════════
   VOLUNTEER EXPENSES
   ═══════════════════════════════════════════════════════════ */

let veExpenses = [];
let veCurrent  = null;

const VE_STATUS_BADGE = {
  pending:  'bg-warning text-dark',
  approved: 'bg-primary',
  paid:     'bg-success',
  rejected: 'bg-danger'
};

const VE_TRANSPORT_LABEL = { car: 'Own Car', public: 'Bus / Train', both: 'Both' };

function fmtDateVe(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

async function loadVolExpenses() {
  document.getElementById('ve-tbody').innerHTML =
    '<tr><td colspan="8" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading…</td></tr>';
  try {
    const rows = await apiCall('export_data', { type: 'volunteer_expenses', date_from: null, date_to: null });
    veExpenses = Array.isArray(rows) ? rows : [];
    updateVeStats();
    renderVeTable();
  } catch (e) {
    document.getElementById('ve-tbody').innerHTML =
      `<tr><td colspan="8" class="text-center text-danger py-4">Failed to load: ${e.message}</td></tr>`;
  }
}

function updateVeStats() {
  document.getElementById('ve-stat-total').textContent    = veExpenses.length;
  document.getElementById('ve-stat-pending').textContent  = veExpenses.filter(r => (r.status || 'pending') === 'pending').length;
  document.getElementById('ve-stat-approved').textContent = veExpenses.filter(r => r.status === 'approved').length;
  document.getElementById('ve-stat-paid').textContent     = veExpenses.filter(r => r.status === 'paid').length;
}

function renderVeTable() {
  const q      = (document.getElementById('ve-search')?.value || '').toLowerCase();
  const status = document.getElementById('ve-filter-status')?.value || '';
  const filtered = veExpenses.filter(r => {
    const rowStatus = r.status || 'pending';
    if (status && rowStatus !== status) return false;
    const searchable = `${r.first_name} ${r.last_name} ${r.email}`.toLowerCase();
    if (q && !searchable.includes(q)) return false;
    return true;
  });

  if (!filtered.length) {
    document.getElementById('ve-tbody').innerHTML =
      '<tr><td colspan="8" class="text-center text-muted py-4">No claims found.</td></tr>';
    return;
  }

  document.getElementById('ve-tbody').innerHTML = filtered.map(r => {
    const rowStatus = r.status || 'pending';
    const badge     = VE_STATUS_BADGE[rowStatus] || 'bg-secondary';
    const transport = VE_TRANSPORT_LABEL[r.transport_type] || r.transport_type || '—';
    const total     = r.total_amount != null ? `£${parseFloat(r.total_amount).toFixed(2)}` : '—';
    const receipt   = r.receipt_url
      ? `<a href="${r.receipt_url}" target="_blank" class="btn btn-outline-secondary btn-sm py-0"><i class="fas fa-file-alt"></i></a>`
      : '<span class="text-muted small">None</span>';
    return `<tr>
      <td>
        <div class="fw-semibold">${r.first_name || ''} ${r.last_name || ''}</div>
        <small class="text-muted">${r.email || ''}</small>
      </td>
      <td class="text-nowrap small">${fmtDateVe(r.period_start)}${r.period_end && r.period_end !== r.period_start ? '<br>' + fmtDateVe(r.period_end) : ''}</td>
      <td><span class="badge bg-light text-dark border">${transport}</span></td>
      <td class="fw-bold text-success">${total}</td>
      <td class="text-nowrap small">${fmtDateVe(r.created_at)}</td>
      <td>${receipt}</td>
      <td><span class="badge ${badge} text-capitalize">${rowStatus}</span></td>
      <td><button class="btn btn-outline-success btn-sm" onclick="openVeModal('${r.id}')"><i class="fas fa-eye"></i></button></td>
    </tr>`;
  }).join('');
}

function openVeModal(id) {
  const r = veExpenses.find(x => x.id === id);
  if (!r) return;
  veCurrent = r;

  const rowStatus = r.status || 'pending';
  const badge     = VE_STATUS_BADGE[rowStatus] || 'bg-secondary';
  const transport = VE_TRANSPORT_LABEL[r.transport_type] || r.transport_type || '—';
  const carAmt    = r.car_reimbursement  != null ? `£${parseFloat(r.car_reimbursement).toFixed(2)}`  : null;
  const pubAmt    = r.public_transport_cost != null ? `£${parseFloat(r.public_transport_cost).toFixed(2)}` : null;
  const total     = r.total_amount != null ? `£${parseFloat(r.total_amount).toFixed(2)}` : '—';

  document.getElementById('veModalLabel').innerHTML =
    `<i class="fas fa-receipt text-success me-2"></i>${r.first_name} ${r.last_name} — Expense Claim`;

  document.getElementById('veModalBody').innerHTML = `
    <!-- Status bar -->
    <div class="d-flex align-items-center gap-3 mb-4 p-3 bg-light rounded flex-wrap">
      <span class="badge ${badge} fs-6 text-capitalize">${rowStatus}</span>
      <select class="form-select form-select-sm" id="ve-status-sel" style="max-width:180px">
        <option value="pending"  ${rowStatus==='pending'  ? 'selected':''}>Pending</option>
        <option value="approved" ${rowStatus==='approved' ? 'selected':''}>Approved</option>
        <option value="paid"     ${rowStatus==='paid'     ? 'selected':''}>Paid</option>
        <option value="rejected" ${rowStatus==='rejected' ? 'selected':''}>Rejected</option>
      </select>
      <small class="text-muted ms-auto">Submitted: ${fmtDateVe(r.created_at)}</small>
    </div>

    <div class="row g-4">
      <!-- Volunteer details -->
      <div class="col-md-6">
        <h6 class="text-success fw-bold border-bottom pb-2">Volunteer Details</h6>
        <dl class="row small mb-0">
          <dt class="col-5">Name</dt>        <dd class="col-7">${r.first_name || ''} ${r.last_name || ''}</dd>
          <dt class="col-5">Email</dt>       <dd class="col-7"><a href="mailto:${r.email}">${r.email || '—'}</a></dd>
          <dt class="col-5">Phone</dt>       <dd class="col-7">${r.phone || '—'}</dd>
          <dt class="col-5">Account No.</dt> <dd class="col-7">${r.account_number || '<span class="text-muted">Not provided</span>'}</dd>
          <dt class="col-5">Sort Code</dt>   <dd class="col-7">${r.sort_code || '<span class="text-muted">Not provided</span>'}</dd>
        </dl>
      </div>

      <!-- Claim details -->
      <div class="col-md-6">
        <h6 class="text-success fw-bold border-bottom pb-2">Travel Claim</h6>
        <dl class="row small mb-0">
          <dt class="col-5">Period</dt>      <dd class="col-7">${fmtDateVe(r.period_start)} – ${fmtDateVe(r.period_end)}</dd>
          <dt class="col-5">Transport</dt>   <dd class="col-7">${transport}</dd>
          ${r.from_location ? `<dt class="col-5">From</dt><dd class="col-7">${r.from_location}</dd>` : ''}
          ${r.to_location   ? `<dt class="col-5">To</dt><dd class="col-7">${r.to_location}</dd>`     : ''}
          ${r.total_miles   ? `<dt class="col-5">Miles</dt><dd class="col-7">${r.total_miles} mi</dd>` : ''}
          ${carAmt          ? `<dt class="col-5">Car (45p/mi)</dt><dd class="col-7 fw-semibold">${carAmt}</dd>` : ''}
          ${pubAmt          ? `<dt class="col-5">Bus/Train</dt><dd class="col-7 fw-semibold">${pubAmt}</dd>` : ''}
          <dt class="col-5 fw-bold">Total</dt><dd class="col-7 fw-bold text-success fs-6">${total}</dd>
        </dl>
      </div>

      <!-- Receipt -->
      <div class="col-12">
        <h6 class="text-success fw-bold border-bottom pb-2">Receipt &amp; Notes</h6>
        ${r.receipt_url
          ? `<a href="${r.receipt_url}" target="_blank" class="btn btn-outline-secondary btn-sm mb-3"><i class="fas fa-file-alt me-1"></i>View Receipt / Ticket</a>`
          : '<p class="text-muted small mb-2">No receipt uploaded.</p>'}
        ${r.notes ? `<p class="small text-muted mb-3"><strong>Volunteer notes:</strong> ${r.notes}</p>` : ''}
      </div>

      <!-- Admin notes -->
      <div class="col-12">
        <label class="form-label fw-semibold small">Admin Notes</label>
        <textarea class="form-control" id="ve-admin-notes" rows="3" placeholder="Internal notes — payment reference, approval reason, etc.">${r.admin_notes || ''}</textarea>
      </div>
    </div>`;

  bootstrap.Modal.getOrCreate(document.getElementById('veModal')).show();
}

async function saveVeAdmin() {
  if (!veCurrent) return;
  const status      = document.getElementById('ve-status-sel')?.value || veCurrent.status;
  const admin_notes = document.getElementById('ve-admin-notes')?.value ?? veCurrent.admin_notes;

  showLoading('Saving…');
  try {
    await apiCall('update_expense', { id: veCurrent.id, status, admin_notes });
    showAlert('success', 'Expense claim updated.');
    bootstrap.Modal.getInstance(document.getElementById('veModal'))?.hide();
    loadVolExpenses();
  } catch (e) {
    showAlert('danger', `Failed: ${e.message}`);
  } finally {
    hideLoading();
  }
}
