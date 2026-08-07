$(function () {
  const REPORT_CONFIG = {
    'asset-inventory': {
      headers: ['Tag', 'Name', 'Category', 'Vendor', 'Status', 'Purchase Cost'],
      row: a => [a.assetTag, a.name, a.category?.name, a.vendor?.name, a.status, a.purchaseCost]
    },
    'asset-utilization': {
      headers: ['Status', 'Count', 'Percentage'],
      row: d => [d.status, d.count, `${d.percentage}%`]
    },
    'warranty-expiry': {
      headers: ['Tag', 'Name', 'Category', 'Warranty Expiry'],
      row: a => [a.assetTag, a.name, a.category?.name, formatDate(a.warrantyExpiry)]
    },
    'repair-history': {
      headers: ['Asset', 'Issue', 'Vendor', 'Status', 'Cost', 'Reported Date'],
      row: r => [`${r.asset?.assetTag || ''} - ${r.asset?.name || ''}`, r.issueDescription, r.vendor?.name, r.status, r.cost, formatDate(r.reportedDate)]
    },
    'license-usage': {
      headers: ['Software', 'Seats Total', 'Seats Used', 'Seats Available', 'Expiry'],
      row: l => [l.name, l.seatsTotal, l.seatsUsed, l.seatsAvailable, formatDate(l.expiryDate)]
    },
    'amc-status': {
      headers: ['Contract #', 'Vendor', 'Asset', 'Start', 'End', 'Status'],
      row: c => [c.contractNumber, c.vendor?.name, c.asset?.name || '-', formatDate(c.startDate), formatDate(c.endDate), c.status]
    },
    'assignment-history': {
      headers: ['Asset', 'Employee', 'Assigned Date', 'Return Date', 'Status'],
      row: a => [`${a.asset?.assetTag || ''} - ${a.asset?.name || ''}`, a.employee?.name, formatDate(a.assignedDate), formatDate(a.actualReturnDate), a.status]
    }
  };

  function loadReport(key) {
    Api.get(`/reports/${key}`).done(res => {
      const cfg = REPORT_CONFIG[key];
      $('#reportTableHead').html('<tr>' + cfg.headers.map(h => `<th>${h}</th>`).join('') + '</tr>');
      if (!res.data.length) {
        $('#reportTableBody').html(`<tr><td colspan="${cfg.headers.length}" class="text-center text-muted py-4">No data available</td></tr>`);
        return;
      }
      const rows = res.data.map(item => '<tr>' + cfg.row(item).map(v => `<td>${v ?? '-'}</td>`).join('') + '</tr>').join('');
      $('#reportTableBody').html(rows);
    });
  }

  $('#reportTabs').on('click', 'button', function () {
    $('#reportTabs button').removeClass('active');
    $(this).addClass('active');
    loadReport($(this).data('report'));
  });

  loadReport('asset-inventory');
});
