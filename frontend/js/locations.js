$(function () {
  initCrudPage({
    endpoint: '/locations',
    title: 'Locations',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'country', label: 'Country' }
    ],
    fields: [
      { name: 'name', label: 'Location Name', type: 'text', required: true },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'state', label: 'State', type: 'text' },
      { name: 'country', label: 'Country', type: 'text' }
    ]
  });
});
