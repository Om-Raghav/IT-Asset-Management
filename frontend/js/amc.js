$(function () {
  initCrudPage({
    endpoint: '/amc-contracts',
    title: 'AMC Contracts',
    columns: [
      { key: 'contractNumber', label: 'Contract #' },
      { key: 'vendor.name', label: 'Vendor' },
      { key: 'asset.assetTag', label: 'Asset Tag' },
      { key: 'asset.name', label: 'Asset' },
      { key: 'endDate', label: 'End Date', type: 'date' },
      { key: 'status', label: 'Status', badge: true, badgeColors: { Active: 'success', Expired: 'danger', Cancelled: 'secondary' } }
    ],
    fields: [
      { name: 'contractNumber', label: 'Contract Number', type: 'text', required: true },
      { name: 'asset', label: 'Asset (by Tag)', type: 'select', optionsEndpoint: '/assets', optionLabelFields: ['assetTag', 'name'] },
      { name: 'vendor', label: 'Vendor', type: 'select', optionsEndpoint: '/vendors', optionLabel: 'name', required: true },
      { name: 'startDate', label: 'Start Date', type: 'date', required: true },
      { name: 'endDate', label: 'End Date', type: 'date', required: true },
      { name: 'cost', label: 'Cost', type: 'number' },
      { name: 'coverageDetails', label: 'Coverage Details', type: 'textarea' },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Expired', 'Cancelled'] }
    ]
  });

  // --- Auto-select the Vendor to match the chosen Asset's own vendor ---
  // (independent lookup cache, decoupled from the generic CRUD engine)
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
