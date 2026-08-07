$(function () {
  initCrudPage({
    endpoint: '/software-licenses',
    title: 'Software Licenses',
    columns: [
      { key: 'name', label: 'Software' },
      { key: 'vendor.name', label: 'Vendor' },
      { key: 'licenseType', label: 'Type' },
      { key: 'expiryDate', label: 'Expiry', type: 'date' },
      { key: 'status', label: 'Status', badge: true, badgeColors: { Active: 'success', Expired: 'danger', Cancelled: 'secondary' } }
    ],
    fields: [
      { name: 'name', label: 'Software Name', type: 'text', required: true },
      { name: 'vendor', label: 'Vendor', type: 'select', optionsEndpoint: '/vendors', optionLabel: 'name' },
      { name: 'licenseKey', label: 'License Key', type: 'text' },
      { name: 'licenseType', label: 'License Type', type: 'select', options: ['Perpetual', 'Subscription', 'OpenSource'] },
      { name: 'purchaseDate', label: 'Purchase Date', type: 'date' },
      { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
      { name: 'seatsTotal', label: 'Total Seats', type: 'number' },
      { name: 'cost', label: 'Cost', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Expired', 'Cancelled'] }
    ],
    extraRowActions: (item) => `
      <button class="btn btn-sm btn-outline-info assign-asset-btn"
        data-id="${item._id}" data-name="${item.name}"
        title="Assign to Asset"><i class="bi bi-hdd-stack"></i></button>
    `
  });

  // --- Assign to Asset modal wiring (independent of the generic CRUD engine) ---

  function refreshAssignModal(licenseId) {
    Api.get(`/software-licenses/${licenseId}`).done(res => {
      const license = res.data;
      const seatsUsed = (license.assignedTo?.length || 0) + (license.assignedAssets?.length || 0);
      $('#seatsUsageBadge').text(`${seatsUsed} / ${license.seatsTotal} seats used`)
        .removeClass('bg-secondary bg-warning bg-danger')
        .addClass(seatsUsed >= license.seatsTotal ? 'bg-danger' : seatsUsed / license.seatsTotal >= 0.8 ? 'bg-warning' : 'bg-secondary');

      // Assigned assets list, each with an unassign button
      const assigned = license.assignedAssets || [];
      $('#assignedAssetsList').html(assigned.length
        ? assigned.map(a => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
              <span>${a.assetTag} - ${a.name} <span class="text-muted small">(${a.category?.name || ''})</span></span>
              <button class="btn btn-sm btn-outline-danger unassign-asset-btn" data-asset-id="${a._id}"><i class="bi bi-x-lg"></i></button>
            </div>`).join('')
        : '<p class="text-muted small mb-0">Not assigned to any asset yet.</p>');

      // Load Laptop/Desktop assets not already assigned, for the "assign new" dropdown
      Api.get('/assets?limit=500').done(assetRes => {
        const assignedIds = new Set(assigned.map(a => a._id));
        const eligible = assetRes.data.filter(a =>
          ['Laptop', 'Desktop'].includes(a.category?.name) && !assignedIds.has(a._id)
        );
        $('#assetToAssignSelect').html('<option value="">-- Select an asset to assign this license to --</option>' +
          eligible.map(a => `<option value="${a._id}">${a.assetTag} - ${a.name} (${a.category?.name})</option>`).join(''));
      });
    });
  }

  $('#crudTableBody').on('click', '.assign-asset-btn', function () {
    const licenseId = $(this).data('id');
    $('#assignLicenseId').val(licenseId);
    $('#assignLicenseLabel').text(`License: ${$(this).data('name')}`);
    refreshAssignModal(licenseId);
    new bootstrap.Modal(document.getElementById('assignAssetModal')).show();
  });

  $('#assignAssetForm').on('submit', function (e) {
    e.preventDefault();
    const licenseId = $('#assignLicenseId').val();
    const assetId = $('#assetToAssignSelect').val();
    if (!assetId) return;

    Api.post(`/software-licenses/${licenseId}/assign-asset`, { assetId }).done(res => {
      showToast(res.message || 'License assigned to asset');
      refreshAssignModal(licenseId);
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Failed to assign license', 'danger'));
  });

  $('#assignedAssetsList').on('click', '.unassign-asset-btn', function () {
    const licenseId = $('#assignLicenseId').val();
    const assetId = $(this).data('asset-id');
    Api.post(`/software-licenses/${licenseId}/unassign-asset`, { assetId }).done(res => {
      showToast(res.message || 'License unassigned from asset');
      refreshAssignModal(licenseId);
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Failed to unassign license', 'danger'));
  });
});
