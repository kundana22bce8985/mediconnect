
export const API_URL = "http://localhost:8080";

const KEY = "mediconnect_auth";

export function saveAuth(data) {
  sessionStorage.setItem(KEY, JSON.stringify(data));
  localStorage.removeItem("mediconnect_session");
}

export function clearAuth() {
  sessionStorage.removeItem(KEY);
  localStorage.removeItem("mediconnect_session");
}

export function getAuth() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return JSON.parse(
      sessionStorage.getItem(KEY) || "null"
    );
  } catch {
    return null;
  }
}

export async function api(path, options = {}) {
  const auth = getAuth();

  const headers = {
    ...(options.headers || {}),
  };

  if (auth?.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const data = await response
    .json()
    .catch(() => ({}));

  if (response.status === 401) {
    clearAuth();
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

export function formBody(fields) {
  return new URLSearchParams(fields).toString();
}
