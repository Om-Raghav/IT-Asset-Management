/**
 * Generic, config-driven CRUD page engine.
 * Renders a Bootstrap table + Add/Edit modal wired to a REST endpoint
 * via the Api wrapper. Used by all "master data" style module pages
 * (Departments, Locations, Vendors, Categories, Employees, Repairs,
 * Licenses, AMC Contracts, Notifications) to avoid duplicating
 * near-identical CRUD boilerplate on every page.
 *
 * config = {
 *   endpoint: '/departments',
 *   title: 'Departments',
 *   columns: [{ key: 'name', label: 'Name' }, { key: 'category.name', label: 'Category' }],
 *   fields: [
 *     { name: 'name', label: 'Name', type: 'text', required: true },
 *     { name: 'category', label: 'Category', type: 'select', optionsEndpoint: '/asset-categories', optionLabel: 'name' },
 *     { name: 'purchaseDate', label: 'Purchase Date', type: 'date' },
 *     { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] }
 *   ],
 *   canDelete: true
 * }
 */
function getNested(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : ''), obj);
}

function initCrudPage(config) {
  let editingId = null;
  const optionCache = {};

  function loadSelectOptions() {
    const selects = config.fields.filter(f => f.type === 'select' && f.optionsEndpoint);
    const promises = selects.map(f =>
      Api.get(`${f.optionsEndpoint}?limit=500`).done(res => {
        optionCache[f.name] = res.data;
      })
    );
    return $.when(...promises);
  }

  function renderFormFields(record = {}) {
    const html = config.fields.map(f => {
      const value = record[f.name] !== undefined
        ? (typeof record[f.name] === 'object' && record[f.name]?._id ? record[f.name]._id : record[f.name])
        : '';

      if (f.type === 'select') {
        const labelFor = (o) => f.optionLabelFields
          ? f.optionLabelFields.map(k => o[k]).filter(Boolean).join(' - ')
          : (o[f.optionLabel] || o.name);
        const opts = f.options
          ? f.options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')
          : (optionCache[f.name] || []).map(o => `<option value="${o._id}" ${o._id === value ? 'selected' : ''}>${labelFor(o)}</option>`).join('');
        return `
          <div class="col-md-6 mb-3">
            <label class="form-label">${f.label}${f.required ? ' *' : ''}</label>
            <select class="form-select" name="${f.name}" ${f.required ? 'required' : ''}>
              <option value="">-- Select ${f.label} --</option>
              ${opts}
            </select>
          </div>`;
      }
      if (f.type === 'textarea') {
        return `
          <div class="col-12 mb-3">
            <label class="form-label">${f.label}</label>
            <textarea class="form-control" name="${f.name}" rows="2">${value || ''}</textarea>
          </div>`;
      }
      const inputType = f.type || 'text';
      const dateVal = inputType === 'date' && value ? String(value).substring(0, 10) : value;
      return `
        <div class="col-md-6 mb-3">
          <label class="form-label">${f.label}${f.required ? ' *' : ''}</label>
          <input type="${inputType}" class="form-control" name="${f.name}" value="${dateVal || ''}" ${f.required ? 'required' : ''} ${inputType === 'number' ? 'step="any"' : ''}>
        </div>`;
    }).join('');
    $('#crudFormFields').html(`<div class="row">${html}</div>`);
  }

  function renderTable(items) {
    const headerHtml = config.columns.map(c => `<th>${c.label}</th>`).join('') + '<th class="text-end">Actions</th>';
    $('#crudTableHead').html(`<tr>${headerHtml}</tr>`);

    if (!items.length) {
      $('#crudTableBody').html(`<tr><td colspan="${config.columns.length + 1}" class="text-center text-muted py-4">No records found</td></tr>`);
      return;
    }

    const rows = items.map(item => {
      const cells = config.columns.map(c => {
        let val = getNested(item, c.key);
        if (c.type === 'date') val = formatDate(val);
        if (c.badge) val = `<span class="badge bg-${c.badgeColors?.[val] || 'secondary'}">${val || '-'}</span>`;
        return `<td>${val ?? '-'}</td>`;
      }).join('');
      return `
        <tr>
          ${cells}
          <td class="text-end">
            ${config.extraRowActions ? config.extraRowActions(item) : ''}
            <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${item._id}"><i class="bi bi-pencil"></i></button>
            ${config.canDelete !== false ? `<button class="btn btn-sm btn-outline-danger delete-btn" data-id="${item._id}"><i class="bi bi-trash"></i></button>` : ''}
          </td>
        </tr>`;
    }).join('');
    $('#crudTableBody').html(rows);
  }

  let allRecords = [];

  function loadData() {
    const search = $('#crudSearch').val() || '';
    Api.get(`${config.endpoint}?search=${encodeURIComponent(search)}&limit=200`).done(res => {
      allRecords = res.data;
      renderTable(allRecords);
    });
  }

  function openModal(record = null) {
    editingId = record ? record._id : null;
    $('#crudModalLabel').text(editingId ? `Edit ${config.title.replace(/s$/, '')}` : `Add ${config.title.replace(/s$/, '')}`);
    renderFormFields(record || {});
    const modal = new bootstrap.Modal(document.getElementById('crudModal'));
    modal.show();
  }

  $('#pageTitle').text(config.title);
  $('#addBtn').text(`Add ${config.title.replace(/s$/, '')}`);

  $('#addBtn').on('click', () => openModal());

  $('#crudTableBody').on('click', '.edit-btn', function () {
    const id = $(this).data('id');
    const record = allRecords.find(r => r._id === id);
    openModal(record);
  });

  $('#crudTableBody').on('click', '.delete-btn', function () {
    const id = $(this).data('id');
    if (!confirm(`Delete this ${config.title.replace(/s$/, '')}?`)) return;
    Api.del(`${config.endpoint}/${id}`).done(() => {
      showToast(`${config.title.replace(/s$/, '')} deleted`, 'success');
      loadData();
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Delete failed', 'danger'));
  });

  $('#crudForm').on('submit', function (e) {
    e.preventDefault();
    const formArray = $(this).serializeArray();
    const payload = {};
    formArray.forEach(f => { payload[f.name] = f.value; });

    // Drop empty optional fields so backend defaults/refs stay valid
    Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });

    const req = editingId ? Api.put(`${config.endpoint}/${editingId}`, payload) : Api.post(config.endpoint, payload);
    req.done(() => {
      bootstrap.Modal.getInstance(document.getElementById('crudModal')).hide();
      showToast(`${config.title.replace(/s$/, '')} saved successfully`, 'success');
      loadData();
    }).fail(xhr => showToast(xhr.responseJSON?.message || 'Save failed', 'danger'));
  });

  let searchTimeout;
  $('#crudSearch').on('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadData, 300);
  });

  loadSelectOptions().then(loadData);
}
