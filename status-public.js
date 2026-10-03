"use strict";
/*
 * 六席状态 · 公开脱敏视图
 * 数据源：Supabase agent_status_public 视图（anon 可读，仅 5 个脱敏字段）
 * 任何人可看，无需登录。点"刷新"重读 Supabase，不直连 GitHub。
 */
(() => {
  const BASE = "https://ftcyyvyoowkctbupzkct.supabase.co";
  const PUB = "sb_publishable_vsp2sdBNKkqGh97lTvJRFg_Bmk7fNdO";
  const $ = (id) => document.getElementById(id);
  const STATUS_LABEL = { "工作中": "工作中", "空闲": "空闲", "blocked": "受阻", "未知": "未知" };
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtTime(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("zh-CN", { hour12: false }); }
    catch (_e) { return "—"; }
  }
  function render(rows) {
    const box = $("agentStatusGrid");
    if (!box) return;
    if (!rows || !rows.length) { box.innerHTML = '<p class="muted">暂无状态数据</p>'; return; }
    box.innerHTML = rows.map((r) => {
      const st = STATUS_LABEL[r.status] || esc(r.status) || "未知";
      const badgeCls = r.status === "工作中" ? "badge ok" : (r.status === "blocked" ? "badge bad" : "badge");
      return '<article class="public-item agent-card">' +
        '<div class="agent-head"><strong>' + esc(r.name) + '</strong>' +
        '<span class="' + badgeCls + '">' + st + '</span></div>' +
        '<p class="agent-task">' + esc(r.task_name || "—") + '</p>' +
        '<p class="agent-time field-note">更新于 ' + esc(fmtTime(r.updated_at)) + '</p>' +
        '</article>';
    }).join("");
    const meta = $("agentStatusMeta");
    if (meta) meta.textContent = "共 " + rows.length + " 席 · " + new Date().toLocaleString("zh-CN", { hour12: false }) + " 刷新";
  }
  async function load() {
    const statusEl = $("agentStatusState");
    const btn = $("agentStatusRefresh");
    if (btn) { btn.disabled = true; btn.textContent = "刷新中…"; }
    if (statusEl) { statusEl.style.display = ""; statusEl.textContent = "正在读取…"; statusEl.className = "status top-gap"; }
    try {
      const resp = await fetch(BASE + "/rest/v1/agent_status_public?select=*&order=id", {
        headers: { apikey: PUB, Authorization: "Bearer " + PUB }
      });
      if (!resp.ok) throw new Error("读取失败（" + resp.status + "）");
      render(await resp.json());
      if (statusEl) { statusEl.textContent = "已同步"; statusEl.className = "status top-gap ok"; }
    } catch (e) {
      if (statusEl) { statusEl.textContent = "读取失败：" + (e.message || e); statusEl.className = "status top-gap bad"; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "刷新"; }
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    const btn = $("agentStatusRefresh");
    if (btn) btn.addEventListener("click", load);
    if ($("agentStatusGrid")) load();
  });
})();
