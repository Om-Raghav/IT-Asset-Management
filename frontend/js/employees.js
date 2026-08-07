$(function () {
  initCrudPage({
    endpoint: '/employees',
    title: 'Employees',
    columns: [
      { key: 'employeeCode', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'department.name', label: 'Department' },
      { key: 'designation', label: 'Designation' },
      { key: 'status', label: 'Status', badge: true, badgeColors: { Active: 'success', Inactive: 'secondary' } }
    ],
    fields: [
      { name: 'employeeCode', label: 'Employee Code', type: 'text', required: true },
      { name: 'name', label: 'Full Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'department', label: 'Department', type: 'select', optionsEndpoint: '/departments', optionLabel: 'name' },
      { name: 'location', label: 'Location', type: 'select', optionsEndpoint: '/locations', optionLabel: 'name' },
      { name: 'designation', label: 'Designation', type: 'text' },
      { name: 'dateOfJoining', label: 'Date of Joining', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] }
    ],
    extraRowActions: (item) => `
      <button class="btn btn-sm btn-outline-success create-login-btn"
        data-id="${item._id}" data-name="${item.name}" data-email="${item.email || ''}"
        title="Create Login"><i class="bi bi-key-fill"></i></button>
      <button class="btn btn-sm btn-outline-warning reset-password-btn"
        data-id="${item._id}" data-name="${item.name}"
        title="Reset Password"><i class="bi bi-arrow-repeat"></i></button>
    `
  });

  // --- Create Login modal wiring (independent of the generic CRUD engine) ---
  $('#crudTableBody').on('click', '.create-login-btn', function () {
    $('#loginEmployeeId').val($(this).data('id'));
    $('#loginEmployeeLabel').text(`Employee: ${$(this).data('name')}`);
    $('#loginEmail').val($(this).data('email') || '');
    $('#loginPassword').val('');
    $('#loginRole').val('Employee');
    $('#createLoginResult').addClass('d-none').html('');
    new bootstrap.Modal(document.getElementById('createLoginModal')).show();
  });

  $('#createLoginForm').on('submit', function (e) {
    e.preventDefault();
    const employeeId = $('#loginEmployeeId').val();
    const payload = {
      email: $('#loginEmail').val().trim(),
      password: $('#loginPassword').val().trim(),
      roleName: $('#loginRole').val()
    };
    if (!payload.password) delete payload.password; // let backend auto-generate

    Api.post(`/employees/${employeeId}/create-login`, payload).done(res => {
      const { email, temporaryPassword, roleName } = res.data;
      $('#createLoginResult').removeClass('d-none').html(`
        <div class="alert alert-success mb-0">
          <strong>Login created.</strong> Share these with the employee now - the password won't be shown again:<br>
          Email: <code>${email}</code><br>
          Password: <code>${temporaryPassword}</code><br>
          Role: <code>${roleName}</code>
        </div>
      `);
      showToast('Login created successfully');
    }).fail(xhr => {
      $('#createLoginResult').removeClass('d-none').html(`<div class="alert alert-danger mb-0">${xhr.responseJSON?.message || 'Failed to create login'}</div>`);
    });
  });

  // --- Reset Password modal wiring (for employees who forgot theirs) ---
  $('#crudTableBody').on('click', '.reset-password-btn', function () {
    $('#resetEmployeeId').val($(this).data('id'));
    $('#resetEmployeeLabel').text(`Employee: ${$(this).data('name')}`);
    $('#resetPassword').val('');
    $('#resetPasswordResult').addClass('d-none').html('');
    new bootstrap.Modal(document.getElementById('resetPasswordModal')).show();
  });

  $('#resetPasswordForm').on('submit', function (e) {
    e.preventDefault();
    const employeeId = $('#resetEmployeeId').val();
    const payload = { password: $('#resetPassword').val().trim() };
    if (!payload.password) delete payload.password; // let backend auto-generate

    Api.post(`/employees/${employeeId}/reset-password`, payload).done(res => {
      const { email, temporaryPassword } = res.data;
      $('#resetPasswordResult').removeClass('d-none').html(`
        <div class="alert alert-success mb-0">
          <strong>Password reset.</strong> Share this with the employee now - it won't be shown again:<br>
          Email: <code>${email}</code><br>
          New Password: <code>${temporaryPassword}</code>
        </div>
      `);
      showToast('Password reset successfully');
    }).fail(xhr => {
      $('#resetPasswordResult').removeClass('d-none').html(`<div class="alert alert-danger mb-0">${xhr.responseJSON?.message || 'Failed to reset password'}</div>`);
    });
  });
});
