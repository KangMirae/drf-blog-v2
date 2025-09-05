// js/api.js
// ✅ 모든 네트워크 호출 모음 (JWT 자동 처리)

import { API_BASE, store } from "./state.js";

export async function refreshAccessToken() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Accept":"application/json" },
      body: JSON.stringify({ refresh: store.refresh })
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access) { store.access = data.access; return true; }
    return false;
  } catch { return false; }
}

export async function fetchWithAuth(url, opts = {}, retry = true) {
  const headers = new Headers(opts.headers || {});
  headers.set("Accept","application/json");
  if (!(opts.body instanceof FormData)) headers.set("Content-Type","application/json");
  if (store.access) headers.set("Authorization", `Bearer ${store.access}`);
  const res = await fetch(url, { ...opts, headers });
  if (res.status !== 401) return res;
  if (!retry || !store.refresh) return res;
  const ok = await refreshAccessToken();
  if (!ok) return res;
  return fetchWithAuth(url, opts, false);
}

// ---- Auth ----
export async function login(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/token/`, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Accept":"application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`로그인 실패: ${res.status} ${msg}`);
  }
  const data = await res.json();
  store.access = data.access;
  store.refresh = data.refresh;
  store.username = username;
}

// ---- Posts ----
export async function listPosts({ search, category, tags, ordering, page } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  if (tags) params.set("tags", tags);
  if (ordering) params.set("ordering", ordering);
  if (page) params.set("page", page);
  const url = `${API_BASE}/api/posts/${params.toString() ? "?" + params : ""}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error("목록 조회 실패");
  return res.json(); // {count,next,previous,results:[]}
}

export async function getPost(id) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${id}/`);
  if (!res.ok) throw new Error("상세 조회 실패");
  return res.json();
}

export async function createPost({ title, content, category, tags }) {
  const body = {
    title: (title ?? "").trim(),
    content: (content ?? "").trim(),
  };
  if (category && category.trim()) body.category = category.trim();
  if (tags && tags.trim()) body.tags = tags.split(",").map(s=>s.trim()).filter(Boolean);

  const res = await fetchWithAuth(`${API_BASE}/api/posts/`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { body = "<no body>"; }
    throw new Error(`회원가입 실패: ${res.status} ${body}`);
  }
  return res.json();
}

export async function updatePost(id, { title, content }) {
  const payload = {};
  if (typeof title === "string") payload.title = title.trim();
  if (typeof content === "string") payload.content = content.trim();
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { body = "<no body>"; }
    throw new Error(`회원가입 실패: ${res.status} ${body}`);
  }
  return res.json();
}

export async function deletePost(id) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${id}/`, { method:"DELETE" });
  if (res.status !== 204) throw new Error(`삭제 실패: ${await res.text()}`);
}

export async function likePost(id) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${id}/like/`, { method:"POST" });
  return res.ok;
}

// ---- Comments ----
export async function listComments(postId) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${postId}/comments/`);
  if (!res.ok) throw new Error("댓글 목록 실패");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results || []);
}

export async function addComment(postId, content) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${postId}/comments/`, {
    method: "POST",
    body: JSON.stringify({ content: (content ?? "").trim() })
  });
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { body = "<no body>"; }
    throw new Error(`회원가입 실패: ${res.status} ${body}`);
  }
  return res.json();
}

export async function deleteComment(commentId) {
  const res = await fetchWithAuth(`${API_BASE}/api/comments/${commentId}/`, { method:"DELETE" });
  if (res.status !== 204) throw new Error("댓글 삭제 실패");
}

// ---- Notifications ----
export async function listUnreadNotifications() {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications/unread/`);
  if (!res.ok) throw new Error("알림 조회 실패");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results || []);
}

export async function markAllNotificationsRead() {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications/mark_read/`, {
    method: "PATCH",
    body: JSON.stringify({ all: true })
  });
  return res.ok;
}

export async function markNotificationRead(id) {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications/${id}/read/`, {
    method: "PATCH",
    body: JSON.stringify({})
  });
  return res.ok;
}

export async function getUnreadCount() {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications/unread/`);
  if (!res.ok) return 0;
  const data = await res.json();
  if (typeof data?.count === "number") return data.count;
  const items = Array.isArray(data) ? data : (data.results || []);
  return items.length;
}

export async function register(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/register/`, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Accept":"application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { body = "<no body>"; }
    // JSON일 수도, 아닐 수도 있으니 그대로 메시지에 싣기
    throw new Error(`회원가입 실패: ${res.status} ${body}`);
  }
  return res.json(); // {id, username}
}