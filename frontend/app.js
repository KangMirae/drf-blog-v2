// ====================== 설정 ======================
const API_BASE = "http://127.0.0.1:8000";

// 토큰/유저명은 브라우저 로컬 저장소에 보관 (새로고침해도 유지)
const store = {
  get access() { return localStorage.getItem("access") || ""; },
  set access(v) { localStorage.setItem("access", v || ""); },
  get refresh() { return localStorage.getItem("refresh") || ""; },
  set refresh(v) { localStorage.setItem("refresh", v || ""); },
  get username() { return localStorage.getItem("username") || ""; },
  set username(v) { localStorage.setItem("username", v || ""); },
  clear() { localStorage.removeItem("access"); localStorage.removeItem("refresh"); localStorage.removeItem("username"); }
};

// 화면 상태: 마지막 목록 쿼리(검색/필터/정렬/페이지) + 현재 상세 글 ID
let lastListQuery = { search: "", category: "", tags: "", ordering: "-created_at", page: 1 };
let currentDetailId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

// ====================== 공용 fetch 래퍼 ======================
// - Authorization 자동 부착
// - 401 나오면 refresh로 1회 재시도
async function fetchWithAuth(url, opts = {}, retry = true) {
  const headers = new Headers(opts.headers || {});
  headers.set("Accept", "application/json");
  if (!(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (store.access) {
    headers.set("Authorization", `Bearer ${store.access}`);
  }

  const res = await fetch(url, { ...opts, headers });
  if (res.status !== 401) return res;

  // 401 → refresh 시도 (한 번만)
  if (!retry || !store.refresh) return res;

  const ok = await refreshAccessToken();
  if (!ok) return res;

  // 새 access로 재시도
  return fetchWithAuth(url, opts, false);
}

async function refreshAccessToken() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ refresh: store.refresh })
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access) {
      store.access = data.access;
      return true;
    }
    return false;
  } catch (e) {
    console.error("refresh error", e);
    return false;
  }
}

// ====================== 인증 ======================
async function login(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`로그인 실패: ${res.status} ${msg}`);
  }
  const data = await res.json();
  store.access = data.access;
  store.refresh = data.refresh;
  store.username = username; // 토큰에 username이 없으니 입력값 저장
}

function logout() {
  store.clear();
  renderAuth();
  // 화면도 초기화
  hide($("#detail")); hide($("#noti"));
  show($("#list"));
  loadPosts(); // 비로그인 목록
  refreshBell();
}

// ====================== API 호출 함수들 ======================
async function listPosts({ search, category, tags, ordering, page } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  if (tags) params.set("tags", tags); // "drf,jwt"
  if (ordering) params.set("ordering", ordering);
  if (page) params.set("page", page);
  const url = `${API_BASE}/api/posts/${params.toString() ? "?" + params : ""}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error("목록 조회 실패");
  return res.json(); // {count, next, previous, results:[]}
}

async function getPost(id) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${id}/`);
  if (!res.ok) throw new Error("상세 조회 실패");
  return res.json();
}

async function createPost({ title, content, category, tags }) {
  // 백엔드는 category=slug, tags=슬러그 배열 기대
  const body = {
    title: (title ?? "").trim(),
    content: (content ?? "").trim(),
  };
  if (category && category.trim()) body.category = category.trim();
  if (tags && tags.trim()) {
    body.tags = tags.split(",").map(s => s.trim()).filter(Boolean);
  }

  const res = await fetchWithAuth(`${API_BASE}/api/posts/`, {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    // 에러 상세를 DRF 포맷대로 보여주기 (JSON 우선)
    try {
      const err = await res.json();
      throw new Error(`글 생성 실패: ${JSON.stringify(err)}`);
    } catch (_) {
      const msg = await res.text();
      throw new Error(`글 생성 실패: ${msg}`);
    }
  }

  return res.json(); // 생성된 포스트 객체
}

async function updatePost(id, { title, content }) {
  const payload = {};
  if (typeof title === "string") payload.title = title.trim();
  if (typeof content === "string") payload.content = content.trim();

  const res = await fetchWithAuth(`${API_BASE}/api/posts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    try {
      const err = await res.json();
      throw new Error(`수정 실패: ${JSON.stringify(err)}`);
    } catch (_) {
      const msg = await res.text();
      throw new Error(`수정 실패: ${msg}`);
    }
  }

  return res.json(); // 수정된 포스트 객체
}

async function deletePost(id) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${id}/`, { method: "DELETE" });
  if (res.status !== 204) {
    const msg = await res.text();
    throw new Error(`삭제 실패: ${msg}`);
  }
}

async function likePost(id) {
  // 서버가 toggle이든 create-only든 백엔드 동작에 맡김
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${id}/like/`, { method: "POST" });
  // 200/201/204 등 다양할 수 있으니 그냥 다시 상세 불러오기 추천
  return res.ok;
}

async function listComments(postId) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${postId}/comments/`);
  if (!res.ok) throw new Error("댓글 목록 실패");
  const data = await res.json();
  // 전역 페이지네이션 대응: 배열 또는 {results:[]} 모두 처리
  return Array.isArray(data) ? data : (data.results || []);
}

async function addComment(postId, content) {
  const res = await fetchWithAuth(`${API_BASE}/api/posts/${postId}/comments/`, {
    method: "POST",
    body: JSON.stringify({ content: (content ?? "").trim() })
  });

  if (!res.ok) {
    try {
      const err = await res.json();
      throw new Error(`댓글 작성 실패: ${JSON.stringify(err)}`);
    } catch (_) {
      const msg = await res.text();
      throw new Error(`댓글 작성 실패: ${msg}`);
    }
  }

  return res.json(); // 생성된 댓글 객체
}

async function deleteComment(commentId) {
  const res = await fetchWithAuth(`${API_BASE}/api/comments/${commentId}/`, { method: "DELETE" });
  if (res.status !== 204) throw new Error("댓글 삭제 실패");
}

async function listUnreadNotifications() {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications/unread/`);
  if (!res.ok) throw new Error("알림 조회 실패");
  const data = await res.json();
  // 전역 페이지네이션 대응: 배열 또는 {results:[]} 모두 처리
  return Array.isArray(data) ? data : (data.results || []);
}

async function markAllNotificationsRead() {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications/mark_read/`, {
    method: "PATCH",
    body: JSON.stringify({ all: true })
  });
  return res.ok;
}

// ====================== UI 렌더링 ======================
function renderAuth() {
  const logged = !!store.access;
  if (logged) {
    hide($("#login-form"));
    $("#whoami").textContent = `안녕하세요, ${store.username}`;
    show($("#logged-in"));
    show($("#create-post"));
    show($("#comment-form"));
  } else {
    show($("#login-form"));
    hide($("#logged-in"));
    hide($("#create-post"));
    hide($("#comment-form"));
  }
}

function postCard(p) {
  const tags = (p.tags || []).map(t => `<span class="badge">#${t}</span>`).join("");
  const aiTagsArr = p.tags_suggested || [];
  const aiTags = aiTagsArr.length
    ? aiTagsArr.map(t => `<span class="badge">${t}</span>`).join("")
    : `<span class="badge" style="background:#f0f0f0;color:#666">추천태그없음</span>`;
  return `
    <div class="post">
      <div class="meta">#${p.id} / by ${p.author} / ${new Date(p.created_at).toLocaleString()}</div>
      <h3><a href="#" data-goto="detail" data-id="${p.id}">${p.title}</a></h3>
      ${p.summary?.trim() ? `<p>${p.summary}</p>` : `<p>${(p.content||"").substring(0,120)}...</p>`}
      <div class="meta">
        ${tags} ${aiTags}
        <span class="badge">❤️ ${p.like_count ?? 0}</span>
        <span class="badge">💬 ${p.comment_count ?? 0}</span>
      </div>
    </div>
  `;
}

async function loadPosts(page = null) {
  try {
    // 1) 폼에서 현재 조건을 읽어서 lastListQuery 갱신
    const q = $("#q").value.trim();
    const cat = $("#category").value.trim();
    const tg = $("#tags").value.trim();
    const ord = $("#ordering").value;
    if (page === null) page = lastListQuery.page ?? 1; // page 미지정 시 기존 페이지 유지

    lastListQuery = {
      search: q, category: cat, tags: tg, ordering: ord, page
    };

    // 2) 실제 API 호출
    const data = await listPosts(lastListQuery);

    // 3) 렌더
    $("#posts").innerHTML = (data.results || data).map(postCard).join("");

    // 4) 페이지네이션
    const pager = $("#pager");
    pager.innerHTML = "";
    if (data.previous) {
      const b = document.createElement("button");
      b.textContent = "이전";
      b.onclick = () => loadPosts(Math.max(1, (lastListQuery.page || 1) - 1));
      pager.appendChild(b);
    }
    if (data.next) {
      const b = document.createElement("button");
      b.textContent = "다음";
      b.onclick = () => loadPosts((lastListQuery.page || 1) + 1);
      pager.appendChild(b);
    }

  } catch (e) {
    alert(e.message);
  }
}

function renderDetail(p, comments=[]) {
    // 혹시 안전망: 여기서도 한 번 더 정규화
  currentDetailId = p.id;                                           // ✅ 현재 상세 ID 기억
  comments = Array.isArray(comments) ? comments : (comments?.results || []);
  show($("#detail")); hide($("#list")); hide($("#noti"));
  const aiTagsArr = p.tags_suggested || [];
  const aiTags = aiTagsArr.length
    ? aiTagsArr.map(t => `<span class="badge">${t}</span>`).join("")
    : `<span class="badge" style="background:#f0f0f0;color:#666">추천태그없음</span>`;
  $("#post-detail").innerHTML = `
    <div class="meta">#${p.id} / by ${p.author} / ${new Date(p.created_at).toLocaleString()}</div>
    <h2>${p.title}</h2>
    ${p.summary?.trim() ? `<p><strong>요약:</strong> ${p.summary}</p>` : ""}
    <pre style="white-space:pre-wrap">${p.content || ""}</pre>
    <div class="meta">
      ${(p.tags || []).map(t => `<span class="badge">#${t}</span>`).join("")}
      ${aiTags}
      <span class="badge" id="like-count">❤️ ${p.like_count ?? 0}</span>
      <span class="badge">💬 ${p.comment_count ?? 0}</span>
    </div>
    <div class="row">
      <button id="like-btn">좋아요</button>
      <button id="edit-toggle">수정/삭제</button>
    </div>
  `;
  // 본인 글만 수정 영역 열기 (간단 판별: author === username)
  const amOwner = store.username && p.author === store.username;
  if (amOwner) show($("#edit-area")); else hide($("#edit-area"));
  $("#edit-title").value = p.title;
  $("#edit-content").value = p.content;

  $("#comments").innerHTML = comments.map(c => `
    <div class="post">
      <div class="meta">#${c.id} by ${c.author} / ${new Date(c.created_at).toLocaleString()}</div>
      <div>${c.content}</div>
      ${store.username && c.author === store.username ? `<button class="danger" data-delc="${c.id}">댓글 삭제</button>` : ""}
    </div>
  `).join("");

  // 이벤트 바인딩
  // 좋아요: 낙관적(버튼 즉시 비활성 + 수치 잠깐 올렸다가) → 서버 결과로 재동기화
  $("#like-btn").onclick = async () => {
    const btn = $("#like-btn");
    const likeBadge = $("#like-count");
    btn.disabled = true;

    // 낙관적 UI: 일단 +1처럼 보이게 (실제 토글은 서버 결정)
    const before = parseInt((likeBadge.textContent.match(/\d+/) || [0])[0], 10);
    likeBadge.textContent = `❤️ ${before + 1}`;
    startLoading();                // ← 시작
    try {
      await likePost(p.id);
    } catch (e) {
      // 실패 시 복구 메시지
      likeBadge.textContent = `❤️ ${before}`;
      console.error(e);
    } finally {
      // 진짜 서버 상태로 동기화
      const fresh = await getPost(p.id);
      const cs = await listComments(p.id);
      btn.disabled = false;
      renderDetail(fresh, cs);
      // 목록으로 돌아갈 때 최신 카드가 보이도록 백그라운드에서 목록 갱신
      loadPosts(lastListQuery.page || 1);
      endLoading();               // ← 종료
    }
  };
  $("#edit-toggle").onclick = () => { $("#edit-area").scrollIntoView({behavior:"smooth"}); };
  $("#delete-btn").onclick = async () => {
    if (!confirm("정말 삭제할까요?")) return;
    await deletePost(p.id);
    currentDetailId = null;
    hide($("#detail")); show($("#list"));
    loadPosts(lastListQuery.page || 1);           // ✅ 목록 최신화
  };
  $("#edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const title = $("#edit-title").value.trim();
    const content = $("#edit-content").value.trim();
    const updated = await updatePost(p.id, { title, content });
    renderDetail(updated, await listComments(p.id));
    loadPosts(lastListQuery.page || 1);           // ✅ 목록 카드도 최신화
  };
  $("#comment-form").onsubmit = async (e) => {
    e.preventDefault();
    const $input = $("#comment-input");
    const txt = $input.value.trim();
    if (!txt) return;
    await addComment(p.id, txt);
    $input.value = "";
    $input.focus();                                // ✅ 포커스 유지
    renderDetail(await getPost(p.id), await listComments(p.id));
    // 목록 카드의 댓글 수치도 최신화
    loadPosts(lastListQuery.page || 1);
  };
  // 댓글 삭제 버튼들
  $$("#comments [data-delc]").forEach(btn => {
    btn.onclick = async () => {
      await deleteComment(btn.getAttribute("data-delc"));
      renderDetail(await getPost(p.id), await listComments(p.id));
      loadPosts(lastListQuery.page || 1);
    };
  });
}

// ====================== 이벤트 배선 ======================
window.addEventListener("DOMContentLoaded", () => {
  renderAuth();
  loadPosts();
  refreshBell();          
  setInterval(refreshBell, 30000); // 30초마다 갱신

  $("#search-form").onsubmit = (e) => { 
    e.preventDefault(); 
    loadPosts(1);                 // 검색하면 1페이지로
  };
  // 수동 새로고침
  $("#refresh-btn").onclick = () => loadPosts( lastListQuery.page || 1 );
  // 뒤로가기(목록으로)
  $("#back-btn").onclick = () => { 
    hide($("#detail")); hide($("#noti")); show($("#list"));
    currentDetailId = null;
    // 뒤로 오면 최신 목록 보이게
    loadPosts( lastListQuery.page || 1 );
  };
  
  $("#load-noti-btn").onclick = async () => {
    if (!store.access) return alert("로그인 필요");
    try {
      const items = await listUnreadNotifications();   // ← 여기서 이미 배열로 보장
      $("#noti-list").innerHTML = (items.length
        ? items.map(n => `
            <div class="post">
              <div class="meta">#${n.id} / ${new Date(n.created_at).toLocaleString()}</div>
              <div>${n.message || ""}</div>
            </div>
          `).join("")
        : `<div class="meta">읽지 않은 알림이 없습니다.</div>`
      );
      hide($("#detail")); hide($("#list")); show($("#noti"));
    } catch (e) {
      console.error(e);
      alert("알림을 불러오지 못했습니다.");
    }
  };

//   $("#bell-btn").onclick = async () => {
//     if (!store.access) return alert("로그인 필요");
//     try {
//       const items = await listUnreadNotifications(); // 이미 배열로 정규화된 함수 사용 중
//       $("#noti-list").innerHTML = (items.length
//         ? items.map(n => `
//             <div class="post">
//               <div class="meta">#${n.id} / ${new Date(n.created_at).toLocaleString()}</div>
//               <div>${n.message || ""}</div>
//             </div>
//           `).join("")
//         : `<div class="meta">읽지 않은 알림이 없습니다.</div>`
//       );
//       hide($("#detail")); hide($("#list")); show($("#noti"));
//     } catch (e) {
//     console.error(e);
//     alert("알림을 불러오지 못했습니다.");
//   }
//   };

  $("#mark-read-btn").onclick = async () => {
    if (!store.access) return alert("로그인 필요");
    const ok = await markAllNotificationsRead();
    if (ok) {
      const items = await listUnreadNotifications();
      $("#noti-list").innerHTML = (items.length
        ? items.map(n => `
            <div class="post">
              <div class="meta">#${n.id} / ${new Date(n.created_at).toLocaleString()}</div>
              <div>${n.message || ""}</div>
            </div>
          `).join("")
        : `<div class="meta">읽지 않은 알림이 없습니다.</div>`
      );
      refreshBell(); // ← 숫자 갱신
    } else {
      alert("읽음 처리 실패");
    }
  };

  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const u = $("#login-username").value.trim();
    const p = $("#login-password").value.trim();
    try {
      await login(u, p);
      renderAuth();
      loadPosts();
      refreshBell();
    } catch (err) {
      alert(err.message);
    }
  };
  $("#logout-btn").onclick = logout;

  $("#create-form").onsubmit = async (e) => {
    e.preventDefault();
    if (!store.access) return alert("로그인 필요");
    const title = $("#new-title").value.trim();
    const content = $("#new-content").value.trim();
    const category = $("#new-category").value.trim();
    const tags = $("#new-tags").value.trim();
    try {
      const p = await createPost({ title, content, category, tags });
      // 폼 초기화
      $("#new-title").value = ""; $("#new-content").value = ""; $("#new-category").value = ""; $("#new-tags").value = "";
      // 방금 쓴 글 상세로 이동
      const comments = await listComments(p.id);
      renderDetail(p, comments);
      // 목록은 뒤에서 최신화 → "목록" 눌렀을 때 바로 보이게
      loadPosts(1); // 새 글이 1페이지 상단에 오도록 1페이지 로드
    } catch (err) {
      alert(err.message);
    }
  };

  // 목록에서 제목 클릭 → 상세로
  $("#posts").addEventListener("click", async (e) => {
    const a = e.target.closest("[data-goto='detail']");
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute("data-id");
    const p = await getPost(id);
    const cs = await listComments(id);
    renderDetail(p, cs);
  });

});

async function getUnreadCount() {
    const res = await fetchWithAuth(`${API_BASE}/api/notifications/unread/`);
    if (!res.ok) return 0;
    const data = await res.json();
    if (typeof data?.count === "number") return data.count;
    const items = Array.isArray(data) ? data : (data.results || []);
    return items.length;
}
async function refreshBell() {
  if (!store.access) { $("#bell-count").textContent = "0"; return; }
  try {
    const n = await getUnreadCount();
    $("#bell-count").textContent = String(n);
  } catch {
    $("#bell-count").textContent = "0";
  }
}
function showToast(msg, ms = 2000) {
  const el = $("#toast");
  el.textContent = msg;
  show(el);
  setTimeout(() => hide(el), ms);
}
let loadingCount = 0;
function startLoading() {
  if (++loadingCount === 1) show($("#loading"));
}
function endLoading() {
  if (loadingCount > 0 && --loadingCount === 0) hide($("#loading"));
}