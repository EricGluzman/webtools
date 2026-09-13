const listeners = new Set();

/** Fired when the server says the session is gone, so the app can re-prompt. */
export function onUnauthorized(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, options = {}) {
  const { method = 'GET', body, query, raw = false, signal } = options;

  let url = path.startsWith('/') ? path : `/api/${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const init = { method, signal, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  if (response.status === 401) {
    // Keep the server's wording ("Wrong password", "Too many attempts") and
    // do not treat a failed sign-in as a lost session.
    let message = 'Not signed in';
    try {
      const payload = await response.clone().json();
      if (payload && payload.error) message = payload.error;
    } catch {
      /* no JSON body: the default message stands */
    }
    if (!url.startsWith('/api/auth/')) {
      for (const fn of listeners) fn();
    }
    throw new ApiError(message, 401);
  }
  if (raw) {
    if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
    return response;
  }

  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new ApiError((payload && payload.error) || `Request failed (${response.status})`, response.status);
  }
  return payload;
}

/** Uploads with progress need XHR; fetch has no upload progress event. */
export function upload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', path.startsWith('/') ? path : `/api/${path}`);
    request.upload.addEventListener('progress', (event) => {
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
    });
    request.addEventListener('load', () => {
      let payload = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = {};
      }
      if (request.status === 401) {
        for (const fn of listeners) fn();
        return reject(new ApiError('Not signed in', 401));
      }
      if (request.status >= 200 && request.status < 300) return resolve(payload);
      reject(new ApiError(payload.error || `Upload failed (${request.status})`, request.status));
    });
    request.addEventListener('error', () => reject(new ApiError('Network error', 0)));
    request.send(formData);
  });
}
