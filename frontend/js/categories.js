$(function () {
  initCrudPage({
    endpoint: '/asset-categories',
    title: 'Asset Categories',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'depreciationRateYears', label: 'Depreciation (yrs)' }
    ],
    fields: [
      { name: 'name', label: 'Category Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'depreciationRateYears', label: 'Depreciation Rate (Years)', type: 'number' }
    ]
  });
});
