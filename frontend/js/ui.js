// js/ui.js
// ✅ 토스트/로딩 등 UI 유틸

import { $, show, hide } from "./state.js";

let loadingCount = 0;

export function showToast(msg, ms = 2000) {
  const el = $("#toast");
  if (!el) return alert(msg); // 안전망
  el.textContent = msg;
  show(el);
  setTimeout(() => hide(el), ms);
}

export function startLoading() {
  const el = $("#loading");
  if (!el) return;
  if (++loadingCount === 1) show(el);
}

export function endLoading() {
  const el = $("#loading");
  if (!el) return;
  if (loadingCount > 0 && --loadingCount === 0) hide(el);
}