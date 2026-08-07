$(function () {
  const actionColors = { CREATE: 'success', UPDATE: 'info', DELETE: 'danger', LOGIN: 'secondary' };

  function loadLogs() {
    const action = $('#actionFilter').val();
    Api.get(`/audit-logs?action=${encodeURIComponent(action || '')}&limit=200`).done(res => {
      if (!res.data.length) {
        $('#auditTableBody').html('<tr><td colspan="4" class="text-center text-muted py-4">No audit records found</td></tr>');
        return;
      }
      const rows = res.data.map(log => `
        <tr>
          <td>${log.user?.name || 'System'}</td>
          <td><span class="badge bg-${actionColors[log.action] || 'secondary'}">${log.action}</span></td>
          <td>${log.module}</td>
          <td>${new Date(log.createdAt).toLocaleString()}</td>
        </tr>`).join('');
      $('#auditTableBody').html(rows);
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Failed to load audit logs', 'danger'));
  }

  $('#actionFilter').on('change', loadLogs);
  loadLogs();
});
