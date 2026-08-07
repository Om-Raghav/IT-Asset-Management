$(function () {
  initCrudPage({
    endpoint: '/vendors',
    title: 'Vendors',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status', badge: true, badgeColors: { Active: 'success', Inactive: 'secondary' } }
    ],
    fields: [
      { name: 'name', label: 'Vendor Name', type: 'text', required: true },
      { name: 'contactPerson', label: 'Contact Person', type: 'text' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'gstNumber', label: 'GST Number', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] }
    ]
  });
});
