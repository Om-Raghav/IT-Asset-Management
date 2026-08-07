$(function () {
  function loadActiveAssignments() {
    Api.get('/assignments?status=Active&limit=200').done(res => {
      $('#returnAssignmentSelect').html('<option value="">-- Select Allocation --</option>' +
        res.data.map(a => `<option value="${a._id}">${a.asset?.assetTag || ''} - ${a.asset?.name || ''} \u2192 ${a.employee?.name || ''}</option>`).join(''));
    });
  }

  function loadReturns() {
    Api.get('/returns?limit=200').done(res => {
      const items = res.data;
      if (!items.length) {
        $('#returnTableBody').html('<tr><td colspan="5" class="text-center text-muted py-4">No returns recorded</td></tr>');
        return;
      }
      const rows = items.map(r => `
        <tr>
          <td>${r.asset?.assetTag || ''} - ${r.asset?.name || ''}</td>
          <td>${r.employee?.name || '-'}</td>
          <td>${formatDate(r.returnDate)}</td>
          <td>${r.condition}</td>
          <td>${r.remarks || '-'}</td>
        </tr>`).join('');
      $('#returnTableBody').html(rows);
    });
  }

  $('#addReturnBtn').on('click', () => new bootstrap.Modal(document.getElementById('returnModal')).show());

  $('#returnForm').on('submit', function (e) {
    e.preventDefault();
    const payload = {};
    $(this).serializeArray().forEach(f => { payload[f.name] = f.value; });

    Api.post('/returns', payload).done(() => {
      bootstrap.Modal.getInstance(document.getElementById('returnModal')).hide();
      showToast('Asset return processed successfully');
      $('#returnForm')[0].reset();
      loadActiveAssignments();
      loadReturns();
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Return failed', 'danger'));
  });

  loadActiveAssignments();
  loadReturns();
});
