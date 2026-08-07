/**
 * Thin AJAX wrapper around jQuery for calling the ITAMS REST API.
 * Automatically attaches the JWT token from localStorage and
 * redirects to login on 401 responses.
 */
const Api = {
  getToken() {
    return localStorage.getItem('itams_token');
  },

  request({ method = 'GET', url, data = null, isForm = false }) {
    const token = Api.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const settings = {
      url: `${API_BASE_URL}${url}`,
      method,
      headers
    };

    if (isForm) {
      settings.data = data;
      settings.processData = false;
      settings.contentType = false;
    } else if (data) {
      settings.data = JSON.stringify(data);
      settings.contentType = 'application/json';
    }

    return $.ajax(settings).fail((xhr) => {
      if (xhr.status === 401) {
        localStorage.removeItem('itams_token');
        localStorage.removeItem('itams_user');
        window.location.href = 'index.html';
      }
    });
  },

  get(url) { return Api.request({ method: 'GET', url }); },
  post(url, data) { return Api.request({ method: 'POST', url, data }); },
  put(url, data) { return Api.request({ method: 'PUT', url, data }); },
  del(url) { return Api.request({ method: 'DELETE', url }); },
  uploadFile(url, formData) { return Api.request({ method: 'POST', url, data: formData, isForm: true }); }
};
