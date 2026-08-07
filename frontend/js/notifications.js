$(function () {
  initCrudPage({
    endpoint: '/notifications',
    title: 'Notifications',
    canDelete: true,
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'message', label: 'Message' },
      { key: 'type', label: 'Type', badge: true, badgeColors: { Info: 'info', Warning: 'warning', Alert: 'danger' } },
      { key: 'isRead', label: 'Read' }
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'message', label: 'Message', type: 'textarea', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['Info', 'Warning', 'Alert'] }
    ]
  });
});
