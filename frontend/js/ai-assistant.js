$(function () {
  $('#runChecksBtn').on('click', function () {
    const btn = $(this);
    btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Running...');
    Api.post('/ai/run-compliance-checks', {}).done(res => {
      const { warranty, amc, duplicates, total } = res.data;
      showToast(total > 0
        ? `Created ${total} new notification(s) - warranty: ${warranty}, AMC: ${amc}, duplicates: ${duplicates}`
        : 'Checks completed - no new alerts needed right now.');
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Failed to run checks', 'danger'))
      .always(() => btn.prop('disabled', false).html('<i class="bi bi-arrow-clockwise me-1"></i>Run Checks Now'));
  });

  $('#nlSearchForm').on('submit', function (e) {
    e.preventDefault();
    const q = $('#nlSearchInput').val().trim();
    Api.get(`/ai/search?q=${encodeURIComponent(q)}`).done(res => {
      if (!res.data.length) { $('#nlSearchResults').html('<p class="text-muted">No matching assets found.</p>'); return; }
      $('#nlSearchResults').html(res.data.map(a => `<div class="border-bottom py-1">${a.assetTag} - ${a.name} <span class="badge bg-secondary">${a.status}</span></div>`).join(''));
    });
  });

  Api.get('/ai/warranty-prediction?days=60').done(res => {
    if (!res.data.length) { $('#warrantyPredictions').html('<p class="text-muted mb-0">No assets expiring soon.</p>'); return; }
    const riskColor = { High: 'danger', Medium: 'warning', Low: 'info' };
    $('#warrantyPredictions').html(res.data.slice(0, 8).map(p => `
      <div class="d-flex justify-content-between border-bottom py-1">
        <span>${p.asset.assetTag} - ${p.asset.name}</span>
        <span class="badge bg-${riskColor[p.riskLevel]}">${p.daysLeft}d left</span>
      </div>`).join(''));
  });

  Api.get('/ai/duplicate-detection').done(res => {
    if (!res.data.length) { $('#duplicateResults').html('<p class="text-muted mb-0">No potential duplicates found.</p>'); return; }
    $('#duplicateResults').html(res.data.slice(0, 6).map(d => `
      <div class="border-bottom py-1">
        <span class="text-muted">${d.assets.length} matching:</span> ${d.assets.map(a => a.assetTag).join(', ')}
      </div>`).join(''));
  });

  Api.get('/ai/health-prediction').done(res => {
    if (!res.data.length) { $('#healthResults').html('<p class="text-muted mb-0">No asset data available.</p>'); return; }
    $('#healthResults').html(res.data.slice(0, 8).map(h => `
      <div class="d-flex justify-content-between border-bottom py-1">
        <span>${h.asset.assetTag} - ${h.asset.name}</span>
        <span><span class="badge bg-secondary">${h.healthScore}</span> <small class="text-muted">${h.recommendation}</small></span>
      </div>`).join(''));
  });
});
