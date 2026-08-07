// Handles login page behaviour and route-guarding for other pages.

function requireAuth() {
  const token = localStorage.getItem('itams_token');
  if (!token) {
    window.location.href = 'index.html';
  }
}

function getCurrentUser() {
  const raw = localStorage.getItem('itams_user');
  return raw ? JSON.parse(raw) : null;
}

function logout() {
  localStorage.removeItem('itams_token');
  localStorage.removeItem('itams_user');
  window.location.href = 'index.html';
}

// Employees land on their own simplified self-service dashboard;
// Admin/Manager land on the full admin dashboard.
function homePageFor(roleName) {
  return roleName === 'Employee' ? 'employee-dashboard.html' : 'dashboard.html';
}

$(function () {
  const loginForm = $('#loginForm');
  if (loginForm.length) {
    // If already logged in, go straight to the right home page
    const existingUser = getCurrentUser();
    if (localStorage.getItem('itams_token') && existingUser) {
      window.location.href = homePageFor(existingUser.roleName);
    }

    loginForm.on('submit', function (e) {
      e.preventDefault();
      const email = $('#email').val().trim();
      const password = $('#password').val();
      const errorBox = $('#loginError').addClass('d-none');

      Api.post('/auth/login', { email, password })
        .done((res) => {
          localStorage.setItem('itams_token', res.data.token);
          localStorage.setItem('itams_user', JSON.stringify({
            id: res.data._id, name: res.data.name, email: res.data.email, roleName: res.data.roleName
          }));
          window.location.href = homePageFor(res.data.roleName);
        })
        .fail((xhr) => {
          const msg = xhr.responseJSON?.message || 'Login failed. Please check your credentials.';
          errorBox.text(msg).removeClass('d-none');
        });
    });
  }
});
