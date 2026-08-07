$(function () {
  function loadDropdowns() {
    Api.get('/assets?status=Available&limit=200').done(res => {
      $('#allocAssetSelect').html('<option value="">-- Select Asset --</option>' +
        res.data.map(a => `<option value="${a._id}">${a.assetTag} - ${a.name}</option>`).join(''));
    });
    Api.get('/employees?limit=500').done(res => {
      $('#allocEmployeeSelect').html('<option value="">-- Select Employee --</option>' +
        res.data.map(e => `<option value="${e._id}">${e.employeeCode} - ${e.name}</option>`).join(''));
    });
  }

  function loadAssignments() {
    Api.get('/assignments?limit=200').done(res => {
      const items = res.data;
      if (!items.length) {
        $('#allocTableBody').html('<tr><td colspan="5" class="text-center text-muted py-4">No allocations found</td></tr>');
        return;
      }
      const rows = items.map(a => `
        <tr>
          <td>${a.asset?.assetTag || ''} - ${a.asset?.name || ''}</td>
          <td>${a.employee?.name || '-'}</td>
          <td>${formatDate(a.assignedDate)}</td>
          <td>${formatDate(a.expectedReturnDate)}</td>
          <td><span class="badge bg-${a.status === 'Active' ? 'primary' : 'success'}">${a.status}</span></td>
        </tr>`).join('');
      $('#allocTableBody').html(rows);
    });
  }

  $('#addAllocBtn').on('click', () => new bootstrap.Modal(document.getElementById('allocModal')).show());

  $('#allocForm').on('submit', function (e) {
    e.preventDefault();
    const payload = {};
    $(this).serializeArray().forEach(f => { payload[f.name] = f.value; });
    Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });

    Api.post('/assignments', payload).done(() => {
      bootstrap.Modal.getInstance(document.getElementById('allocModal')).hide();
      showToast('Asset allocated successfully');
      $('#allocForm')[0].reset();
      loadDropdowns();
      loadAssignments();
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Allocation failed', 'danger'));
  });

  loadDropdowns();
  loadAssignments();
});
