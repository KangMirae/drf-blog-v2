
window.addEventListener("error", (e) => console.error("window.error:", e.message, e));
window.addEventListener("unhandledrejection", (e) => console.error("unhandledrejection:", e.reason));

// 앱 진입점: 렌더링/이벤트
import { $, $$, show, hide, store, lastListQuery, setLastListQuery, setCurrentDetailId } from "./state.js";
import { showToast, startLoading, endLoading } from "./ui.js";
import {
  register, login, listPosts, getPost, createPost, updatePost, deletePost, likePost,
  listComments, addComment, deleteComment, listUnreadNotifications, markAllNotificationsRead, getUnreadCount, markNotificationRead
} from "./api.js";

async function refreshBell() {
  const el = $("#bell-count");           // 요소를 변수에 담고
  if (!store.access) {                   // 미로그인: 0 표시 후 종료
    if (el) el.textContent = "0";
    return;
  }
  const n = await getUnreadCount();      // 읽지 않은 알림 수 조회
  if (el) el.textContent = String(n);    // 요소가 있으면 갱신
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
    const q = $("#q").value.trim();
    const cat = $("#category").value.trim();
    const tg = $("#tags").value.trim();
    const ord = $("#ordering").value;
    if (page === null) page = (lastListQuery.page ?? 1);

    const query = { search: q, category: cat, tags: tg, ordering: ord, page };
    setLastListQuery(query);

    const data = await listPosts(query);
    $("#posts").innerHTML = (data.results || data).map(postCard).join("");

    const pager = $("#pager");
    pager.innerHTML = "";
    if (data.previous) {
      const b = document.createElement("button");
      b.textContent = "이전";
      b.onclick = () => loadPosts(Math.max(1, (query.page || 1) - 1));
      pager.appendChild(b);
    }
    if (data.next) {
      const b = document.createElement("button");
      b.textContent = "다음";
      b.onclick = () => loadPosts((query.page || 1) + 1);
      pager.appendChild(b);
    }
  } catch (e) {
    showToast(e.message);
  }
}

function renderDetail(p, comments = []) {
  setCurrentDetailId(p.id);
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

  const amOwner = store.username && p.author === store.username;
  if (amOwner) show($("#edit-area")); else hide($("#edit-area"));
  $("#edit-title").value = p.title;
  $("#edit-content").value = p.content;

  $("#like-btn").onclick = async () => {
    const btn = $("#like-btn");
    const likeBadge = $("#like-count");
    btn.disabled = true;
    const before = parseInt((likeBadge.textContent.match(/\d+/) || [0])[0], 10);
    likeBadge.textContent = `❤️ ${before + 1}`;
    try {
      await likePost(p.id);
    } catch {
      likeBadge.textContent = `❤️ ${before}`;
      showToast("좋아요 실패");
    } finally {
      const fresh = await getPost(p.id);
      const cs = await listComments(p.id);
      btn.disabled = false;
      renderDetail(fresh, cs);
      loadPosts((lastListQuery.page || 1));
    }
  };

  $("#edit-toggle").onclick = () => { $("#edit-area").scrollIntoView({behavior:"smooth"}); };
  $("#delete-btn").onclick = async () => {
    if (!confirm("정말 삭제할까요?")) return;
    await deletePost(p.id);
    setCurrentDetailId(null);
    hide($("#detail")); show($("#list"));
    loadPosts((lastListQuery.page || 1));
  };
  $("#edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const title = $("#edit-title").value.trim();
    const content = $("#edit-content").value.trim();
    const updated = await updatePost(p.id, { title, content });
    renderDetail(updated, await listComments(p.id));
    loadPosts((lastListQuery.page || 1));
  };

  $("#comments").innerHTML = comments.map(c => `
    <div class="post">
      <div class="meta">#${c.id} by ${c.author} / ${new Date(c.created_at).toLocaleString()}</div>
      <div>${c.content}</div>
      ${store.username && c.author === store.username ? `<button class="danger" data-delc="${c.id}">댓글 삭제</button>` : ""}
    </div>
  `).join("");

  $("#comment-form").onsubmit = async (e) => {
    e.preventDefault();
    const $input = $("#comment-input");
    const txt = $input.value.trim();
    if (!txt) return;
    await addComment(p.id, txt);
    $input.value = ""; $input.focus();
    renderDetail(await getPost(p.id), await listComments(p.id));
    loadPosts((lastListQuery.page || 1));
  };
  $$("#comments [data-delc]").forEach(btn => {
    btn.onclick = async () => {
      await deleteComment(btn.getAttribute("data-delc"));
      renderDetail(await getPost(p.id), await listComments(p.id));
      loadPosts((lastListQuery.page || 1));
    };
  });

  
}

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

window.addEventListener("DOMContentLoaded", () => {
  renderAuth();
  loadPosts();
  refreshBell();
  setInterval(refreshBell, 30000);

  $("#search-form").onsubmit = (e) => { e.preventDefault(); loadPosts(1); };
  $("#refresh-btn").onclick = () => loadPosts((lastListQuery.page || 1));
  $("#back-btn").onclick = () => { hide($("#detail")); hide($("#noti")); show($("#list")); setCurrentDetailId(null); loadPosts((lastListQuery.page || 1)); };

  $("#load-noti-btn")?.addEventListener("click", async () => {
    if (!store.access) return alert("로그인 필요");
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
    hide($("#detail")); hide($("#list")); show($("#noti"));
  });

  $("#noti-list").addEventListener("click", async (e) => {
    const a = e.target.closest(".noti-link");
    if (!a) return;
    e.preventDefault();
    const notiId = a.getAttribute("data-noti-id");
    const postId = a.getAttribute("data-post-id");
    // 읽음 처리
    await markNotificationRead(notiId);
    refreshBell();

    // 글로 이동 (post_id가 있을 때)
    if (postId) {
      const post = await getPost(postId);
      const cs = await listComments(postId);
      renderDetail(post, cs);
    } else {
      // 링크할 대상이 없으면 알림 목록만 갱신
      openNotifications();
    }
  });

  $("#bell-btn")?.addEventListener("click", async () => {
    if (!store.access) return alert("로그인 필요");
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
    hide($("#detail")); hide($("#list")); show($("#noti"));
  });

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
      refreshBell();
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
    } catch (err) { alert(err.message); }
  };

  $("#logout-btn").onclick = () => {
    store.clear();
    renderAuth();
    hide($("#detail")); hide($("#noti")); show($("#list"));
    loadPosts(); refreshBell();
  };

  $("#create-form").onsubmit = async (e) => {
    e.preventDefault();
    if (!store.access) return alert("로그인 필요");
    const title = $("#new-title").value.trim();
    const content = $("#new-content").value.trim();
    const category = $("#new-category").value.trim();
    const tags = $("#new-tags").value.trim();
    try {
      const p = await createPost({ title, content, category, tags });
      $("#new-title").value = ""; $("#new-content").value = ""; $("#new-category").value = ""; $("#new-tags").value = "";
      renderDetail(p, await listComments(p.id));
      loadPosts(1);
    } catch (err) { alert(err.message); }
  };

  $("#posts").addEventListener("click", async (e) => {
    const a = e.target.closest("[data-goto='detail']");
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute("data-id");
    renderDetail(await getPost(id), await listComments(id));
  });
  $("#load-noti-btn")?.addEventListener("click", openNotifications);
  $("#bell-btn")?.addEventListener("click", openNotifications);
    $("#signup-form").onsubmit = async (e) => {
    e.preventDefault();
    const u = $("#signup-username").value.trim();
    const p = $("#signup-password").value.trim();
    try {
      await register(u, p);            // 가입
      await login(u, p);               // 자동 로그인
      $("#signup-username").value = "";
      $("#signup-password").value = "";
      renderAuth();
      loadPosts(1);
      refreshBell();
    } catch (err) {
      alert(err.message);
    }
  };
  $("#brand").onclick = () => {
    hide($("#detail")); hide($("#noti")); show($("#list"));
    // 최신 목록 1페이지로
    loadPosts(1);
  };
});

// 알림 목록 열기 부분 교체 (load-noti-btn, bell-btn 공통으로 사용)
async function openNotifications() {
  if (!store.access) return alert("로그인 필요");
  const items = await listUnreadNotifications(); // 배열로 정규화됨
  $("#noti-list").innerHTML = (items.length
    ? items.map(n => `
        <div class="post">
          <div class="meta">#${n.id} / ${new Date(n.created_at).toLocaleString()}</div>
          <div>
            <a href="#" class="noti-link" data-noti-id="${n.id}" data-post-id="${n.post_id || ""}">
              ${n.message || ""}
            </a>
          </div>
        </div>
      `).join("")
    : `<div class="meta">읽지 않은 알림이 없습니다.</div>`
  );
  hide($("#detail")); hide($("#list")); show($("#noti"));
}

