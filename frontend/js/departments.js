$(function () {
  initCrudPage({
    endpoint: '/departments',
    title: 'Departments',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
      { key: 'description', label: 'Description' }
    ],
    fields: [
      { name: 'name', label: 'Department Name', type: 'text', required: true },
      { name: 'code', label: 'Code', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' }
    ]
  });
});
