$(function () {
  const statusColors = { Available: 'success', Assigned: 'primary', 'In Repair': 'warning', Retired: 'secondary', Scrapped: 'dark' };

  function loadProfile() {
    Api.get('/me/profile').done(res => {
      const emp = res.data;
      $('#welcomeName').text(`Welcome, ${emp.name}`);
      const dept = emp.department?.name || 'No department';
      const loc = emp.location?.name || 'No location';
      $('#welcomeMeta').text(`${emp.employeeCode} · ${emp.designation || '—'} · ${dept} · ${loc}`);
    }).fail(() => {
      $('#welcomeMeta').text('No employee record is linked to your account yet. Contact an administrator to get your assets set up.');
    });
  }

  function assetCardHtml(assignment) {
    const a = assignment.asset;
    if (!a) return '';
    const warrantyBadge = a.warrantyExpiry
      ? `<div class="small text-muted mt-1"><i class="bi bi-shield-check me-1"></i>Warranty until ${formatDate(a.warrantyExpiry)}</div>`
      : '';
    const returnBtn = assignment.returnRequested
      ? `<button class="btn btn-sm btn-outline-secondary" disabled><i class="bi bi-check2 me-1"></i>Return Requested</button>`
      : `<button class="btn btn-sm btn-outline-warning request-return-btn" data-id="${assignment._id}" data-label="${a.assetTag} - ${a.name}"><i class="bi bi-arrow-return-left me-1"></i>Request Return</button>`;

    return `
      <div class="col-md-6 col-lg-4">
        <div class="card stat-card p-3 h-100">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <div class="fw-bold">${a.name}</div>
              <div class="text-muted small">${a.assetTag} · ${a.category?.name || ''}</div>
            </div>
            <span class="badge bg-${statusColors[a.status] || 'secondary'}">${a.status}</span>
          </div>
          <div class="small text-muted mb-2">
            ${a.brand || ''} ${a.model || ''}<br>
            Assigned: ${formatDate(assignment.assignedDate)}
          </div>
          ${warrantyBadge}
          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-sm btn-outline-primary report-issue-btn" data-id="${assignment._id}" data-label="${a.assetTag} - ${a.name}"><i class="bi bi-flag me-1"></i>Report Issue</button>
            ${returnBtn}
          </div>
        </div>
      </div>`;
  }

  function loadMyAssets() {
    Api.get('/me/assets').done(res => {
      if (!res.data.length) {
        $('#myAssetsContainer').html('<div class="col-12 text-muted">No assets are currently assigned to you.</div>');
        return;
      }
      $('#myAssetsContainer').html(res.data.map(assetCardHtml).join(''));
    }).fail(() => {
      $('#myAssetsContainer').html('<div class="col-12 text-muted">Could not load your assets.</div>');
    });
  }

  function loadMyRepairs() {
    Api.get('/me/repairs').done(res => {
      if (!res.data.length) {
        $('#myRepairsList').html('<p class="text-muted mb-0">You haven\'t reported any issues yet.</p>');
        return;
      }
      const statusBadge = { Pending: 'warning', 'In Progress': 'info', Completed: 'success', Cancelled: 'secondary' };
      $('#myRepairsList').html(res.data.map(r => `
        <div class="d-flex justify-content-between border-bottom py-2">
          <div>
            <div>${r.asset?.assetTag || ''} - ${r.asset?.name || ''}</div>
            <div class="text-muted">${r.issueDescription}</div>
          </div>
          <span class="badge bg-${statusBadge[r.status] || 'secondary'} align-self-start">${r.status}</span>
        </div>`).join(''));
    });
  }

  function loadMyNotifications() {
    Api.get('/me/notifications').done(res => {
      if (!res.data.length) {
        $('#myNotificationsList').html('<p class="text-muted mb-0">No notifications yet.</p>');
        return;
      }
      const typeBadge = { Info: 'info', Warning: 'warning', Alert: 'danger' };
      $('#myNotificationsList').html(res.data.map(n => `
        <div class="border-bottom py-2">
          <div class="d-flex justify-content-between">
            <span class="fw-bold">${n.title}</span>
            <span class="badge bg-${typeBadge[n.type] || 'secondary'}">${n.type}</span>
          </div>
          <div class="text-muted">${n.message}</div>
        </div>`).join(''));
    });
  }

  // Report Issue modal wiring
  $('#myAssetsContainer').on('click', '.report-issue-btn', function () {
    $('#reportAssignmentId').val($(this).data('id'));
    $('#reportAssetLabel').text(`Asset: ${$(this).data('label')}`);
    $('#reportIssueForm')[0].reset();
    $('#reportAssignmentId').val($(this).data('id')); // reset() clears hidden input too, so set again
    new bootstrap.Modal(document.getElementById('reportIssueModal')).show();
  });

  $('#reportIssueForm').on('submit', function (e) {
    e.preventDefault();
    const payload = {};
    $(this).serializeArray().forEach(f => { payload[f.name] = f.value; });

    Api.post('/me/report-issue', payload).done(res => {
      bootstrap.Modal.getInstance(document.getElementById('reportIssueModal')).hide();
      showToast(res.message || 'Issue reported successfully');
      loadMyRepairs();
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Failed to report issue', 'danger'));
  });

  // Request Return modal wiring
  $('#myAssetsContainer').on('click', '.request-return-btn', function () {
    const id = $(this).data('id');
    $('#returnAssignmentId').val(id);
    $('#returnAssetLabel').text(`Asset: ${$(this).data('label')}`);
    $('#requestReturnForm')[0].reset();
    $('#returnAssignmentId').val(id);
    new bootstrap.Modal(document.getElementById('requestReturnModal')).show();
  });

  $('#requestReturnForm').on('submit', function (e) {
    e.preventDefault();
    const payload = {};
    $(this).serializeArray().forEach(f => { payload[f.name] = f.value; });

    Api.post('/me/request-return', payload).done(res => {
      bootstrap.Modal.getInstance(document.getElementById('requestReturnModal')).hide();
      showToast(res.message || 'Return request submitted');
      loadMyAssets();
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Failed to submit return request', 'danger'));
  });

  loadProfile();
  loadMyAssets();
  loadMyRepairs();
  loadMyNotifications();
});
