$(function () {
  initCrudPage({
    endpoint: '/repairs',
    title: 'Repairs',
    columns: [
      { key: 'asset.assetTag', label: 'Asset Tag' },
      { key: 'asset.name', label: 'Asset' },
      { key: 'issueDescription', label: 'Issue' },
      { key: 'status', label: 'Status', badge: true, badgeColors: { Pending: 'warning', 'In Progress': 'info', Completed: 'success', Cancelled: 'secondary' } },
      { key: 'cost', label: 'Cost' }
    ],
    fields: [
      { name: 'asset', label: 'Asset (by Tag)', type: 'select', optionsEndpoint: '/assets', optionLabelFields: ['assetTag', 'name'], required: true },
      { name: 'vendor', label: 'Repair Vendor', type: 'select', optionsEndpoint: '/vendors', optionLabel: 'name' },
      { name: 'issueDescription', label: 'Issue Description', type: 'textarea', required: true },
      { name: 'status', label: 'Status', type: 'select', options: ['Pending', 'In Progress', 'Completed', 'Cancelled'] },
      { name: 'cost', label: 'Repair Cost', type: 'number' },
      { name: 'completedDate', label: 'Completed Date', type: 'date' },
      { name: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  });

  // --- Suggest the Repair Vendor to match the chosen Asset's own vendor ---
  // (a helpful default - repairs can still be sent to a different/third-party vendor)
  let assetsCache = [];
  Api.get('/assets?limit=500').done(res => { assetsCache = res.data; });

  $('#crudFormFields').on('change', 'select[name="asset"]', function () {
    const assetId = $(this).val();
    const asset = assetsCache.find(a => a._id === assetId);
    const vendorId = asset?.vendor?._id || asset?.vendor;
    if (vendorId) {
      $('#crudFormFields select[name="vendor"]').val(vendorId);
    }
  });
});
