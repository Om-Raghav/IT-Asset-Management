$(function () {
  const cards = [
    { key: 'totalAssets', label: 'Total Assets', icon: 'bi-laptop', color: '#2f5aff' },
    { key: 'availableAssets', label: 'Available', icon: 'bi-check-circle', color: '#22b07d' },
    { key: 'assignedAssets', label: 'Assigned', icon: 'bi-person-check', color: '#f2a541' },
    { key: 'inRepairAssets', label: 'In Repair', icon: 'bi-tools', color: '#e25757' },
    { key: 'totalEmployees', label: 'Active Employees', icon: 'bi-people', color: '#7357e2' },
    { key: 'pendingRepairs', label: 'Pending Repairs', icon: 'bi-wrench', color: '#e28f57' },
    { key: 'expiringWarranties', label: 'Warranty Expiring (30d)', icon: 'bi-shield-exclamation', color: '#d84f9b' },
    { key: 'expiringLicenses', label: 'Licenses Expiring (30d)', icon: 'bi-key', color: '#31a7b8' }
  ];

  Api.get('/dashboard/summary').done(res => {
    const data = res.data;
    const html = cards.map(c => `
      <div class="col-sm-6 col-lg-3">
        <div class="card stat-card p-3 h-100">
          <div class="d-flex align-items-center gap-3">
            <div class="stat-icon" style="background:${c.color};"><i class="bi ${c.icon}"></i></div>
            <div>
              <div class="text-muted small">${c.label}</div>
              <div class="fs-4 fw-bold">${data[c.key] ?? 0}</div>
            </div>
          </div>
        </div>
      </div>`).join('');
    $('#statCards').html(html);

    const statusHtml = (data.assetsByStatus || []).map(s => `
      <div class="d-flex justify-content-between border-bottom py-2">
        <span>${s.status}</span><span class="fw-bold">${s.count}</span>
      </div>`).join('') || '<p class="text-muted mb-0">No data</p>';
    $('#statusList').html(statusHtml);

    const categoryHtml = (data.assetsByCategory || []).map(c => `
      <div class="d-flex justify-content-between border-bottom py-2">
        <span>${c.category || 'Uncategorized'}</span><span class="fw-bold">${c.count}</span>
      </div>`).join('') || '<p class="text-muted mb-0">No data</p>';
    $('#categoryList').html(categoryHtml);
  });

  Api.get('/ai/smart-summary').done(res => {
    $('#smartSummaryText').text(res.data.summary);
  }).fail(() => {
    $('#smartSummaryBox').addClass('d-none');
  });
});
