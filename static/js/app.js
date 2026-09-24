
// ----------------- LIVE CAMERA SYSTEM -----------------
let activeCameraStream = null;

function openCameraModal(targetInputId, previewContainerId, previewImgId, onCapturedCallback) {
  const container = document.getElementById("camera-modal-container");
  container.innerHTML = `
    <div class="modal-overlay active" id="active-camera-overlay" style="z-index: 99999;">
      <div class="modal-content" style="max-width: 480px; text-align: center;">
        <div class="modal-header">
          <h3>📷 Capture Live Photo</h3>
          <button class="modal-close" onclick="closeCameraModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding: 16px;">
          <div style="width: 100%; height: 320px; background: #000; border-radius: 12px; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center;">
            <video id="camera-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
            <canvas id="camera-canvas" style="display: none;"></canvas>
            <div id="camera-loading" style="position: absolute; color: white; font-size: 14px;">Starting camera...</div>
          </div>
          <div style="margin-top: 14px; display: flex; justify-content: center; gap: 12px;">
            <button type="button" class="btn btn-secondary" onclick="closeCameraModal()">Cancel</button>
            <button type="button" class="btn btn-primary" id="snap-btn" style="padding: 10px 24px; font-weight: 700;" onclick="takeSnapshot('${targetInputId}', '${previewContainerId}', '${previewImgId}', ${onCapturedCallback ? onCapturedCallback : 'null'})">
              📸 Capture Photo
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Start webcam / phone camera
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } }, audio: false })
    .then(stream => {
      activeCameraStream = stream;
      const video = document.getElementById("camera-video");
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          const loading = document.getElementById("camera-loading");
          if (loading) loading.style.display = "none";
        };
      }
    })
    .catch(err => {
      alert("Unable to access camera: " + err.message + ". Please allow camera permissions in your browser.");
      closeCameraModal();
    });
}

function takeSnapshot(targetInputId, previewContainerId, previewImgId, callback) {
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");
  if (!video || !canvas) return;

  const size = Math.min(video.videoWidth || 400, video.videoHeight || 400);
  canvas.width = 250;
  canvas.height = 250;
  const ctx = canvas.getContext("2d");

  // Center crop square
  const sx = ((video.videoWidth || 400) - size) / 2;
  const sy = ((video.videoHeight || 400) - size) / 2;
  ctx.drawImage(video, sx, sy, size, size, 0, 0, 250, 250);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);

  if (targetInputId) {
    const inp = document.getElementById(targetInputId);
    if (inp) inp.value = dataUrl;
  }

  if (previewContainerId && previewImgId) {
    const prevC = document.getElementById(previewContainerId);
    const prevImg = document.getElementById(previewImgId);
    if (prevImg) prevImg.src = dataUrl;
    if (prevC) prevC.style.display = "flex";
  }

  closeCameraModal();

  if (typeof callback === 'function') {
    callback(dataUrl);
  }
}

function closeCameraModal() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
  const overlay = document.getElementById("active-camera-overlay");
  if (overlay) overlay.remove();
}

// Courier Office Employee Management System - Modern Client SPA Logic

const API_BASE = "/api";
let currentUser = null;
let currentView = "dashboard";
let charts = {};

// Helper: Format Indian Rupee Currency
function formatCurrency(amount) {
  const val = Number(amount) || 0;
  return "₹" + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper: Format Date to DD/MM/YYYY
function formatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return dateStr;
  }
}

// Live Clock
function startClock() {
  const clockEl = document.getElementById("live-time-display");
  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.innerText = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    }
  }
  update();
  setInterval(update, 1000);
}

// Toast Notifications
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <div style="flex:1;">${message}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal System
function openModal(title, bodyHtml, footerHtml = "", customClass = "") {
  const container = document.getElementById("modal-container");
  container.innerHTML = `
    <div class="modal-overlay active" id="active-modal-overlay">
      <div class="modal-content ${customClass}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}
      </div>
    </div>
  `;
}

function closeModal() {
  const overlay = document.getElementById("active-modal-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    setTimeout(() => { overlay.remove(); }, 200);
  }
}

// Fetch with JWT
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem("courier_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(API_BASE + endpoint, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem("courier_token");
    localStorage.removeItem("courier_user");
    initAuth();
    throw new Error("Session expired. Please log in again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "An error occurred");
  }
  return data;
}

// Auth Handlers
function switchAuthTab(tab) {
  const loginC = document.getElementById("login-container");
  const regC = document.getElementById("register-container");
  const tabLog = document.getElementById("tab-login-btn");
  const tabReg = document.getElementById("tab-register-btn");

  if (tab === "login") {
    loginC.style.display = "block";
    regC.style.display = "none";
    tabLog.style.background = "white";
    tabLog.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
    tabReg.style.background = "transparent";
    tabReg.style.boxShadow = "none";
  } else {
    loginC.style.display = "none";
    regC.style.display = "block";
    tabReg.style.background = "white";
    tabReg.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
    tabLog.style.background = "transparent";
    tabLog.style.boxShadow = "none";
  }
}

function showDemoCredentials() {
  openModal("Quick Demo Credentials", `
    <p style="margin-bottom: 14px; font-size: 13.5px; color: #64748b;">Click any role to autofill login credentials instantly:</p>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <button class="btn btn-secondary" style="justify-content: space-between;" onclick="autofillLogin('admin', 'Admin@123')">
        <span>👨‍💼 <strong>Hub Admin</strong> (Full Management)</span>
        <code>admin / Admin@123</code>
      </button>
      <button class="btn btn-secondary" style="justify-content: space-between;" onclick="autofillLogin('EMP-0001', 'Worker@123')">
        <span>🛵 <strong>Ravi Kumar</strong> (Senior Dispatcher)</span>
        <code>EMP-0001 / Worker@123</code>
      </button>
      <button class="btn btn-secondary" style="justify-content: space-between;" onclick="autofillLogin('EMP-0002', 'Worker@123')">
        <span>📦 <strong>Amit Sharma</strong> (Delivery Rider)</span>
        <code>EMP-0002 / Worker@123</code>
      </button>
    </div>
  `);
}

function autofillLogin(u, p) {
  document.getElementById("login-username").value = u;
  document.getElementById("login-password").value = p;
  closeModal();
}

async function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById("login-username").value;
  const p = document.getElementById("login-password").value;

  try {
    const res = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username_or_email: u, password: p })
    });
    localStorage.setItem("courier_token", res.access_token);
    localStorage.setItem("courier_user", JSON.stringify(res.user));
    currentUser = res.user;
    showToast(`Welcome back, ${res.user.name}!`, "success");
    initApp();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Photo Helper: Compress and convert image file to Base64 data URL
function previewRegisterPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 250;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      document.getElementById("reg-photo-base64").value = dataUrl;
      const previewDiv = document.getElementById("reg-photo-preview");
      const previewImg = document.getElementById("reg-photo-img");
      if (previewDiv && previewImg) {
        previewImg.src = dataUrl;
        previewDiv.style.display = "flex";
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function handleRegister(e) {
  e.preventDefault();
  const photoBase64 = document.getElementById("reg-photo-base64") ? document.getElementById("reg-photo-base64").value : null;
  const payload = {
    name: document.getElementById("reg-name").value,
    email: document.getElementById("reg-email").value,
    phone: document.getElementById("reg-phone").value,
    position: document.getElementById("reg-position").value,
    expected_salary: parseFloat(document.getElementById("reg-salary").value),
    address: document.getElementById("reg-address").value,
    password: document.getElementById("reg-password").value,
    profile_image: photoBase64 || null
  };

  try {
    const res = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast(res.message, "success");
    switchAuthTab("login");
    document.getElementById("login-username").value = res.employee_code;
    document.getElementById("login-password").value = payload.password;
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleLogout() {
  localStorage.removeItem("courier_token");
  localStorage.removeItem("courier_user");
  currentUser = null;
  initAuth();
  showToast("Logged out successfully.", "info");
}

// Helper: Render Avatar (Image or Initial)
function renderAvatarHtml(name, profileImage, size = 40, fontSize = 16) {
  if (profileImage) {
    return `<img src="${profileImage}" alt="${name}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.2);">`;
  }
  return `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: #2563eb; color: white; display: flex; align-items: center; justify-content: center; font-size: ${fontSize}px; font-weight: 700;">${(name || 'U').charAt(0).toUpperCase()}</div>`;
}

// Initialize Application UI
async function initApp() {
  const token = localStorage.getItem("courier_token");
  const storedUser = localStorage.getItem("courier_user");

  if (!token || !storedUser) {
    initAuth();
    return;
  }

  currentUser = JSON.parse(storedUser);

  // Sync profile details
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "flex";

  document.getElementById("sidebar-role-badge").innerText = currentUser.role === "ADMIN" ? "Courier Hub Admin" : "Worker Portal";
  document.getElementById("sidebar-user-name").innerText = currentUser.name;
  document.getElementById("sidebar-user-sub").innerText = currentUser.position || currentUser.role;

  // Set avatars
  const sidebarAvatar = document.getElementById("sidebar-user-avatar");
  if (sidebarAvatar) {
    if (currentUser.profile_image) {
      sidebarAvatar.innerHTML = `<img src="${currentUser.profile_image}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
      sidebarAvatar.innerText = currentUser.name.charAt(0).toUpperCase();
    }
  }

  const topbarAvatar = document.getElementById("topbar-avatar");
  if (topbarAvatar) {
    if (currentUser.profile_image) {
      topbarAvatar.innerHTML = `<img src="${currentUser.profile_image}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
      topbarAvatar.innerText = currentUser.name.charAt(0).toUpperCase();
    }
  }

  document.getElementById("topbar-name").innerText = currentUser.name;

  buildSidebarNavigation();
  startClock();
  fetchUnreadNotificationCount();

  // Navigate to initial view
  navigateTo(currentUser.role === "ADMIN" ? "dashboard" : "worker_dashboard");
}

function initAuth() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app-screen").style.display = "none";
}

// Build Sidebar Navigation
function buildSidebarNavigation() {
  const menu = document.getElementById("sidebar-menu");
  menu.innerHTML = "";

  const adminNav = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "employees", label: "Employees", icon: "👥" },
    { id: "attendance", label: "Attendance", icon: "⏱️" },
    { id: "salary", label: "Salary Management", icon: "💰" },
    { id: "advances", label: "Advances", icon: "💸" },
    { id: "reports", label: "Reports", icon: "📑" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "audit", label: "Audit Logs", icon: "🛡️" },
    { id: "settings", label: "Settings", icon: "⚙️" }
  ];

  const workerNav = [
    { id: "worker_dashboard", label: "Dashboard", icon: "🚚" },
    { id: "worker_attendance", label: "My Attendance", icon: "⏱️" },
    { id: "worker_salary", label: "My Salary", icon: "💰" },
    { id: "worker_advances", label: "My Advances", icon: "💸" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "worker_profile", label: "My Profile", icon: "👤" }
  ];

  const items = currentUser.role === "ADMIN" ? adminNav : workerNav;

  items.forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = `
      <a class="nav-item ${item.id === currentView ? 'active' : ''}" onclick="navigateTo('${item.id}')">
        <span style="font-size: 16px;">${item.icon}</span>
        <span>${item.label}</span>
      </a>
    `;
    menu.appendChild(li);
  });
}

function navigateTo(viewId) {
  currentView = viewId;
  buildSidebarNavigation();

  // Update Topbar
  const titles = {
    dashboard: ["Admin Dashboard", "Courier Hub operations, attendance summary & financial statistics"],
    employees: ["Employee Management", "Directory, recruitment onboarding, status control & profile details"],
    attendance: ["Attendance Management", "Daily logs, check-in/out stamps, working hours & administrative override"],
    salary: ["Salary Management", "Automatic absence & half-day deductions, monthly payroll generation & payments"],
    advances: ["Employee Advances", "Record advances, calculate balance deductions & view employee logs"],
    reports: ["Courier Hub Reports", "Export attendance logs, payroll statements and outstanding advances"],
    notifications: ["Notification Center", "In-app alerts for salary, attendance corrections, and advances"],
    audit: ["System Audit Log", "Immutable administrative record of financial and personnel changes"],
    settings: ["System Settings", "Configure working days, weekly holidays, and deduction formulas"],
    worker_dashboard: ["Worker Dashboard", "Log daily shift attendance, view current earnings & announcements"],
    worker_attendance: ["My Attendance Log", "Your verified shift timings and working hours record"],
    worker_salary: ["My Salary Statement", "Transparent breakdown of base salary, absence deductions & net pay"],
    worker_advances: ["My Advance History", "Record of money taken and deductions against payroll"],
    worker_profile: ["My Employee Profile", "Courier department details, salary info & contact details"]
  };

  const t = titles[viewId] || ["Dashboard", "System Overview"];
  document.getElementById("topbar-title").innerText = t[0];
  document.getElementById("topbar-subtitle").innerText = t[1];

  const viewC = document.getElementById("view-container");

  // Render Target View
  if (viewId === "dashboard") renderAdminDashboard(viewC);
  else if (viewId === "employees") renderEmployeesView(viewC);
  else if (viewId === "attendance") renderAttendanceView(viewC);
  else if (viewId === "salary") renderSalaryView(viewC);
  else if (viewId === "advances") renderAdvancesView(viewC);
  else if (viewId === "reports") renderReportsView(viewC);
  else if (viewId === "notifications") renderNotificationsView(viewC);
  else if (viewId === "audit") renderAuditView(viewC);
  else if (viewId === "settings") renderSettingsView(viewC);
  else if (viewId === "worker_dashboard") renderWorkerDashboard(viewC);
  else if (viewId === "worker_attendance") renderWorkerAttendanceView(viewC);
  else if (viewId === "worker_salary") renderWorkerSalaryView(viewC);
  else if (viewId === "worker_advances") renderWorkerAdvancesView(viewC);
  else if (viewId === "worker_profile") renderWorkerProfileView(viewC);
}

// ----------------- ADMIN DASHBOARD -----------------
async function renderAdminDashboard(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading courier hub statistics...</p></div>`;
  try {
    const data = await apiRequest("/admin/dashboard-stats");
    const s = data.summary;

    container.innerHTML = `
      <!-- Summary Cards Grid -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-info">
            <h3>Total Employees</h3>
            <div class="value">${s.total_employees}</div>
            <div class="sub-text">${s.active_employees} Active | ${s.pending_approvals} Pending Approval</div>
          </div>
          <div class="icon-box icon-blue">👥</div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <h3>Present Today</h3>
            <div class="value">${s.present_today}</div>
            <div class="sub-text" style="color: #10b981;">Shift Active</div>
          </div>
          <div class="icon-box icon-green">✅</div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <h3>Absent Today</h3>
            <div class="value">${s.absent_today}</div>
            <div class="sub-text" style="color: #ef4444;">Auto-deducted</div>
          </div>
          <div class="icon-box icon-red">❌</div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <h3>Currently Working</h3>
            <div class="value">${s.currently_working}</div>
            <div class="sub-text">Checked In, Not Yet Out</div>
          </div>
          <div class="icon-box icon-orange">⏱️</div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <h3>Total Advances Given</h3>
            <div class="value">${formatCurrency(s.total_advance_outstanding)}</div>
            <div class="sub-text">Outstanding Loan Balance</div>
          </div>
          <div class="icon-box icon-amber">💸</div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <h3>Monthly Salary Payable</h3>
            <div class="value">${formatCurrency(s.total_monthly_salary)}</div>
            <div class="sub-text">Base Active Payroll</div>
          </div>
          <div class="icon-box icon-cyan">💰</div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="dashboard-row">
        <div class="card">
          <div class="card-header">
            <h2>Monthly Attendance Breakdown</h2>
            <span class="status-pill status-present">Current Month</span>
          </div>
          <div class="card-body">
            <canvas id="chart-attendance" height="130"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2>Top Employee Advances</h2>
            <span class="status-pill status-halfday">Balance Due</span>
          </div>
          <div class="card-body">
            <canvas id="chart-advances" height="130"></canvas>
          </div>
        </div>
      </div>

      <!-- Recent Activity Section -->
      <div class="card">
        <div class="card-header">
          <h2>Recent Hub Activity</h2>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('attendance')">View All Attendance</button>
          </div>
        </div>
        <div class="card-body">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
            <div>
              <h4 style="font-size: 13px; text-transform: uppercase; color: #64748b; margin-bottom: 12px;">Recent Check-Ins & Outs</h4>
              <div class="activity-feed">
                ${data.recent_activity.checkins.length === 0 ? '<p style="color:#94a3b8; font-size:13px;">No punches recorded today yet.</p>' : ''}
                ${data.recent_activity.checkins.map(c => `
                  <div class="activity-item">
                    <div class="activity-badge" style="background: ${c.event_type === 'CHECK_IN' ? '#d1fae5' : '#fee2e2'};">
                      ${c.event_type === 'CHECK_IN' ? '🟢' : '🔴'}
                    </div>
                    <div class="activity-content">
                      <div class="activity-title">${c.employee_name} (${c.employee_code})</div>
                      <div class="activity-desc">${c.event_type === 'CHECK_IN' ? `Checked in at ${c.check_in_time}` : `Checked out at ${c.check_out_time}`}</div>
                      <div class="activity-time">${formatDate(c.date)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div>
              <h4 style="font-size: 13px; text-transform: uppercase; color: #64748b; margin-bottom: 12px;">Recent Advances Recorded</h4>
              <div class="activity-feed">
                ${data.recent_activity.advances.length === 0 ? '<p style="color:#94a3b8; font-size:13px;">No advances recorded recently.</p>' : ''}
                ${data.recent_activity.advances.map(a => `
                  <div class="activity-item">
                    <div class="activity-badge" style="background: #fef3c7;">💸</div>
                    <div class="activity-content">
                      <div class="activity-title">${a.employee_name} - ${formatCurrency(a.amount)} <span class="status-pill status-leave" style="font-size: 10.5px; padding: 1px 6px;">${a.payment_type || 'Cash'}</span></div>
                      <div class="activity-desc">${a.reason}</div>
                      <div class="activity-time">${formatDate(a.transaction_date)} at ${a.transaction_time}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div>
              <h4 style="font-size: 13px; text-transform: uppercase; color: #64748b; margin-bottom: 12px;">Recent Personnel Registrations</h4>
              <div class="activity-feed">
                ${data.recent_activity.employees.map(e => `
                  <div class="activity-item">
                    <div class="activity-badge" style="background: #eff6ff;">👤</div>
                    <div class="activity-content">
                      <div class="activity-title">${e.name} (${e.employee_code || 'Pending'})</div>
                      <div class="activity-desc">${e.position} • Status: <span class="status-pill ${e.account_status === 'ACTIVE' ? 'status-active' : 'status-pending'}">${e.account_status}</span></div>
                      <div class="activity-time">${formatDate(e.created_at ? e.created_at.split(' ')[0] : '')}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Render Charts
    renderDashboardCharts(data.charts);
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load dashboard: ${err.message}</div>`;
  }
}

function renderDashboardCharts(chartsData) {
  // Chart 1: Attendance Breakdown
  const ctxAtt = document.getElementById("chart-attendance");
  if (ctxAtt) {
    if (charts.attendance) charts.attendance.destroy();
    const bd = chartsData.attendance_breakdown || {};
    charts.attendance = new Chart(ctxAtt, {
      type: "bar",
      data: {
        labels: ["Present", "Absent", "Half Day", "Leave"],
        datasets: [{
          label: "Days This Month",
          data: [bd["Present"] || 0, bd["Absent"] || 0, bd["Half Day"] || 0, bd["Leave"] || 0],
          backgroundColor: ["#10b981", "#ef4444", "#f59e0b", "#06b6d4"],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: "#f1f5f9" } } }
      }
    });
  }

  // Chart 2: Top Advances
  const ctxAdv = document.getElementById("chart-advances");
  if (ctxAdv) {
    if (charts.advances) charts.advances.destroy();
    const advList = chartsData.advance_by_employee || [];
    charts.advances = new Chart(ctxAdv, {
      type: "doughnut",
      data: {
        labels: advList.map(a => a.name),
        datasets: [{
          data: advList.map(a => a.outstanding),
          backgroundColor: ["#3b82f6", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#64748b"]
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "right", labels: { boxWidth: 12 } } }
      }
    });
  }
}

// ----------------- EMPLOYEE MANAGEMENT -----------------
async function renderEmployeesView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading employees directory...</p></div>`;
  try {
    const employees = await apiRequest("/admin/employees");

    container.innerHTML = `
      <div class="table-toolbar">
        <div class="search-input-group">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="emp-search" placeholder="Search by name, ID, phone, position..." oninput="filterEmployeesTable()">
        </div>
        <div class="filter-group">
          <select id="emp-status-filter" class="select-custom" onchange="filterEmployeesTable()">
            <option value="">All Account Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="PENDING">Pending Approval</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
          <button class="btn btn-primary" onclick="openAddEmployeeModal()">
            <span>➕</span> Add New Employee
          </button>
        </div>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="data-table" id="employees-table">
            <thead>
              <tr>
                <th>Emp ID</th>
                <th>Employee Name</th>
                <th>Position</th>
                <th>Phone</th>
                <th>Monthly Salary</th>
                <th>Daily Rate</th>
                <th>Outstanding Advance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${employees.map(emp => `
                <tr data-name="${emp.name.toLowerCase()}" data-code="${emp.employee_code.toLowerCase()}" data-status="${emp.account_status}">
                  <td><strong>${emp.employee_code}</strong></td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      ${renderAvatarHtml(emp.name, emp.profile_image, 36, 14)}
                      <div>
                        <div style="font-weight: 600;">${emp.name}</div>
                        <div style="font-size: 12px; color: #64748b;">${emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>${emp.position}</td>
                  <td>${emp.phone || '-'}</td>
                  <td><strong>${formatCurrency(emp.monthly_salary)}</strong></td>
                  <td>${formatCurrency(emp.daily_salary)}</td>
                  <td style="color: ${emp.total_advance_outstanding > 0 ? '#d97706' : '#64748b'}; font-weight: 600;">
                    ${formatCurrency(emp.total_advance_outstanding || 0)}
                  </td>
                  <td>
                    <span class="status-pill ${emp.account_status === 'ACTIVE' ? 'status-active' : emp.account_status === 'PENDING' ? 'status-pending' : 'status-deactivated'}">
                      ${emp.account_status}
                    </span>
                  </td>
                  <td>
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-secondary btn-sm" onclick="viewEmployeeProfile(${emp.id})" title="View Complete Profile">Profile</button>
                      <button class="btn btn-secondary btn-sm" onclick="openEditEmployeeModal(${JSON.stringify(emp).replace(/"/g, '&quot;')})" title="Edit Details">Edit</button>
                      ${emp.account_status === 'PENDING' ? `
                        <button class="btn btn-success btn-sm" onclick="changeEmployeeStatus(${emp.id}, 'APPROVE')">Approve</button>
                      ` : emp.account_status === 'ACTIVE' ? `
                        <button class="btn btn-danger btn-sm" onclick="changeEmployeeStatus(${emp.id}, 'DEACTIVATE')">Deactivate</button>
                      ` : `
                        <button class="btn btn-success btn-sm" onclick="changeEmployeeStatus(${emp.id}, 'ACTIVATE')">Activate</button>
                      `}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load employees: ${err.message}</div>`;
  }
}

function filterEmployeesTable() {
  const search = document.getElementById("emp-search").value.toLowerCase();
  const status = document.getElementById("emp-status-filter").value;
  const rows = document.querySelectorAll("#employees-table tbody tr");

  rows.forEach(r => {
    const name = r.getAttribute("data-name") || "";
    const code = r.getAttribute("data-code") || "";
    const st = r.getAttribute("data-status") || "";

    const matchSearch = name.includes(search) || code.includes(search);
    const matchStatus = !status || st === status;

    r.style.display = (matchSearch && matchStatus) ? "" : "none";
  });
}

function openAddEmployeeModal() {
  openModal("Add New Employee", `
    <form id="add-emp-form" onsubmit="submitAddEmployee(event)">
      <div class="form-group">
        <label>Full Name *</label>
        <input type="text" id="add-name" class="form-control" required placeholder="e.g. Ramesh Chandra">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Email Address *</label>
          <input type="email" id="add-email" class="form-control" required placeholder="ramesh@courier.com">
        </div>
        <div class="form-group">
          <label>Phone Number *</label>
          <input type="tel" id="add-phone" class="form-control" required placeholder="+91 98765 43210">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Position / Role *</label>
          <input type="text" id="add-position" class="form-control" required placeholder="e.g. Dispatch Specialist">
        </div>
        <div class="form-group">
          <label>Monthly Salary (₹) *</label>
          <input type="number" id="add-salary" class="form-control" required value="20000" min="5000">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Working Days Per Month</label>
          <input type="number" id="add-working-days" class="form-control" value="26" min="20" max="31">
        </div>
        <div class="form-group">
          <label>Joining Date</label>
          <input type="date" id="add-joining" class="form-control" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <div class="form-group">
        <label>Residential Address</label>
        <input type="text" id="add-address" class="form-control" placeholder="Complete residential address">
      </div>
      <div class="form-group">
        <label>Profile Photo (Upload or Take Live Photo)</label>
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <label for="add-photo-file" class="btn btn-secondary btn-sm" style="cursor: pointer; display: flex; align-items: center; gap: 6px; flex: 1; justify-content: center;">
            📁 Choose File
          </label>
          <button type="button" class="btn btn-secondary btn-sm" style="display: flex; align-items: center; gap: 6px; flex: 1; justify-content: center;" onclick="openCameraModal('add-photo-base64', 'add-photo-preview', 'add-photo-img')">
            📷 Take Live Photo
          </button>
        </div>
        <input type="file" id="add-photo-file" style="display: none;" accept="image/*" onchange="previewAddEmpPhoto(event)">
        <input type="hidden" id="add-photo-base64">
        <div id="add-photo-preview" style="display: none; margin-top: 8px; align-items: center; gap: 10px;">
          <img id="add-photo-img" src="" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid #2563eb;">
          <span style="font-size: 12px; color: #10b981; font-weight: 600;">✓ Photo attached</span>
        </div>
      </div>
      <div class="form-group">
        <label>Password for Login *</label>
        <input type="password" id="add-password" class="form-control" required value="Worker@123">
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Employee Record</button>
      </div>
    </form>
  `);
}

function previewAddEmpPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 250;
      let width = img.width, height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      document.getElementById("add-photo-base64").value = dataUrl;
      const previewDiv = document.getElementById("add-photo-preview");
      const previewImg = document.getElementById("add-photo-img");
      if (previewDiv && previewImg) {
        previewImg.src = dataUrl;
        previewDiv.style.display = "flex";
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function previewEditEmpPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 250;
      let width = img.width, height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      document.getElementById("edit-photo-base64").value = dataUrl;
      const previewImg = document.getElementById("edit-photo-img");
      if (previewImg) {
        previewImg.src = dataUrl;
        previewImg.style.display = "block";
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitAddEmployee(e) {
  e.preventDefault();
  const photoBase64 = document.getElementById("add-photo-base64") ? document.getElementById("add-photo-base64").value : null;
  const payload = {
    name: document.getElementById("add-name").value,
    email: document.getElementById("add-email").value,
    phone: document.getElementById("add-phone").value,
    position: document.getElementById("add-position").value,
    monthly_salary: parseFloat(document.getElementById("add-salary").value),
    working_days_per_month: parseInt(document.getElementById("add-working-days").value),
    joining_date: document.getElementById("add-joining").value,
    address: document.getElementById("add-address").value,
    password: document.getElementById("add-password").value,
    profile_image: photoBase64 || null
  };

  try {
    const res = await apiRequest("/admin/employees", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast(res.message, "success");
    closeModal();
    renderEmployeesView(document.getElementById("view-container"));
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openEditEmployeeModal(emp) {
  openModal(`Edit Employee - ${emp.name}`, `
    <form id="edit-emp-form" onsubmit="submitEditEmployee(event, ${emp.id})">
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
        <div id="edit-photo-preview-box">
          ${renderAvatarHtml(emp.name, emp.profile_image, 60, 22)}
        </div>
        <div style="flex: 1;">
          <label style="font-size: 13px; font-weight: 600; margin-bottom: 6px; display: block;">Update Photo</label>
          <div style="display: flex; gap: 8px;">
            <label for="edit-photo-file" class="btn btn-secondary btn-sm" style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
              📁 File
            </label>
            <button type="button" class="btn btn-secondary btn-sm" style="display: flex; align-items: center; gap: 4px;" onclick="openCameraModal('edit-photo-base64', null, null, onEditEmpCameraCapture)">
              📷 Live Camera
            </button>
          </div>
          <input type="file" id="edit-photo-file" style="display: none;" accept="image/*" onchange="previewEditEmpPhoto(event)">
          <input type="hidden" id="edit-photo-base64" value="${emp.profile_image || ''}">
        </div>
      </div>
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="edit-name" class="form-control" value="${emp.name}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="edit-email" class="form-control" value="${emp.email}" required>
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" id="edit-phone" class="form-control" value="${emp.phone || ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Position / Role</label>
          <input type="text" id="edit-position" class="form-control" value="${emp.position}" required>
        </div>
        <div class="form-group">
          <label>Monthly Salary (₹)</label>
          <input type="number" id="edit-salary" class="form-control" value="${emp.monthly_salary}" required>
        </div>
      </div>
      <div class="form-group">
        <label>Residential Address</label>
        <input type="text" id="edit-address" class="form-control" value="${emp.address || ''}">
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Changes</button>
      </div>
    </form>
  `);
}

async function submitEditEmployee(e, empId) {
  e.preventDefault();
  const photoBase64 = document.getElementById("edit-photo-base64") ? document.getElementById("edit-photo-base64").value : null;
  const payload = {
    name: document.getElementById("edit-name").value,
    email: document.getElementById("edit-email").value,
    phone: document.getElementById("edit-phone").value,
    position: document.getElementById("edit-position").value,
    monthly_salary: parseFloat(document.getElementById("edit-salary").value),
    address: document.getElementById("edit-address").value,
    profile_image: photoBase64 || null
  };

  try {
    const res = await apiRequest(`/admin/employees/${empId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    showToast(res.message, "success");
    closeModal();
    renderEmployeesView(document.getElementById("view-container"));
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function changeEmployeeStatus(empId, action) {
  if (!confirm(`Are you sure you want to ${action} this employee account?`)) return;
  try {
    const res = await apiRequest(`/admin/employees/${empId}/status`, {
      method: "POST",
      body: JSON.stringify({ action })
    });
    showToast(res.message, "success");
    renderEmployeesView(document.getElementById("view-container"));
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Complete Employee Profile Modal
async function viewEmployeeProfile(empId) {
  try {
    const emp = await apiRequest(`/admin/employees/${empId}`);
    const att = emp.attendance_stats.current_month;

    openModal(`Employee Profile: ${emp.name}`, `
      <div style="display: flex; gap: 20px; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 16px;">
        ${renderAvatarHtml(emp.name, emp.profile_image, 64, 24)}
        <div>
          <h2 style="font-size: 18px; margin-bottom: 4px;">${emp.name}</h2>
          <p style="font-size: 13px; color: #64748b;">${emp.position} • <strong>${emp.employee_code}</strong></p>
          <span class="status-pill ${emp.account_status === 'ACTIVE' ? 'status-active' : 'status-pending'}" style="margin-top: 4px;">${emp.account_status}</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; font-size: 13px;">
        <div><strong>Phone:</strong> ${emp.phone || '-'}</div>
        <div><strong>Email:</strong> ${emp.email}</div>
        <div><strong>Address:</strong> ${emp.address || '-'}</div>
        <div><strong>Joining Date:</strong> ${formatDate(emp.joining_date)}</div>
      </div>

      <div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <h4 style="font-size: 13px; text-transform: uppercase; color: #64748b; margin-bottom: 10px;">Financial & Salary Parameters</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13.5px;">
          <div>Monthly Salary: <strong>${formatCurrency(emp.monthly_salary)}</strong></div>
          <div>Daily Salary Rate: <strong>${formatCurrency(emp.daily_salary)}</strong></div>
          <div>Total Advance Taken: <strong style="color:#d97706;">${formatCurrency(emp.total_advance_taken)}</strong></div>
          <div>Outstanding Balance: <strong style="color:#ef4444;">${formatCurrency(emp.outstanding_advance)}</strong></div>
        </div>
      </div>

      <div style="background: #f8fafc; border-radius: 8px; padding: 14px;">
        <h4 style="font-size: 13px; text-transform: uppercase; color: #64748b; margin-bottom: 10px;">Current Month Attendance Summary</h4>
        <div style="display: flex; justify-content: space-around; text-align: center;">
          <div>
            <div style="font-size: 20px; font-weight: bold; color: #10b981;">${att["Present"] || 0}</div>
            <div style="font-size: 12px; color: #64748b;">Present</div>
          </div>
          <div>
            <div style="font-size: 20px; font-weight: bold; color: #ef4444;">${att["Absent"] || 0}</div>
            <div style="font-size: 12px; color: #64748b;">Absent</div>
          </div>
          <div>
            <div style="font-size: 20px; font-weight: bold; color: #f59e0b;">${att["Half Day"] || 0}</div>
            <div style="font-size: 12px; color: #64748b;">Half Days</div>
          </div>
          <div>
            <div style="font-size: 20px; font-weight: bold; color: #06b6d4;">${att["Leave"] || 0}</div>
            <div style="font-size: 12px; color: #64748b;">Leaves</div>
          </div>
        </div>
      </div>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ----------------- ATTENDANCE MANAGEMENT -----------------
async function renderAttendanceView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading attendance records...</p></div>`;
  try {
    const today = new Date().toISOString().split("T")[0];
    const records = await apiRequest(`/attendance?date_val=${today}`);
    const employees = await apiRequest("/admin/employees");

    container.innerHTML = `
      <div class="table-toolbar">
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <input type="date" id="att-date-filter" class="form-control" style="width: 170px;" value="${today}" onchange="refreshAdminAttendance()">
          <select id="att-emp-filter" class="select-custom" onchange="refreshAdminAttendance()">
            <option value="">All Employees</option>
            ${employees.map(e => `<option value="${e.id}">${e.name} (${e.employee_code})</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" onclick="openMarkAttendanceModal(${JSON.stringify(employees).replace(/"/g, '&quot;')})">
          <span>📝</span> Mark / Adjust Attendance
        </button>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 id="att-table-header">Attendance Records for ${formatDate(today)}</h2>
          <span class="status-pill status-present" id="att-count-badge">${records.length} Records</span>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Emp Code</th>
                <th>Employee Name</th>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Working Hours</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="att-table-body">
              ${renderAttendanceRows(records)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load attendance: ${err.message}</div>`;
  }
}

function renderAttendanceRows(records) {
  if (records.length === 0) {
    return `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 24px;">No attendance records found for this selection.</td></tr>`;
  }
  return records.map(r => `
    <tr>
      <td><strong>${r.employee_code}</strong></td>
      <td>${r.employee_name}</td>
      <td>${formatDate(r.date)}</td>
      <td>${r.check_in_time || '-'}</td>
      <td>${r.check_out_time || (r.check_in_time ? '<span style="color:#f59e0b; font-weight:600;">Working...</span>' : '-')}</td>
      <td>${r.working_hours_formatted}</td>
      <td>
        <span class="status-pill ${
          r.status === 'Present' ? 'status-present' :
          r.status === 'Absent' ? 'status-absent' :
          r.status === 'Half Day' ? 'status-halfday' : 'status-leave'
        }">${r.status}</span>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick='openEditAttendanceRecord(${JSON.stringify(r).replace(/'/g, "\\'")})'>Edit</button>
      </td>
    </tr>
  `).join('');
}

async function refreshAdminAttendance() {
  const d = document.getElementById("att-date-filter").value;
  const empId = document.getElementById("att-emp-filter").value;
  let q = [];
  if (d) q.push(`date_val=${d}`);
  if (empId) q.push(`employee_id=${empId}`);

  try {
    const records = await apiRequest(`/attendance?${q.join('&')}`);
    document.getElementById("att-table-body").innerHTML = renderAttendanceRows(records);
    document.getElementById("att-table-header").innerText = `Attendance Records for ${formatDate(d)}`;
    document.getElementById("att-count-badge").innerText = `${records.length} Records`;
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openMarkAttendanceModal(employees) {
  const today = new Date().toISOString().split("T")[0];
  openModal("Mark / Adjust Employee Attendance", `
    <form id="mark-att-form" onsubmit="submitMarkAttendance(event)">
      <div class="form-group">
        <label>Select Employee *</label>
        <select id="mark-emp-id" class="form-control" required>
          ${employees.map(e => `<option value="${e.id}">${e.name} (${e.employee_code}) - ${e.position}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Attendance Date *</label>
          <input type="date" id="mark-date" class="form-control" value="${today}" required>
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select id="mark-status" class="form-control" onchange="toggleAttendanceTimeInputs()" required>
            <option value="Present">Present</option>
            <option value="Absent">Absent</option>
            <option value="Half Day">Half Day</option>
            <option value="Leave">Leave</option>
          </select>
        </div>
      </div>
      <div class="form-row" id="time-inputs-row">
        <div class="form-group">
          <label>Check In Time</label>
          <input type="text" id="mark-in" class="form-control" placeholder="09:00 AM" value="09:00 AM">
        </div>
        <div class="form-group">
          <label>Check Out Time</label>
          <input type="text" id="mark-out" class="form-control" placeholder="06:30 PM" value="06:30 PM">
        </div>
      </div>
      <div class="form-group">
        <label>Admin Note / Reason</label>
        <input type="text" id="mark-notes" class="form-control" placeholder="Optional remark (e.g. Regularized by Hub Manager)">
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Attendance</button>
      </div>
    </form>
  `);
}

function toggleAttendanceTimeInputs() {
  const st = document.getElementById("mark-status").value;
  const row = document.getElementById("time-inputs-row");
  if (st === "Absent" || st === "Leave") {
    row.style.display = "none";
  } else {
    row.style.display = "grid";
  }
}

function openEditAttendanceRecord(rec) {
  openModal(`Edit Attendance - ${rec.employee_name}`, `
    <form id="edit-att-form" onsubmit="submitEditAttendanceRecord(event, ${rec.employee_id}, '${rec.date}')">
      <div class="form-group">
        <label>Employee</label>
        <input type="text" class="form-control" value="${rec.employee_name} (${rec.employee_code})" disabled>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date</label>
          <input type="text" class="form-control" value="${formatDate(rec.date)}" disabled>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="edit-att-status" class="form-control" required>
            <option value="Present" ${rec.status === 'Present' ? 'selected' : ''}>Present</option>
            <option value="Absent" ${rec.status === 'Absent' ? 'selected' : ''}>Absent</option>
            <option value="Half Day" ${rec.status === 'Half Day' ? 'selected' : ''}>Half Day</option>
            <option value="Leave" ${rec.status === 'Leave' ? 'selected' : ''}>Leave</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Check In Time</label>
          <input type="text" id="edit-att-in" class="form-control" value="${rec.check_in_time || ''}" placeholder="09:00 AM">
        </div>
        <div class="form-group">
          <label>Check Out Time</label>
          <input type="text" id="edit-att-out" class="form-control" value="${rec.check_out_time || ''}" placeholder="06:30 PM">
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Update Record</button>
      </div>
    </form>
  `);
}

async function submitEditAttendanceRecord(e, empId, dateStr) {
  e.preventDefault();
  const payload = {
    employee_id: empId,
    date: dateStr,
    status: document.getElementById("edit-att-status").value,
    check_in_time: document.getElementById("edit-att-in").value,
    check_out_time: document.getElementById("edit-att-out").value
  };

  try {
    const res = await apiRequest("/admin/attendance", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast(res.message, "success");
    closeModal();
    refreshAdminAttendance();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function submitMarkAttendance(e) {
  e.preventDefault();
  const st = document.getElementById("mark-status").value;
  const payload = {
    employee_id: parseInt(document.getElementById("mark-emp-id").value),
    date: document.getElementById("mark-date").value,
    status: st,
    check_in_time: (st === 'Absent' || st === 'Leave') ? null : document.getElementById("mark-in").value,
    check_out_time: (st === 'Absent' || st === 'Leave') ? null : document.getElementById("mark-out").value,
    notes: document.getElementById("mark-notes").value
  };

  try {
    const res = await apiRequest("/admin/attendance", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast(res.message, "success");
    closeModal();
    refreshAdminAttendance();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ----------------- ADVANCES MANAGEMENT -----------------
async function renderAdvancesView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading advance transactions...</p></div>`;
  try {
    const advances = await apiRequest("/advances");
    const employees = await apiRequest("/admin/employees");

    container.innerHTML = `
      <div class="table-toolbar">
        <div class="search-input-group">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="adv-search" placeholder="Search by employee name, ID or reason..." oninput="filterAdvancesTable()">
        </div>
        <button class="btn btn-primary" onclick="openAddAdvanceModal(${JSON.stringify(employees).replace(/"/g, '&quot;')})">
          <span>💸</span> Record New Advance
        </button>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="data-table" id="advances-table">
            <thead>
              <tr>
                <th>Tx ID</th>
                <th>Employee Code</th>
                <th>Employee Name</th>
                <th>Amount (₹)</th>
                <th>Payment Type</th>
                <th>Date & Time</th>
                <th>Reason</th>
                <th>Recorded By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${advances.map(adv => `
                <tr data-search="${adv.employee_name.toLowerCase()} ${adv.employee_code.toLowerCase()} ${(adv.reason || '').toLowerCase()} ${(adv.payment_type || '').toLowerCase()}">
                  <td><strong>ADV-${String(adv.id).padStart(4, '0')}</strong></td>
                  <td><strong>${adv.employee_code}</strong></td>
                  <td>${adv.employee_name}</td>
                  <td><strong style="color: #d97706; font-size: 14px;">${formatCurrency(adv.amount)}</strong></td>
                  <td><span class="status-pill status-leave" style="font-size: 11.5px;">${adv.payment_type || 'Cash'}</span></td>
                  <td>${formatDate(adv.transaction_date)} <span style="font-size: 11px; color:#64748b;">${adv.transaction_time}</span></td>
                  <td>${adv.reason || '-'}</td>
                  <td>${adv.recorded_by}</td>
                  <td>
                    <span class="status-pill ${adv.status === 'Outstanding' ? 'status-halfday' : 'status-paid'}">
                      ${adv.status}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load advances: ${err.message}</div>`;
  }
}

function filterAdvancesTable() {
  const search = document.getElementById("adv-search").value.toLowerCase();
  const rows = document.querySelectorAll("#advances-table tbody tr");
  rows.forEach(r => {
    const s = r.getAttribute("data-search") || "";
    r.style.display = s.includes(search) ? "" : "none";
  });
}

function openAddAdvanceModal(employees) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  openModal("Record Employee Advance / Money Taken", `
    <form id="add-adv-form" onsubmit="submitAddAdvance(event)">
      <div class="form-group">
        <label>Select Employee *</label>
        <select id="adv-emp-id" class="form-control" required>
          ${employees.map(e => `<option value="${e.id}">${e.name} (${e.employee_code}) - Base: ${formatCurrency(e.monthly_salary)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Advance Amount (₹) *</label>
          <input type="number" id="adv-amount" class="form-control" placeholder="2000" min="100" required>
        </div>
        <div class="form-group">
          <label>Type of Payment *</label>
          <select id="adv-payment-type" class="form-control" required>
            <option value="Cash" selected>Cash</option>
            <option value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</option>
            <option value="Bank Transfer (NEFT/IMPS)">Bank Transfer (NEFT/IMPS)</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Transaction Date *</label>
          <input type="date" id="adv-date" class="form-control" value="${today}" required>
        </div>
        <div class="form-group">
          <label>Transaction Time</label>
          <input type="text" id="adv-time" class="form-control" value="${timeStr}" required>
        </div>
      </div>
      <div class="form-group">
        <label>Reason / Note *</label>
        <input type="text" id="adv-reason" class="form-control" placeholder="e.g. Personal medical advance, bike repair support" required>
      </div>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 6px; font-size: 12px; color: #1e40af; margin-bottom: 16px;">
        ℹ️ This transaction will be permanently saved, employee notified instantly, and deducted automatically during monthly salary processing.
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Advance Transaction</button>
      </div>
    </form>
  `);
}

async function submitAddAdvance(e) {
  e.preventDefault();
  const payload = {
    employee_id: parseInt(document.getElementById("adv-emp-id").value),
    amount: parseFloat(document.getElementById("adv-amount").value),
    payment_type: document.getElementById("adv-payment-type").value,
    transaction_date: document.getElementById("adv-date").value,
    transaction_time: document.getElementById("adv-time").value,
    reason: document.getElementById("adv-reason").value
  };

  try {
    const res = await apiRequest("/admin/advances", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast(res.message, "success");
    closeModal();
    renderAdvancesView(document.getElementById("view-container"));
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ----------------- SALARY MANAGEMENT -----------------
async function renderSalaryView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading salary records...</p></div>`;
  try {
    const now = new Date();
    const currMonth = now.getMonth() + 1;
    const currYear = now.getFullYear();

    // Default fetch records
    const records = await apiRequest(`/salary/records?year=${currYear}`);

    container.innerHTML = `
      <div class="table-toolbar">
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <select id="sal-month-select" class="select-custom">
            <option value="9" ${currMonth === 9 ? 'selected' : ''}>September</option>
            <option value="8" ${currMonth === 8 ? 'selected' : ''}>August</option>
            <option value="7" ${currMonth === 7 ? 'selected' : ''}>July</option>
            <option value="6" ${currMonth === 6 ? 'selected' : ''}>June</option>
          </select>
          <select id="sal-year-select" class="select-custom">
            <option value="2026" selected>2026</option>
            <option value="2025">2025</option>
          </select>
          <button class="btn btn-secondary" onclick="filterSalaryList()">Filter Records</button>
        </div>
        <button class="btn btn-success" onclick="triggerSalaryCalculation()">
          <span>⚙️</span> Calculate Monthly Payroll
        </button>
      </div>

      <div class="salary-tabs">
        <button type="button" class="salary-tab-btn active" id="tab-monthly-salary-btn" onclick="switchSalaryView('monthly')">Monthly Payroll Summary</button>
        <button type="button" class="salary-tab-btn" id="tab-daywise-salary-btn" onclick="switchSalaryView('daywise')">📅 Day-Wise Salary Breakdown</button>
      </div>

      <!-- MONTHLY VIEW CONTAINER -->
      <div id="salary-monthly-view">
        <div class="card">
          <div class="card-header">
            <h2>Salary Payroll Records & Statements</h2>
            <span class="status-pill status-present" id="sal-records-count">${records.length} Payroll Records</span>
          </div>
          <div class="table-responsive">
            <table class="data-table" id="salary-table">
              <thead>
                <tr>
                  <th>Emp Code</th>
                  <th>Employee</th>
                  <th>Month/Year</th>
                  <th>Fixed Salary</th>
                  <th>Day-Wise Rate</th>
                  <th>Present / Absent</th>
                  <th>Absent Deduct.</th>
                  <th>Advance Deduct.</th>
                  <th>Net Payable</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="salary-table-body">
                ${renderSalaryRows(records)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- DAY-WISE VIEW CONTAINER -->
      <div id="salary-daywise-view" style="display: none;">
        <div class="card">
          <div class="card-header" style="justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 id="daywise-card-title">📅 Day-by-Day Salary Earnings & Shifts</h2>
              <p style="font-size: 12.5px; color: #64748b; margin-top: 2px;">Daily salary rates, shift timings, day-wise advances, and live earned balances</p>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <select id="daywise-emp-select" class="select-custom" onchange="loadDayWiseSalaryData()">
                <!-- Populated dynamically -->
              </select>
              <button class="btn btn-secondary btn-sm" onclick="window.print()">🖨️ Print Day-Wise Sheet</button>
            </div>
          </div>
          <div class="card-body" id="daywise-content-body">
            <p style="text-align:center; padding: 20px; color:#64748b;">Loading day-wise calculations...</p>
          </div>
        </div>
      </div>
    `;

    // Populate employee dropdown for day-wise view
    populateDayWiseEmployeeDropdown();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load salary: ${err.message}</div>`;
  }
}

async function populateDayWiseEmployeeDropdown() {
  const empSelect = document.getElementById("daywise-emp-select");
  if (!empSelect) return;
  try {
    const emps = await apiRequest("/admin/employees");
    empSelect.innerHTML = emps.map(e => `
      <option value="${e.id}">${e.name} (${e.employee_code}) - ₹${e.monthly_salary.toLocaleString('en-IN')}/mo</option>
    `).join('');
  } catch (e) {}
}

function switchSalaryView(view) {
  const mBtn = document.getElementById("tab-monthly-salary-btn");
  const dBtn = document.getElementById("tab-daywise-salary-btn");
  const mBox = document.getElementById("salary-monthly-view");
  const dBox = document.getElementById("salary-daywise-view");

  if (view === "monthly") {
    mBtn.classList.add("active");
    dBtn.classList.remove("active");
    mBox.style.display = "block";
    dBox.style.display = "none";
  } else {
    dBtn.classList.add("active");
    mBtn.classList.remove("active");
    mBox.style.display = "none";
    dBox.style.display = "block";
    loadDayWiseSalaryData();
  }
}

async function loadDayWiseSalaryData(targetEmpId = null) {
  const container = document.getElementById("daywise-content-body");
  if (!container) return;

  const m = document.getElementById("sal-month-select").value;
  const y = document.getElementById("sal-year-select").value;
  const empSelect = document.getElementById("daywise-emp-select");
  const empId = targetEmpId || (empSelect ? empSelect.value : null);

  if (!empId) {
    container.innerHTML = `<p style="text-align: center; color: #94a3b8; padding: 24px;">Please select or add an employee to view day-wise salary details.</p>`;
    return;
  }

  container.innerHTML = `<p style="text-align: center; color: #64748b; padding: 20px;">Computing day-wise salary calendar...</p>`;

  try {
    const data = await apiRequest(`/salary/day-wise?month=${m}&year=${y}&employee_id=${empId}`);
    const emp = data.employee;
    const s = data.summary;
    const p = data.period;

    container.innerHTML = `
      <!-- Employee Day-wise Header Summary -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
        <div style="background: #f8fafc; padding: 14px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Base Salary & Rate</div>
          <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 4px;">${formatCurrency(emp.monthly_salary)}</div>
          <div style="font-size: 12px; color: #2563eb; font-weight: 600; margin-top: 2px;">Daily Rate: ${formatCurrency(emp.daily_salary_rate)} / day</div>
        </div>

        <div style="background: #f0fdf4; padding: 14px 16px; border-radius: 8px; border: 1px solid #bbf7d0;">
          <div style="font-size: 11px; text-transform: uppercase; color: #166534; font-weight: 600;">Earned Working Days</div>
          <div style="font-size: 18px; font-weight: 700; color: #15803d; margin-top: 4px;">${s.present_days} Present ${s.half_days > 0 ? `+ ${s.half_days} Half` : ''}</div>
          <div style="font-size: 12px; color: #166534; font-weight: 600; margin-top: 2px;">Earned: ${formatCurrency(s.total_earned)}</div>
        </div>

        <div style="background: #fef2f2; padding: 14px 16px; border-radius: 8px; border: 1px solid #fecaca;">
          <div style="font-size: 11px; text-transform: uppercase; color: #991b1b; font-weight: 600;">Absent Deductions</div>
          <div style="font-size: 18px; font-weight: 700; color: #b91c1c; margin-top: 4px;">${s.absent_days} Days Absent</div>
          <div style="font-size: 12px; color: #991b1b; font-weight: 600; margin-top: 2px;">-${formatCurrency(s.total_deductions)}</div>
        </div>

        <div style="background: #fffbeb; padding: 14px 16px; border-radius: 8px; border: 1px solid #fde68a;">
          <div style="font-size: 11px; text-transform: uppercase; color: #92400e; font-weight: 600;">Advances Taken in Month</div>
          <div style="font-size: 18px; font-weight: 700; color: #b45309; margin-top: 4px;">${formatCurrency(s.total_advances)}</div>
          <div style="font-size: 12px; color: #92400e; font-weight: 600; margin-top: 2px;">Subtracted from salary</div>
        </div>

        <div style="background: #eff6ff; padding: 14px 16px; border-radius: 8px; border: 1px solid #bfdbfe;">
          <div style="font-size: 11px; text-transform: uppercase; color: #1e40af; font-weight: 600;">Net Earned to Date</div>
          <div style="font-size: 20px; font-weight: 800; color: #1d4ed8; margin-top: 4px;">${formatCurrency(s.net_payable)}</div>
          <div style="font-size: 12px; color: #1e40af; margin-top: 2px;">Formula: Earned - Advances</div>
        </div>
      </div>

      <!-- Day-by-Day Detailed Table -->
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 50px;">Day</th>
              <th>Date</th>
              <th>Day</th>
              <th>Attendance Status</th>
              <th>Shift Timings</th>
              <th>Hours</th>
              <th>Daily Rate</th>
              <th>Earned (₹)</th>
              <th>Deduction (₹)</th>
              <th>Advance Taken (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${data.day_wise_records.map(r => {
              const isPresent = r.status === 'Present';
              const isAbsent = r.status === 'Absent';
              const isHalf = r.status === 'Half Day';
              const isOff = r.status === 'Weekly Off';
              const rowClass = isPresent ? 'day-row-present' : isAbsent ? 'day-row-absent' : isHalf ? 'day-row-halfday' : isOff ? 'day-row-off' : '';

              return `
                <tr class="${rowClass}">
                  <td><strong>#${r.day}</strong></td>
                  <td><strong>${formatDate(r.date)}</strong></td>
                  <td><span style="color: ${isOff ? '#f59e0b' : '#475569'}; font-weight: ${isOff ? '700' : 'normal'};">${r.day_name}</span></td>
                  <td>
                    <span class="status-pill ${
                      isPresent ? 'status-present' :
                      isAbsent ? 'status-absent' :
                      isHalf ? 'status-halfday' : 'status-leave'
                    }">${r.status}</span>
                  </td>
                  <td style="font-size: 12.5px;">${r.check_in !== '-' ? `${r.check_in} → ${r.check_out}` : '-'}</td>
                  <td>${r.hours}</td>
                  <td>${formatCurrency(r.daily_rate)}</td>
                  <td style="color: ${r.earned_today > 0 ? '#10b981' : '#64748b'}; font-weight: 600;">
                    ${r.earned_today > 0 ? `+${formatCurrency(r.earned_today)}` : '₹0.00'}
                  </td>
                  <td style="color: ${r.deduction_today > 0 ? '#ef4444' : '#64748b'}; font-weight: 600;">
                    ${r.deduction_today > 0 ? `-${formatCurrency(r.deduction_today)}` : '₹0.00'}
                  </td>
                  <td style="color: ${r.advance_today > 0 ? '#d97706' : '#64748b'}; font-weight: 600;">
                    ${r.advance_today > 0 ? `-${formatCurrency(r.advance_today)}` : '-'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight: 800; background: #f1f5f9; font-size: 14px;">
              <td colspan="7" style="text-align: right; padding-right: 16px;">Month Totals:</td>
              <td style="color: #10b981;">+${formatCurrency(s.total_earned)}</td>
              <td style="color: #ef4444;">-${formatCurrency(s.total_deductions)}</td>
              <td style="color: #d97706;">-${formatCurrency(s.total_advances)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:red; text-align:center; padding: 20px;">Failed to load day-wise data: ${err.message}</p>`;
  }
}

function renderSalaryRows(records) {
  if (records.length === 0) {
    return `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 24px;">No salary records found for this period. Click 'Calculate Monthly Payroll' above.</td></tr>`;
  }
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return records.map(r => `
    <tr>
      <td><strong>${r.employee_code}</strong></td>
      <td>
        <div style="font-weight: 600;">${r.employee_name}</div>
        <div style="font-size: 11.5px; color: #64748b;">${r.position}</div>
      </td>
      <td><strong>${monthNames[r.month]} ${r.year}</strong></td>
      <td>${formatCurrency(r.fixed_salary)}</td>
      <td style="color: #2563eb; font-weight: 600;">
        ${formatCurrency(r.daily_salary)}<span style="font-size: 10.5px; color: #64748b;">/day</span>
      </td>
      <td>
        <span style="color:#10b981; font-weight:600;">${r.present_days}P</span> / 
        <span style="color:#ef4444; font-weight:600;">${r.absent_days}A</span>
        ${r.half_days > 0 ? `<span style="color:#f59e0b; font-size:11px;">(${r.half_days} HD)</span>` : ''}
      </td>
      <td style="color: #ef4444; font-weight: 600;">-${formatCurrency(r.absent_deduction + r.half_day_deduction)}</td>
      <td style="color: #d97706; font-weight: 600;">-${formatCurrency(r.advance_deduction)}</td>
      <td><strong style="font-size: 14.5px; color: #1e3a8a;">${formatCurrency(r.final_salary)}</strong></td>
      <td>
        <span class="status-pill ${r.payment_status === 'Paid' ? 'status-paid' : 'status-unpaid'}">
          ${r.payment_status}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="openDayWiseSalaryModal(${r.employee_id}, ${r.month}, ${r.year})" title="Day-Wise Breakdown">📅 Day-Wise</button>
          <button class="btn btn-secondary btn-sm" onclick='viewPayslipModal(${JSON.stringify(r).replace(/'/g, "\\'")})'>Payslip</button>
          ${r.payment_status !== 'Paid' ? `
            <button class="btn btn-success btn-sm" onclick="openPaySalaryModal(${r.id}, '${r.employee_name.replace(/'/g, "\\'")}', ${r.final_salary})">Pay</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function filterSalaryList() {
  const m = document.getElementById("sal-month-select").value;
  const y = document.getElementById("sal-year-select").value;
  try {
    const records = await apiRequest(`/salary/records?month=${m}&year=${y}`);
    document.getElementById("salary-table-body").innerHTML = renderSalaryRows(records);
    document.getElementById("sal-records-count").innerText = `${records.length} Records`;
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function triggerSalaryCalculation() {
  const m = parseInt(document.getElementById("sal-month-select").value);
  const y = parseInt(document.getElementById("sal-year-select").value);

  if (!confirm(`Calculate payroll for Month: ${m}/${y}? This will automatically calculate absent day deductions (Daily Rate * Absent Days), half-day deductions, and subtract outstanding advances.`)) return;

  try {
    const res = await apiRequest("/admin/salary/calculate", {
      method: "POST",
      body: JSON.stringify({ month: m, year: y })
    });
    showToast(res.message, "success");
    filterSalaryList();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openPaySalaryModal(recordId, empName, amount) {
  openModal(`Record Salary Payment - ${empName}`, `
    <form id="pay-sal-form" onsubmit="submitPaySalary(event, ${recordId})">
      <div class="form-group">
        <label>Employee Name</label>
        <input type="text" class="form-control" value="${empName}" disabled>
      </div>
      <div class="form-group">
        <label>Amount to Pay (₹)</label>
        <input type="number" id="pay-amount" class="form-control" value="${amount}" required step="0.01">
      </div>
      <div class="form-group">
        <label>Payment Method</label>
        <select id="pay-method" class="form-control">
          <option value="NEFT / RTGS Bank Transfer">NEFT / RTGS Bank Transfer</option>
          <option value="UPI Payment">UPI Payment</option>
          <option value="Company Cheque">Company Cheque</option>
          <option value="Cash Voucher">Cash Voucher</option>
        </select>
      </div>
      <div class="form-group">
        <label>Transaction Reference / Notes</label>
        <input type="text" id="pay-notes" class="form-control" placeholder="e.g. UTR / Ref No. 9812458921">
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-success">Confirm & Mark as Paid</button>
      </div>
    </form>
  `);
}

async function submitPaySalary(e, recordId) {
  e.preventDefault();
  const payload = {
    salary_record_id: recordId,
    amount_paid: parseFloat(document.getElementById("pay-amount").value),
    payment_method: document.getElementById("pay-method").value,
    notes: document.getElementById("pay-notes").value
  };

  try {
    const res = await apiRequest("/admin/salary/pay", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast(res.message, "success");
    closeModal();
    filterSalaryList();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function openDayWiseSalaryModal(empId, month, year) {
  openModal("Loading Day-Wise Salary...", "<p style='text-align:center; padding:30px;'>Fetching daily shift & salary breakdown...</p>", "", "modal-xl");
  try {
    const data = await apiRequest(`/salary/day-wise?month=${month}&year=${year}&employee_id=${empId}`);
    const emp = data.employee;
    const s = data.summary;
    const p = data.period;

    const bodyHtml = `
      <div style="margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="font-size: 18px; color: #0f172a;">${emp.name} (${emp.code})</h3>
          <p style="font-size: 13px; color: #64748b;">${emp.position} • Period: <strong>${p.month_name}</strong></p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 12px; color: #64748b;">Fixed Base Salary: <strong>${formatCurrency(emp.monthly_salary)}</strong></div>
          <div style="font-size: 13px; color: #2563eb; font-weight: 700;">Daily Rate: ${formatCurrency(emp.daily_salary_rate)} / day</div>
        </div>
      </div>

      <!-- Quick Metrics -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px;">
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; color: #166534; font-weight: 600;">PRESENT DAYS</div>
          <div style="font-size: 18px; font-weight: 800; color: #15803d; margin-top: 2px;">${s.present_days} Days</div>
          <div style="font-size: 11.5px; color: #166534;">+${formatCurrency(s.total_earned)}</div>
        </div>

        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; color: #991b1b; font-weight: 600;">ABSENT DAYS</div>
          <div style="font-size: 18px; font-weight: 800; color: #b91c1c; margin-top: 2px;">${s.absent_days} Days</div>
          <div style="font-size: 11.5px; color: #991b1b;">-${formatCurrency(s.total_deductions)}</div>
        </div>

        <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; color: #92400e; font-weight: 600;">ADVANCES</div>
          <div style="font-size: 18px; font-weight: 800; color: #b45309; margin-top: 2px;">${formatCurrency(s.total_advances)}</div>
          <div style="font-size: 11.5px; color: #92400e;">Deducted from pay</div>
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; color: #1e40af; font-weight: 600;">NET EARNED</div>
          <div style="font-size: 18px; font-weight: 800; color: #1d4ed8; margin-top: 2px;">${formatCurrency(s.net_payable)}</div>
          <div style="font-size: 11.5px; color: #1e40af;">Live Balance</div>
        </div>
      </div>

      <!-- Day by Day Table -->
      <div class="table-responsive" style="max-height: 480px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 45px;">Day</th>
              <th>Date</th>
              <th>Day</th>
              <th>Status</th>
              <th>Shift In / Out</th>
              <th>Hours</th>
              <th>Daily Rate</th>
              <th>Earned Today</th>
              <th>Deductions</th>
              <th>Advance Taken</th>
            </tr>
          </thead>
          <tbody>
            ${data.day_wise_records.map(r => {
              const isPresent = r.status === 'Present';
              const isAbsent = r.status === 'Absent';
              const isHalf = r.status === 'Half Day';
              const isOff = r.status === 'Weekly Off';
              const rowClass = isPresent ? 'day-row-present' : isAbsent ? 'day-row-absent' : isHalf ? 'day-row-halfday' : isOff ? 'day-row-off' : '';

              return `
                <tr class="${rowClass}">
                  <td><strong>#${r.day}</strong></td>
                  <td><strong>${formatDate(r.date)}</strong></td>
                  <td><span style="color: ${isOff ? '#f59e0b' : '#475569'}; font-weight: ${isOff ? '700' : 'normal'};">${r.day_name}</span></td>
                  <td>
                    <span class="status-pill ${
                      isPresent ? 'status-present' :
                      isAbsent ? 'status-absent' :
                      isHalf ? 'status-halfday' : 'status-leave'
                    }">${r.status}</span>
                  </td>
                  <td style="font-size: 12px;">${r.check_in !== '-' ? `${r.check_in} → ${r.check_out}` : '-'}</td>
                  <td>${r.hours}</td>
                  <td>${formatCurrency(r.daily_rate)}</td>
                  <td style="color: ${r.earned_today > 0 ? '#10b981' : '#64748b'}; font-weight: 600;">
                    ${r.earned_today > 0 ? `+${formatCurrency(r.earned_today)}` : '₹0.00'}
                  </td>
                  <td style="color: ${r.deduction_today > 0 ? '#ef4444' : '#64748b'}; font-weight: 600;">
                    ${r.deduction_today > 0 ? `-${formatCurrency(r.deduction_today)}` : '₹0.00'}
                  </td>
                  <td style="color: ${r.advance_today > 0 ? '#d97706' : '#64748b'}; font-weight: 600;">
                    ${r.advance_today > 0 ? `-${formatCurrency(r.advance_today)}` : '-'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    openModal(`📅 Day-Wise Salary Calendar - ${emp.name}`, bodyHtml, `
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="window.print()">🖨️ Print Day-Wise Sheet</button>
    `, "modal-xl");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Transparent Detailed Payslip Modal
function viewPayslipModal(r) {
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const totalDeductions = (r.absent_deduction || 0) + (r.half_day_deduction || 0) + (r.advance_deduction || 0) + (r.other_deduction || 0);

  openModal(`Salary Statement - ${r.employee_name}`, `
    <div class="payslip-container" id="printable-payslip">
      <div class="payslip-header">
        <div style="font-size: 24px;">🚚</div>
        <h2>AKR LOGISTICS</h2>
        <p style="font-size: 12px; color: #64748b;">Plot 14, Main Courier Hub, Express Freight Corridor</p>
        <div style="margin-top: 8px; font-weight: bold; font-size: 15px; color: #1e3a8a;">
          SALARY PAYSLIP - ${monthNames[r.month].toUpperCase()} ${r.year}
        </div>
      </div>

      <table class="payslip-table" style="margin-bottom: 14px;">
        <tr>
          <td><strong>Employee ID:</strong> ${r.employee_code}</td>
          <td><strong>Employee Name:</strong> ${r.employee_name}</td>
        </tr>
        <tr>
          <td><strong>Designation:</strong> ${r.position}</td>
          <td><strong>Working Days in Month:</strong> ${r.working_days} Days</td>
        </tr>
        <tr>
          <td><strong>Present Days:</strong> ${r.present_days} Days</td>
          <td><strong>Absent Days:</strong> ${r.absent_days} Days</td>
        </tr>
        <tr>
          <td><strong>Half Days:</strong> ${r.half_days} Days</td>
          <td><strong>Daily Rate Formula:</strong> Fixed / ${r.working_days} = ${formatCurrency(r.daily_salary)}</td>
        </tr>
      </table>

      <table class="payslip-table">
        <thead>
          <tr>
            <th>Earnings Description</th>
            <th style="text-align: right;">Amount (₹)</th>
            <th>Deductions Breakdown</th>
            <th style="text-align: right;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Basic Fixed Monthly Salary</td>
            <td style="text-align: right;">${formatCurrency(r.fixed_salary)}</td>
            <td>Absent Day Deduction (${r.absent_days} Days × ${formatCurrency(r.daily_salary)})</td>
            <td style="text-align: right; color: #ef4444;">${formatCurrency(r.absent_deduction)}</td>
          </tr>
          <tr>
            <td>Bonus & Allowances</td>
            <td style="text-align: right;">${formatCurrency(r.bonus)}</td>
            <td>Half Day Deduction (${r.half_days} Days × 50%)</td>
            <td style="text-align: right; color: #ef4444;">${formatCurrency(r.half_day_deduction)}</td>
          </tr>
          <tr>
            <td></td>
            <td></td>
            <td>Employee Advance Recovery</td>
            <td style="text-align: right; color: #d97706;">${formatCurrency(r.advance_deduction)}</td>
          </tr>
          <tr>
            <td></td>
            <td></td>
            <td>Other Deductions</td>
            <td style="text-align: right;">${formatCurrency(r.other_deduction)}</td>
          </tr>
          <tr style="font-weight: bold; background: #f8fafc;">
            <td>Total Gross Earnings</td>
            <td style="text-align: right;">${formatCurrency(r.fixed_salary + r.bonus)}</td>
            <td>Total Deductions</td>
            <td style="text-align: right; color: #ef4444;">${formatCurrency(totalDeductions)}</td>
          </tr>
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding: 14px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe;">
        <div>
          <span style="font-size: 13px; color: #1e3a8a; font-weight: 600;">PAYMENT STATUS:</span>
          <span class="status-pill ${r.payment_status === 'Paid' ? 'status-paid' : 'status-unpaid'}" style="margin-left: 8px;">${r.payment_status}</span>
        </div>
        <div>
          <span style="font-size: 13px; color: #64748b;">NET SALARY PAYABLE:</span>
          <strong style="font-size: 20px; color: #1e3a8a; margin-left: 8px;">${formatCurrency(r.final_salary)}</strong>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    <button class="btn btn-primary" onclick="window.print()">🖨️ Print / Download PDF</button>
  `);
}

// ----------------- REPORTS VIEW -----------------
async function renderReportsView(container) {
  const employees = await apiRequest("/admin/employees");
  const today = new Date().toISOString().split("T")[0];

  container.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-header">
        <h2>Generate Administrative Reports</h2>
      </div>
      <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; align-items: flex-end;">
          <div class="form-group" style="margin-bottom: 0;">
            <label>Report Type</label>
            <select id="report-type" class="form-control" onchange="handleReportTypeChange()">
              <option value="daily_attendance">1. Daily Attendance Report</option>
              <option value="monthly_attendance">2. Monthly Attendance Report</option>
              <option value="monthly_salary">3. Monthly Salary & Payroll Report</option>
              <option value="advances">4. Employee Advances Report</option>
              <option value="outstanding_advances">5. Outstanding Advances Report</option>
            </select>
          </div>

          <div class="form-group" id="report-date-box" style="margin-bottom: 0;">
            <label>Select Date</label>
            <input type="date" id="report-date" class="form-control" value="${today}">
          </div>

          <div class="form-group" id="report-month-box" style="margin-bottom: 0; display: none;">
            <label>Select Month</label>
            <select id="report-month" class="form-control">
              <option value="9" selected>September 2026</option>
              <option value="8">August 2026</option>
            </select>
          </div>

          <div style="display: flex; gap: 10px;">
            <button class="btn btn-primary" style="flex:1;" onclick="fetchAndDisplayReport()">Generate Report</button>
            <button class="btn btn-secondary" onclick="window.print()" title="Print / Save PDF">🖨️ Print</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" id="report-output-card">
      <div class="card-header" style="justify-content: space-between;">
        <h2 id="report-output-title">Report Preview</h2>
        <button class="btn btn-secondary btn-sm" onclick="exportReportToCSV()">Export CSV</button>
      </div>
      <div class="card-body">
        <div id="report-data-container">
          <p style="color: #64748b; text-align: center; padding: 20px;">Select filters above and click 'Generate Report'.</p>
        </div>
      </div>
    </div>
  `;

  // Auto generate first report
  fetchAndDisplayReport();
}

function handleReportTypeChange() {
  const t = document.getElementById("report-type").value;
  const dBox = document.getElementById("report-date-box");
  const mBox = document.getElementById("report-month-box");

  if (t === "daily_attendance") {
    dBox.style.display = "block";
    mBox.style.display = "none";
  } else if (t === "monthly_attendance" || t === "monthly_salary") {
    dBox.style.display = "none";
    mBox.style.display = "block";
  } else {
    dBox.style.display = "none";
    mBox.style.display = "none";
  }
}

let currentReportData = [];
async function fetchAndDisplayReport() {
  const type = document.getElementById("report-type").value;
  const dVal = document.getElementById("report-date").value;
  const mVal = document.getElementById("report-month").value;

  let url = `/admin/reports?report_type=${type}`;
  if (type === "daily_attendance") url += `&date_val=${dVal}`;
  if (type === "monthly_attendance" || type === "monthly_salary") url += `&month=${mVal}&year=2026`;

  const container = document.getElementById("report-data-container");
  container.innerHTML = `<p style="text-align: center; color: #64748b;">Loading report data...</p>`;

  try {
    const data = await apiRequest(url);
    currentReportData = data;

    if (data.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: #94a3b8; padding: 20px;">No records found for the selected report parameters.</p>`;
      return;
    }

    if (type === "daily_attendance") {
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Emp Code</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Total Hours</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td><strong>${r.employee_code}</strong></td>
                <td>${r.employee_name}</td>
                <td>${r.position}</td>
                <td><span class="status-pill status-${r.status.toLowerCase().replace(' ', '')}">${r.status}</span></td>
                <td>${r.check_in_time || '-'}</td>
                <td>${r.check_out_time || '-'}</td>
                <td>${r.working_hours_formatted}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === "monthly_attendance") {
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Emp Code</th>
              <th>Employee Name</th>
              <th>Designation</th>
              <th>Present Days</th>
              <th>Absent Days</th>
              <th>Half Days</th>
              <th>Total Shift Hours</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td><strong>${r.employee_code}</strong></td>
                <td>${r.employee_name}</td>
                <td>${r.position}</td>
                <td><strong style="color:#10b981;">${r.present_days} Days</strong></td>
                <td><strong style="color:#ef4444;">${r.absent_days} Days</strong></td>
                <td>${r.half_days} Days</td>
                <td>${r.total_hours_formatted}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === "monthly_salary") {
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Emp Code</th>
              <th>Employee Name</th>
              <th>Fixed Salary</th>
              <th>Absent Days</th>
              <th>Absent Deduct.</th>
              <th>Advance Deduct.</th>
              <th>Net Salary</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td><strong>${r.employee_code}</strong></td>
                <td>${r.employee_name}</td>
                <td>${formatCurrency(r.fixed_salary)}</td>
                <td>${r.absent_days}</td>
                <td style="color:#ef4444;">-${formatCurrency(r.absent_deduction + r.half_day_deduction)}</td>
                <td style="color:#d97706;">-${formatCurrency(r.advance_deduction)}</td>
                <td><strong style="color:#1e3a8a;">${formatCurrency(r.final_salary)}</strong></td>
                <td><span class="status-pill status-${r.payment_status.toLowerCase()}">${r.payment_status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Employee Name</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Reason</th>
              <th>Recorded By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td><strong>${r.employee_code}</strong></td>
                <td>${r.employee_name}</td>
                <td><strong style="color:#d97706;">${formatCurrency(r.amount)}</strong></td>
                <td>${formatDate(r.transaction_date)}</td>
                <td>${r.reason}</td>
                <td>${r.recorded_by}</td>
                <td><span class="status-pill ${r.status === 'Outstanding' ? 'status-halfday' : 'status-paid'}">${r.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    container.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
  }
}

function exportReportToCSV() {
  if (!currentReportData || currentReportData.length === 0) {
    showToast("No data to export", "error");
    return;
  }
  const keys = Object.keys(currentReportData[0]);
  const rows = [keys.join(",")];
  currentReportData.forEach(item => {
    rows.push(keys.map(k => `"${String(item[k] || '').replace(/"/g, '""')}"`).join(","));
  });
  const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `courier_report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// ----------------- AUDIT LOGS -----------------
async function renderAuditView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading security audit logs...</p></div>`;
  try {
    const logs = await apiRequest("/admin/audit-logs");
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Administrative Action & Financial Audit Trail</h2>
          <span class="status-pill status-present">Immutable Record</span>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Log ID</th>
                <th>Admin Name</th>
                <th>Action Performed</th>
                <th>Affected Entity</th>
                <th>Details & Rationale</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>#${l.id}</td>
                  <td><strong>${l.admin_name}</strong></td>
                  <td><span class="status-pill status-halfday">${l.action}</span></td>
                  <td>${l.employee_affected || '-'}</td>
                  <td>${l.details || '-'}</td>
                  <td style="color:#64748b; font-size:12px;">${l.created_at}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load audit logs: ${err.message}</div>`;
  }
}

// ----------------- SETTINGS VIEW -----------------
async function renderSettingsView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading settings...</p></div>`;
  try {
    const s = await apiRequest("/settings");
    container.innerHTML = `
      <div class="card" style="max-width: 680px;">
        <div class="card-header">
          <h2>Office Operational & Salary Deduction Rules</h2>
        </div>
        <div class="card-body">
          <form id="settings-form" onsubmit="saveSettings(event)">
            <div class="form-group">
              <label>Company / Hub Name</label>
              <input type="text" id="set-office-name" class="form-control" value="${s.office_name || 'AKR LOGISTICS'}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Standard Working Days Per Month</label>
                <input type="number" id="set-working-days" class="form-control" value="${s.working_days_per_month || '26'}" min="20" max="31" required>
                <small style="color: #64748b;">Daily Salary Formula = Monthly Salary / Working Days</small>
              </div>
              <div class="form-group">
                <label>Weekly Off Day</label>
                <select id="set-weekly-off" class="form-control">
                  <option value="Sunday" ${s.weekly_off_day === 'Sunday' ? 'selected' : ''}>Sunday</option>
                  <option value="Saturday" ${s.weekly_off_day === 'Saturday' ? 'selected' : ''}>Saturday</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Leave Deduction Rule</label>
              <select id="set-leave-rule" class="form-control">
                <option value="Unpaid" ${s.leave_deduction_rule === 'Unpaid' ? 'selected' : ''}>Unpaid (Deducts 100% of daily salary)</option>
                <option value="Paid" ${s.leave_deduction_rule === 'Paid' ? 'selected' : ''}>Paid Leave (No deduction)</option>
              </select>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px; font-size: 13px; margin-bottom: 20px;">
              <strong>Configured Salary Formula:</strong><br>
              • Daily Rate = Fixed Monthly Salary / Working Days<br>
              • Absent Deduction = Daily Rate × Number of Absent Days<br>
              • Half-Day Deduction = 50% of Daily Rate × Number of Half Days<br>
              • Advance Deduction = Auto-recovered against outstanding advances
            </div>
            <button type="submit" class="btn btn-primary">Save System Settings</button>
          </form>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load settings: ${err.message}</div>`;
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    office_name: document.getElementById("set-office-name").value,
    working_days_per_month: parseInt(document.getElementById("set-working-days").value),
    weekly_off_day: document.getElementById("set-weekly-off").value,
    leave_deduction_rule: document.getElementById("set-leave-rule").value
  };

  try {
    const res = await apiRequest("/admin/settings", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast(res.message, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ----------------- NOTIFICATIONS VIEW -----------------
async function renderNotificationsView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading notifications...</p></div>`;
  try {
    const res = await apiRequest("/notifications");
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Notifications & Alerts</h2>
          <button class="btn btn-secondary btn-sm" onclick="markAllNotificationsRead()">Mark All Read</button>
        </div>
        <div class="card-body">
          <div class="activity-feed">
            ${res.notifications.length === 0 ? '<p style="color:#94a3b8; text-align:center; padding:20px;">No notifications yet.</p>' : ''}
            ${res.notifications.map(n => `
              <div class="activity-item" style="background: ${n.is_read ? 'transparent' : '#f8fafc'}; padding: 14px; border-radius: 8px;">
                <div class="activity-badge" style="background: ${n.notification_type === 'ADVANCE' ? '#fef3c7' : n.notification_type === 'SALARY' ? '#d1fae5' : '#eff6ff'};">
                  ${n.notification_type === 'ADVANCE' ? '💸' : n.notification_type === 'SALARY' ? '💰' : '🔔'}
                </div>
                <div class="activity-content">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="activity-title">${n.title}</div>
                    ${!n.is_read ? `<button class="btn btn-secondary btn-sm" onclick="markSingleNotificationRead(${n.id})" style="font-size: 11px;">Mark Read</button>` : ''}
                  </div>
                  <div class="activity-desc" style="margin-top: 4px; font-size: 13px;">${n.message}</div>
                  <div class="activity-time">${n.created_at}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    fetchUnreadNotificationCount();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load notifications: ${err.message}</div>`;
  }
}

async function fetchUnreadNotificationCount() {
  try {
    const res = await apiRequest("/notifications");
    const badge = document.getElementById("topbar-notif-count");
    if (badge) {
      if (res.unread_count > 0) {
        badge.innerText = res.unread_count;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    }
  } catch (e) {}
}

async function markSingleNotificationRead(id) {
  try {
    await apiRequest(`/notifications/${id}/read`, { method: "POST" });
    renderNotificationsView(document.getElementById("view-container"));
  } catch (e) {}
}

async function markAllNotificationsRead() {
  try {
    await apiRequest("/notifications/mark-all-read", { method: "POST" });
    showToast("All notifications marked read", "success");
    renderNotificationsView(document.getElementById("view-container"));
  } catch (e) {}
}

// ----------------- WORKER PORTAL DASHBOARD -----------------
async function renderWorkerDashboard(container) {
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><p>Loading worker dashboard...</p></div>`;
  try {
    const todayStatus = await apiRequest("/worker/today-status");
    const recentAtt = await apiRequest("/attendance");
    const advances = await apiRequest("/advances");
    const salaryRecs = await apiRequest("/salary/records");

    const outstandingAdvance = advances.filter(a => a.status !== 'Deducted').reduce((acc, a) => acc + (a.amount - a.deducted_amount), 0);
    const lastSalary = salaryRecs.length > 0 ? salaryRecs[0] : null;

    container.innerHTML = `
      <!-- Check In / Check Out Hero Card -->
      <div class="worker-hero">
        <div>
          <h2>Welcome, ${currentUser.name}!</h2>
          <p>${currentUser.position} • ID: <strong>${currentUser.employee_id}</strong></p>
          <div style="margin-top: 10px; font-size: 13.5px; opacity: 0.9;">
            Today's Date: <strong>${formatDate(new Date().toISOString().slice(0,10))}</strong> | Status: 
            <span class="status-pill status-${todayStatus.status.toLowerCase().replace(' ', '')}" style="margin-left: 6px;">
              ${todayStatus.status}
            </span>
          </div>
        </div>

        <div class="punch-controls">
          <button class="btn-punch-in" id="punch-in-btn" onclick="workerCheckIn()" ${todayStatus.checked_in ? 'disabled' : ''}>
            <span>🕒</span> CHECK IN
          </button>
          <button class="btn-punch-out" id="punch-out-btn" onclick="workerCheckOut()" ${(!todayStatus.checked_in || todayStatus.checked_out) ? 'disabled' : ''}>
            <span>🚪</span> CHECK OUT
          </button>
        </div>
      </div>

      <!-- Quick Stats Cards -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-info">
            <h3>Today's Shift Hours</h3>
            <div class="value">${todayStatus.working_hours}</div>
            <div class="sub-text">In: ${todayStatus.check_in_time || '-'} | Out: ${todayStatus.check_out_time || '-'}</div>
          </div>
          <div class="icon-box icon-blue">⏱️</div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <h3>Monthly Fixed Salary</h3>
            <div class="value">${formatCurrency(currentUser.monthly_salary)}</div>
            <div class="sub-text">Daily Rate: ${formatCurrency(currentUser.daily_salary)}</div>
          </div>
          <div class="icon-box icon-green">💰</div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <h3>Outstanding Advance</h3>
            <div class="value" style="color: ${outstandingAdvance > 0 ? '#d97706' : '#10b981'};">${formatCurrency(outstandingAdvance)}</div>
            <div class="sub-text">Balance to be recovered</div>
          </div>
          <div class="icon-box icon-amber">💸</div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <h3>Latest Net Salary</h3>
            <div class="value">${lastSalary ? formatCurrency(lastSalary.final_salary) : 'Pending'}</div>
            <div class="sub-text">${lastSalary ? `Status: ${lastSalary.payment_status}` : 'Pending calculation'}</div>
          </div>
          <div class="icon-box icon-cyan">📑</div>
        </div>
      </div>

      <div class="dashboard-row">
        <!-- Recent Attendance -->
        <div class="card">
          <div class="card-header">
            <h2>Recent Attendance History</h2>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('worker_attendance')">View All</button>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${recentAtt.slice(0, 5).map(r => `
                  <tr>
                    <td>${formatDate(r.date)}</td>
                    <td>${r.check_in_time || '-'}</td>
                    <td>${r.check_out_time || '-'}</td>
                    <td>${r.working_hours_formatted}</td>
                    <td><span class="status-pill status-${r.status.toLowerCase().replace(' ', '')}">${r.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recent Advances Taken -->
        <div class="card">
          <div class="card-header">
            <h2>My Advances</h2>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('worker_advances')">View All</button>
          </div>
          <div class="card-body">
            <div class="activity-feed">
              ${advances.length === 0 ? '<p style="color:#94a3b8; font-size:13px;">No advance transactions recorded.</p>' : ''}
              ${advances.slice(0, 4).map(a => `
                <div class="activity-item">
                  <div class="activity-badge" style="background:#fef3c7;">💸</div>
                  <div class="activity-content">
                    <div class="activity-title">${formatCurrency(a.amount)} <span class="status-pill ${a.status === 'Outstanding' ? 'status-halfday' : 'status-paid'}" style="margin-left: 6px; font-size: 11px;">${a.status}</span></div>
                    <div class="activity-desc">${a.reason}</div>
                    <div class="activity-time">${formatDate(a.transaction_date)} • Recorded by ${a.recorded_by}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 24px; color: red;">Failed to load worker dashboard: ${err.message}</div>`;
  }
}

async function workerCheckIn() {
  try {
    const res = await apiRequest("/worker/check-in", { method: "POST" });
    showToast(res.message, "success");
    renderWorkerDashboard(document.getElementById("view-container"));
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function workerCheckOut() {
  try {
    const res = await apiRequest("/worker/check-out", { method: "POST" });
    showToast(res.message, "success");
    renderWorkerDashboard(document.getElementById("view-container"));
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Worker Subviews
async function renderWorkerAttendanceView(container) {
  const records = await apiRequest("/attendance");
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>My Verified Attendance Record</h2>
        <span class="status-pill status-present">${records.length} Total Logs</span>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Working Hours</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${records.map(r => `
              <tr>
                <td>${formatDate(r.date)}</td>
                <td>${r.check_in_time || '-'}</td>
                <td>${r.check_out_time || '-'}</td>
                <td><strong>${r.working_hours_formatted}</strong></td>
                <td><span class="status-pill status-${r.status.toLowerCase().replace(' ', '')}">${r.status}</span></td>
                <td>${r.notes || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderWorkerSalaryView(container) {
  const records = await apiRequest("/salary/records");
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>My Monthly Salary Statements</h2>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Month / Year</th>
              <th>Fixed Base Salary</th>
              <th>Day-Wise Rate</th>
              <th>Present / Absent</th>
              <th>Absent Deductions</th>
              <th>Advance Deductions</th>
              <th>Net Salary Payable</th>
              <th>Payment Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${records.length === 0 ? '<tr><td colspan="9" style="text-align:center; padding:20px; color:#94a3b8;">No processed salary slips available yet.</td></tr>' : ''}
            ${records.map(r => `
              <tr>
                <td><strong>${monthNames[r.month]} ${r.year}</strong></td>
                <td>${formatCurrency(r.fixed_salary)}</td>
                <td style="color: #2563eb; font-weight: 600;">
                  ${formatCurrency(r.daily_salary)}<span style="font-size: 10.5px; color: #64748b;">/day</span>
                </td>
                <td>${r.present_days} Pres. / ${r.absent_days} Abs.</td>
                <td style="color:#ef4444; font-weight:600;">-${formatCurrency(r.absent_deduction + r.half_day_deduction)}</td>
                <td style="color:#d97706; font-weight:600;">-${formatCurrency(r.advance_deduction)}</td>
                <td><strong style="font-size:15px; color:#1e3a8a;">${formatCurrency(r.final_salary)}</strong></td>
                <td><span class="status-pill status-${r.payment_status.toLowerCase()}">${r.payment_status}</span></td>
                <td>
                  <div style="display: flex; gap: 6px;">
                    <button class="btn btn-secondary btn-sm" onclick="openDayWiseSalaryModal(${r.employee_id}, ${r.month}, ${r.year})" title="Day-Wise Breakdown">📅 Day-Wise</button>
                    <button class="btn btn-secondary btn-sm" onclick='viewPayslipModal(${JSON.stringify(r).replace(/'/g, "\\'")})'>View Slip</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderWorkerAdvancesView(container) {
  const advances = await apiRequest("/advances");
  const total = advances.reduce((a, b) => a + b.amount, 0);
  const outstanding = advances.filter(a => a.status !== 'Deducted').reduce((a, b) => a + (b.amount - b.deducted_amount), 0);

  container.innerHTML = `
    <div class="metrics-grid" style="margin-bottom: 20px;">
      <div class="metric-card">
        <div class="metric-info">
          <h3>Total Advance Received</h3>
          <div class="value">${formatCurrency(total)}</div>
        </div>
        <div class="icon-box icon-amber">💸</div>
      </div>
      <div class="metric-card">
        <div class="metric-info">
          <h3>Current Outstanding Loan</h3>
          <div class="value" style="color:#ef4444;">${formatCurrency(outstanding)}</div>
        </div>
        <div class="icon-box icon-red">⚠️</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>My Advance History & Recovery Status</h2>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tx ID</th>
              <th>Amount</th>
              <th>Payment Type</th>
              <th>Date & Time</th>
              <th>Reason</th>
              <th>Authorized By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${advances.map(a => `
              <tr>
                <td><strong>ADV-${String(a.id).padStart(4, '0')}</strong></td>
                <td><strong style="color:#d97706; font-size:14px;">${formatCurrency(a.amount)}</strong></td>
                <td><span class="status-pill status-leave" style="font-size: 11.5px;">${a.payment_type || 'Cash'}</span></td>
                <td>${formatDate(a.transaction_date)} ${a.transaction_time}</td>
                <td>${a.reason}</td>
                <td>${a.recorded_by}</td>
                <td><span class="status-pill ${a.status === 'Outstanding' ? 'status-halfday' : 'status-paid'}">${a.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderWorkerProfileView(container) {
  const emp = await apiRequest(`/auth/me`);
  container.innerHTML = `
    <div class="card" style="max-width: 600px;">
      <div class="card-header">
        <h2>My Employee Profile</h2>
      </div>
      <div class="card-body">
        <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px;">
          <div id="worker-profile-avatar-container" style="position: relative;">
            ${renderAvatarHtml(emp.name, emp.profile_image, 76, 28)}
            <label for="worker-direct-photo-input" style="position: absolute; bottom: -4px; right: -4px; background: #2563eb; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.25);" title="Change Profile Photo">
              📷
            </label>
            <input type="file" id="worker-direct-photo-input" style="display: none;" accept="image/*" onchange="uploadWorkerDirectPhoto(event)">
          </div>
          <div>
            <h3 style="font-size: 20px;">${emp.name}</h3>
            <p style="color: #64748b; font-size: 14px;">${emp.position} • Employee ID: <strong>${emp.employee_code || emp.employee_id}</strong></p>
            <span class="status-pill status-active" style="margin-top: 6px;">${emp.account_status}</span>
          </div>
        </div>

        <div style="padding: 12px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-size: 13px; color: #166534;">
            <strong>Profile Photo:</strong> Update your profile picture anytime.
          </div>
          <div style="display: flex; gap: 8px;">
            <label for="worker-direct-photo-input" class="btn btn-secondary btn-sm" style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
              📁 File
            </label>
            <button type="button" class="btn btn-primary btn-sm" style="display: flex; align-items: center; gap: 4px;" onclick="triggerWorkerLiveCamera()">
              📷 Live Camera
            </button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 13.5px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          <div><strong>Email:</strong><br>${emp.email}</div>
          <div><strong>Phone:</strong><br>${emp.phone || '-'}</div>
          <div><strong>Monthly Salary:</strong><br>${formatCurrency(emp.monthly_salary)}</div>
          <div><strong>Daily Salary Rate:</strong><br>${formatCurrency(emp.daily_salary)}</div>
          <div><strong>Joining Date:</strong><br>${formatDate(emp.joining_date)}</div>
          <div><strong>System Role:</strong><br>${emp.role}</div>
        </div>
      </div>
    </div>
  `;
}

function uploadWorkerDirectPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 250;
      let width = img.width, height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      try {
        const res = await apiRequest("/worker/profile-photo", {
          method: "POST",
          body: JSON.stringify({ profile_image: dataUrl })
        });
        showToast(res.message, "success");
        if (currentUser) {
          currentUser.profile_image = dataUrl;
          localStorage.setItem("courier_user", JSON.stringify(currentUser));
        }
        renderWorkerProfileView(document.getElementById("view-container"));
        const topbarAvatar = document.getElementById("topbar-avatar");
        if (topbarAvatar) topbarAvatar.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        const sidebarAvatar = document.getElementById("sidebar-user-avatar");
        if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function toggleUserMenu() {
  // Quick profile modal
  if (currentUser) {
    openModal("My Account", `
      <p><strong>Name:</strong> ${currentUser.name}</p>
      <p><strong>Role:</strong> ${currentUser.role}</p>
      <p><strong>Email:</strong> ${currentUser.email}</p>
      <p><strong>Status:</strong> ${currentUser.account_status}</p>
    `, `<button class="btn btn-danger" onclick="handleLogout()">Logout</button>`);
  }
}

// App Bootstrap
window.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function onEditEmpCameraCapture(dataUrl) {
  document.getElementById("edit-photo-base64").value = dataUrl;
  const box = document.getElementById("edit-photo-preview-box");
  if (box) box.innerHTML = `<img src="${dataUrl}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #2563eb;">`;
}

function triggerWorkerLiveCamera() {
  openCameraModal(null, null, null, async (dataUrl) => {
    try {
      const res = await apiRequest("/worker/profile-photo", {
        method: "POST",
        body: JSON.stringify({ profile_image: dataUrl })
      });
      showToast(res.message, "success");
      if (currentUser) {
        currentUser.profile_image = dataUrl;
        localStorage.setItem("courier_user", JSON.stringify(currentUser));
      }
      renderWorkerProfileView(document.getElementById("view-container"));
      const topbarAvatar = document.getElementById("topbar-avatar");
      if (topbarAvatar) topbarAvatar.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
      const sidebarAvatar = document.getElementById("sidebar-user-avatar");
      if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}
