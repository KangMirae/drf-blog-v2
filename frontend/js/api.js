// js/api.js
// ✅ 모든 네트워크 호출 모음 (JWT 자동 처리)
window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  const msg = e.reason?.message || "요청 중 오류가 발생했습니다.";
  alert(msg);
});

export const PAGE_SIZE = 10; // settings.py의 REST_FRAMEWORK["PAGE_SIZE"]와 동일하게!

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
  headers.set("Accept", "application/json");
  // body가 FormData가 아닐 때만 Content-Type 지정
  if (opts.body && !(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (store.access) {
    headers.set("Authorization", `Bearer ${store.access}`);
  }

  let res;
  try {
    res = await fetch(url, { ...opts, headers, credentials: "omit" });
  } catch (err) {
    console.error("fetch error:", err);
    throw new Error("서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.");
  }

  // 401이 아니면 그대로 반환
  if (res.status !== 401) return res;

  // 401인데 재시도 불가/리프레시 없음 → 그대로 반환
  if (!retry || !store.refresh) return res;

  // 액세스 토큰 재발급 시도
  const ok = await refreshAccessToken(); // ← true/false 반환하고 store.access 갱신해야 함
  if (!ok) return res;

  // 재시도: 새 토큰으로 Authorization 헤더 갱신 후 다시 호출
  const headers2 = new Headers(headers);
  headers2.set("Authorization", `Bearer ${store.access}`);
  try {
    return await fetch(url, { ...opts, headers: headers2, credentials: "omit" });
  } catch (err) {
    console.error("fetch retry error:", err);
    throw new Error("네트워크 오류로 요청을 완료하지 못했습니다.");
  }
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

export async function updatePost(id, fields = {}, { skipAI = false } = {}) {
  const body = {};
  const { title, content, category, tags } = fields;
  if (typeof title === "string")   body.title = title.trim();
  if (typeof content === "string") body.content = content.trim();
  if (typeof category === "string") body.category = category.trim();
  if (Array.isArray(tags))         body.tags = tags;

  const qs = skipAI ? "?skip_ai=1" : "";
  const url = `${API_BASE}/api/posts/${encodeURIComponent(identifier)}/${qs}`;
  const res = await fetchWithAuth(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
   if (!res.ok) {
     let body = "";
     try { body = await res.text(); } catch { body = "<no body>"; }
    throw new Error(`요청 실패: ${res.status} ${body}`);
   }
   return await res.json();
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

export async function searchTags(q, page = 1) {
  const params = new URLSearchParams();
  if (q) params.set("search", q);
  params.set("page", page);
  const res = await fetchWithAuth(`${API_BASE}/api/tags/${params.toString() ? "?" + params : ""}`);
  if (!res.ok) throw new Error("태그 검색 실패");
  const data = await res.json();
  // 페이지네이션/비페이지네이션 모두 대응
  return Array.isArray(data) ? data : (data.results || []);
}