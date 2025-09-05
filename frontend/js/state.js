// js/state.js
// ✅ 앱 전역 상태 & 공용 DOM 헬퍼

export const API_BASE = "http://127.0.0.1:8000"; // 개발 서버 주소

// 로컬 스토리지 토큰/유저
export const store = {
  get access() { return localStorage.getItem("access") || ""; },
  set access(v) { localStorage.setItem("access", v || ""); },
  get refresh() { return localStorage.getItem("refresh") || ""; },
  set refresh(v) { localStorage.setItem("refresh", v || ""); },
  get username() { return localStorage.getItem("username") || ""; },
  set username(v) { localStorage.setItem("username", v || ""); },
  clear() { ["access","refresh","username"].forEach(k => localStorage.removeItem(k)); }
};

// 마지막 목록 쿼리/현재 상세글
export let lastListQuery = { search:"", category:"", tags:"", ordering:"-created_at", page:1 };
export let currentDetailId = null;
export function setLastListQuery(q) { lastListQuery = q; }
export function setCurrentDetailId(id) { currentDetailId = id; }

// DOM 헬퍼
export const $  = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// 표시/숨김
export function show(el) { el.classList.remove("hidden"); }
export function hide(el) { el.classList.add("hidden"); }