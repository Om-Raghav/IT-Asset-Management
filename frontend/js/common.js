// Renders the shared sidebar/topbar and wires up logout on every authenticated page.
const NAV_ITEMS = [
  { href: 'dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard' },
  { href: 'assets.html', icon: 'bi-laptop', label: 'Assets' },
  { href: 'categories.html', icon: 'bi-tags', label: 'Asset Categories' },
  { href: 'assignments.html', icon: 'bi-person-check', label: 'Allocations' },
  { href: 'returns.html', icon: 'bi-arrow-return-left', label: 'Returns' },
  { href: 'repairs.html', icon: 'bi-tools', label: 'Repairs' },
  { href: 'licenses.html', icon: 'bi-key', label: 'Software Licenses' },
  { href: 'amc.html', icon: 'bi-file-earmark-text', label: 'AMC Contracts' },
  { href: 'vendors.html', icon: 'bi-truck', label: 'Vendors' },
  { href: 'employees.html', icon: 'bi-people', label: 'Employees' },
  { href: 'departments.html', icon: 'bi-diagram-3', label: 'Departments' },
  { href: 'locations.html', icon: 'bi-geo-alt', label: 'Locations' },
  { href: 'notifications.html', icon: 'bi-bell', label: 'Notifications' },
  { href: 'reports.html', icon: 'bi-bar-chart', label: 'Reports' },
  { href: 'ai-assistant.html', icon: 'bi-robot', label: 'AI Assistant' },
  { href: 'audit-logs.html', icon: 'bi-clock-history', label: 'Audit Logs' }
];

// Simplified nav for the Employee self-service role - just their own portal.
const EMPLOYEE_NAV_ITEMS = [
  { href: 'employee-dashboard.html', icon: 'bi-house-door', label: 'My Dashboard' }
];

// Pages an Employee is allowed to reach directly - anything else bounces home.
const EMPLOYEE_ALLOWED_PAGES = EMPLOYEE_NAV_ITEMS.map(i => i.href);

function renderLayout(activePage) {
  requireAuth();
  const user = getCurrentUser();

  // Guard: an Employee who types/bookmarks an admin URL directly (including
  // the full admin dashboard.html) gets sent back to their own dashboard.
  if (user && user.roleName === 'Employee' && !EMPLOYEE_ALLOWED_PAGES.includes(activePage)) {
    window.location.href = 'employee-dashboard.html';
    return;
  }

  const navSet = user && user.roleName === 'Employee' ? EMPLOYEE_NAV_ITEMS : NAV_ITEMS;

  const navHtml = navSet.map(item => `
    <a class="nav-link ${item.href === activePage ? 'active' : ''}" href="${item.href}" data-bs-toggle="tooltip" data-bs-placement="right" title="${item.label}">
      <i class="bi ${item.icon}"></i><span class="nav-label">${item.label}</span>
    </a>
  `).join('');

  $('#sidebar').html(`
    <div class="sidebar-brand">
      <span class="brand-full"><i class="bi bi-hdd-stack-fill"></i> ITAMS</span>
      <span class="brand-mini"><i class="bi bi-hdd-stack-fill"></i></span>
      <button class="btn btn-sm collapse-toggle d-none d-lg-inline-flex" id="collapseToggle" title="Collapse sidebar">
        <i class="bi bi-chevron-left"></i>
      </button>
    </div>
    <nav class="nav flex-column px-2">${navHtml}</nav>
  `);

  $('#topbar').html(`
    <div class="d-flex align-items-center justify-content-between w-100">
      <button class="btn btn-sm btn-outline-secondary d-lg-none" id="sidebarToggle"><i class="bi bi-list"></i></button>
      <div class="ms-auto d-flex align-items-center gap-3">
        <span class="text-muted small"><i class="bi bi-person-circle me-1"></i>${user ? user.name : ''} <span class="badge bg-secondary">${user ? user.roleName : ''}</span></span>
        <button class="btn btn-sm btn-outline-secondary" id="changePasswordBtn" title="Change Password"><i class="bi bi-shield-lock me-1"></i>Change Password</button>
        <button class="btn btn-sm btn-outline-danger" id="logoutBtn"><i class="bi bi-box-arrow-right me-1"></i>Logout</button>
      </div>
    </div>
  `);

  $('#logoutBtn').on('click', logout);
  $('#sidebarToggle').on('click', () => $('#sidebar').toggleClass('show'));
  initChangePasswordModal();
  initChatWidget();

  // Restore collapsed/expanded state from last time (persists across page loads)
  const collapsed = localStorage.getItem('itams_sidebar_collapsed') === 'true';
  if (collapsed) $('#sidebar').addClass('collapsed');

  $('#collapseToggle').on('click', () => {
    const isNowCollapsed = $('#sidebar').toggleClass('collapsed').hasClass('collapsed');
    localStorage.setItem('itams_sidebar_collapsed', isNowCollapsed);
    $('[data-bs-toggle="tooltip"]').tooltip('dispose');
    if (isNowCollapsed) {
      $('[data-bs-toggle="tooltip"]').tooltip();
    }
  });

  // Enable icon tooltips only while collapsed (so labels aren't redundant when expanded)
  if (collapsed) {
    $('[data-bs-toggle="tooltip"]').tooltip();
  }
}

function showToast(message, type = 'success') {
  const id = 'toast-' + Date.now();
  const html = `
    <div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`;
  $('#toastContainer').append(html);
  const toastEl = document.getElementById(id);
  const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => $(toastEl).remove());
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString();
}

// Injects the shared Change Password modal into the page once (idempotent -
// safe to call every time renderLayout runs) and wires up its submit
// handler. Works for both Admin and Employee, since every authenticated
// page goes through renderLayout().
function initChangePasswordModal() {
  if ($('#changePasswordModal').length === 0) {
    $('body').append(`
      <div class="modal fade" id="changePasswordModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <form id="changePasswordForm">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-shield-lock me-2"></i>Change Password</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div id="changePasswordError" class="alert alert-danger d-none"></div>
                <div class="mb-3">
                  <label class="form-label">Current Password *</label>
                  <input type="password" class="form-control" id="currentPassword" required autocomplete="current-password">
                </div>
                <div class="mb-3">
                  <label class="form-label">New Password *</label>
                  <input type="password" class="form-control" id="newPassword" required minlength="6" autocomplete="new-password">
                  <div class="form-text">At least 6 characters.</div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Confirm New Password *</label>
                  <input type="password" class="form-control" id="confirmNewPassword" required minlength="6" autocomplete="new-password">
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary">Update Password</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `);
  }

  $('#changePasswordBtn').off('click').on('click', () => {
    $('#changePasswordForm')[0].reset();
    $('#changePasswordError').addClass('d-none');
    new bootstrap.Modal(document.getElementById('changePasswordModal')).show();
  });

  $('#changePasswordForm').off('submit').on('submit', function (e) {
    e.preventDefault();
    const currentPassword = $('#currentPassword').val();
    const newPassword = $('#newPassword').val();
    const confirmNewPassword = $('#confirmNewPassword').val();
    const errorBox = $('#changePasswordError').addClass('d-none');

    if (newPassword !== confirmNewPassword) {
      errorBox.text('New password and confirmation do not match.').removeClass('d-none');
      return;
    }

    Api.put('/auth/change-password', { currentPassword, newPassword }).done(() => {
      bootstrap.Modal.getInstance(document.getElementById('changePasswordModal')).hide();
      showToast('Password changed successfully. Use it next time you log in.');
    }).fail(xhr => {
      errorBox.text(xhr.responseJSON?.message || 'Failed to change password.').removeClass('d-none');
    });
  });
}
