$(function () {
  let editingId = null;
  let allAssets = [];
  const statusColors = { Available: 'success', Assigned: 'primary', 'In Repair': 'warning', Retired: 'secondary', Scrapped: 'dark' };

  function loadDropdowns() {
    Api.get('/asset-categories?limit=200').done(res => {
      $('#categorySelect').html('<option value="">-- Select Category --</option>' +
        res.data.map(c => `<option value="${c._id}">${c.name}</option>`).join(''));
    });
    Api.get('/vendors?limit=200').done(res => {
      $('#vendorSelect').html('<option value="">-- None --</option>' +
        res.data.map(v => `<option value="${v._id}">${v.name}</option>`).join(''));
    });
    Api.get('/locations?limit=200').done(res => {
      $('#locationSelect').html('<option value="">-- None --</option>' +
        res.data.map(l => `<option value="${l._id}">${l.name}</option>`).join(''));
    });
  }

  function renderRows(items) {
    if (!items.length) {
      $('#assetTableBody').html('<tr><td colspan="7" class="text-center text-muted py-4">No assets found</td></tr>');
      return;
    }
    const rows = items.map(a => `
      <tr>
        <td>${a.assetTag}</td>
        <td>${a.name}</td>
        <td>${a.category?.name || '-'}</td>
        <td>${a.vendor?.name || '-'}</td>
        <td><span class="badge bg-${statusColors[a.status] || 'secondary'}">${a.status}</span></td>
        <td>${formatDate(a.warrantyExpiry)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary edit-asset" data-id="${a._id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-asset" data-id="${a._id}"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`).join('');
    $('#assetTableBody').html(rows);
  }

  function loadAssets() {
    const search = $('#assetSearch').val() || '';
    const status = $('#statusFilter').val() || '';
    Api.get(`/assets?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&limit=200`).done(res => {
      allAssets = res.data;
      renderRows(allAssets);
    });
  }

  function openModal(asset = null) {
    editingId = asset ? asset._id : null;
    $('#assetModalLabel').text(editingId ? 'Edit Asset' : 'Add Asset');
    const form = $('#assetForm')[0];
    form.reset();
    if (asset) {
      $('input[name=assetTag]').val(asset.assetTag);
      $('input[name=name]').val(asset.name);
      $('#categorySelect').val(asset.category?._id || asset.category || '');
      $('#vendorSelect').val(asset.vendor?._id || asset.vendor || '');
      $('#locationSelect').val(asset.location?._id || asset.location || '');
      $('input[name=brand]').val(asset.brand || '');
      $('input[name=model]').val(asset.model || '');
      $('input[name=serialNumber]').val(asset.serialNumber || '');
      $('input[name=purchaseDate]').val(asset.purchaseDate ? asset.purchaseDate.substring(0, 10) : '');
      $('input[name=purchaseCost]').val(asset.purchaseCost || '');
      $('input[name=warrantyExpiry]').val(asset.warrantyExpiry ? asset.warrantyExpiry.substring(0, 10) : '');
      $('select[name=status]').val(asset.status);
      $('select[name=condition]').val(asset.condition);
      $('textarea[name=notes]').val(asset.notes || '');
    }
    new bootstrap.Modal(document.getElementById('assetModal')).show();
  }

  $('#addAssetBtn').on('click', () => openModal());

  $('#generateTagBtn').on('click', function () {
    const vendorId = $('#vendorSelect').val();
    const categoryId = $('#categorySelect').val();
    if (!vendorId || !categoryId) {
      showToast('Select a Vendor and Category first, then click Generate.', 'danger');
      return;
    }
    const btn = $(this);
    btn.prop('disabled', true);
    Api.get(`/assets/generate-tag?vendorId=${vendorId}&categoryId=${categoryId}`).done(res => {
      $('#assetTagInput').val(res.data.assetTag);
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Failed to generate tag', 'danger'))
      .always(() => btn.prop('disabled', false));
  });

  $('#assetTableBody').on('click', '.edit-asset', function () {
    const asset = allAssets.find(a => a._id === $(this).data('id'));
    openModal(asset);
  });

  $('#assetTableBody').on('click', '.delete-asset', function () {
    const id = $(this).data('id');
    if (!confirm('Delete this asset?')) return;
    Api.del(`/assets/${id}`).done(() => { showToast('Asset deleted'); loadAssets(); })
      .fail(xhr => showToast(xhr.responseJSON?.message || 'Delete failed', 'danger'));
  });

  $('#assetForm').on('submit', function (e) {
    e.preventDefault();
    const payload = {};
    $(this).serializeArray().forEach(f => { payload[f.name] = f.value; });
    Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });

    const req = editingId ? Api.put(`/assets/${editingId}`, payload) : Api.post('/assets', payload);
    req.done(() => {
      bootstrap.Modal.getInstance(document.getElementById('assetModal')).hide();
      showToast('Asset saved successfully');
      loadAssets();
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Save failed', 'danger'));
  });

  let searchTimeout;
  $('#assetSearch').on('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(loadAssets, 300); });
  $('#statusFilter').on('change', loadAssets);

  loadDropdowns();
  loadAssets();
});
