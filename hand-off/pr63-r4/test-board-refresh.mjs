#!/usr/bin/env node
// Board refresh logic tests for mz-ph-ui PR63 (run locally, not committed).
// Extracts the SHIPPED functions from app.js and executes them in a stubbed DOM.
import { readFileSync } from "fs";
import vm from "vm";

const APP = process.env.BOARD_APP_JS || "/home/hatch/workspace/board-pr63/app.js";
const HTML = process.env.BOARD_WORKSPACE_HTML || "/home/hatch/workspace/board-pr63/workspace.html";
const src = readFileSync(APP, "utf8");

function extractFn(source, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = re.exec(source);
  if (!m) throw new Error("function not found: " + name);
  let start = m.index;
  if (source.slice(Math.max(0, start - 6), start) === "async ") start -= 6; // 保留 async 前缀
  // 先匹配参数列表的括号（跳过默认值里的 {}/字符串），再找函数体 {
  let p = source.indexOf("(", m.index), depth = 0, inStr = null, j = p;
  for (; j < source.length; j++) {
    const c = source[j];
    if (inStr) { if (c === "\\") j++; else if (c === inStr) inStr = null; }
    else if (c === '"' || c === "'" || c === "`") inStr = c;
    else if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) break; }
  }
  let i = source.indexOf("{", j);
  depth = 0;
  for (let k = i; k < source.length; k++) {
    if (source[k] === "{") depth++;
    else if (source[k] === "}") { depth--; if (depth === 0) return source.slice(start, k + 1); }
  }
  throw new Error("unbalanced braces: " + name);
}
function extractLets(source, prefix) {
  return source.split("\n").filter(l => /^\s*let\s+/.test(l) && l.includes(prefix)).join("\n");
}
function extractConsts(source, names) {
  return source.split("\n").filter(l => /^\s*const\s+/.test(l) && names.some(n => l.includes(n))).join("\n");
}

const FNS = ["escHtmlAgent", "agentStatusBadge", "renderAgentStatusOps", "loadAgentStatusOps",
  "clearAgentStatusOps", "closeAgentPersonalBoard", "agentOpsPanelReadable", "agentOpsClearTimers",
  "agentOpsEnsureTimers", "agentOpsOnVisibilityChange", "openAgentPersonalBoard", "api"];
const prelude =
  extractLets(src, "agentOps") + "\n" +
  extractConsts(src, ["AGENT_OPS_FALLBACK_MS", "AGENT_OPS_TRACK_MS", "AGENT_SEAT_NAMES"]) + "\n" +
  FNS.map(n => extractFn(src, n)).join("\n");

// ---- stub world ----
function makeWorld() {
  const els = {};
  function el(id) {
    if (!els[id]) els[id] = { id, textContent: "", innerHTML: "", disabled: false, checked: false,
      classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c){this._s.add(c);}, remove(c){this._s.delete(c);} } };
    return els[id];
  }
  const timers = new Map(); let nextId = 1;
  const world = {
    document: { hidden: false, getElementById: (id) => el(id), addEventListener() {} },
    setInterval: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    Date, console,
    __timers: timers, __els: els,
    __authImpl: null,
    __token: "",
  };
  world.authApi = (...a) => world.__authImpl(...a);
  const ctx = vm.createContext(world);
  vm.runInContext(`
    let token = "";
    const $ = id => document.getElementById(id);
    function __setToken(v){ token = v; }
    function __getVars(){ return {agentOpsLoading, agentOpsGeneration, agentOpsFailures,
      agentOpsNextAttempt, agentOpsLastSuccessAt, agentOpsPendingRead,
      agentOpsTrack30s, agentOpsHourlyTimer, agentOpsTrackTimer}; }
    function __setVars(o){ for (const k of Object.keys(o)) eval(k + " = o[k]"); }
  ` + prelude, ctx);
  return { world, ctx,
    run: (expr) => vm.runInContext(expr, ctx),
    setToken: (v) => vm.runInContext(`__setToken(${JSON.stringify(v)})`, ctx),
    vars: () => vm.runInContext(`__getVars()`, ctx),
    setVars: (o) => vm.runInContext(`__setVars(${JSON.stringify(o)})`, ctx),
    el: (id) => els[id] || el(id),
    fireTimers: () => { for (const t of [...timers.values()]) t.fn(); },
    timerCount: () => timers.size,
    timerMs: () => [...timers.values()].map(t => t.ms).sort((a,b)=>a-b),
  };
}

const ROWS = [
  { id: "bi", status: "工作中", task_name: "t1", task_detail: "d1", updated_at: "2026-10-04T03:00:00+08:00" },
  { id: "mo", status: "空闲", task_name: "t2", task_detail: "d2", updated_at: "2026-10-04T02:00:00+08:00" },
  { id: "zhi", status: "blocked", task_name: "t3", task_detail: "d3", updated_at: "2026-10-04T01:00:00+08:00" },
  { id: "yan", status: "idle", task_name: "t4", task_detail: "d4", updated_at: "2026-10-04T00:00:00+08:00" },
  { id: "juan", status: "needs_review", task_name: "t5", task_detail: "d5", updated_at: "2026-10-03T23:00:00+08:00" },
  { id: "xia", status: "未知", task_name: "t6", task_detail: "d6", updated_at: "2026-10-03T22:00:00+08:00" },
];
const flush = () => new Promise(r => setImmediate(r));

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }

// 1. 打开读取：有 token 时读一次，渲染六席，记录成功时间
{
  const t = makeWorld(); t.setToken("tok");
  t.world.__authImpl = async () => ROWS;
  await t.run(`loadAgentStatusOps()`); await flush(); await flush();
  const html = t.el("agentStatusOpsList").innerHTML;
  ok("open-read renders 6 rows", (html.match(/<tr><td>/g) || []).length === 6);
  ok("open-read sets lastSuccessAt", t.vars().agentOpsLastSuccessAt > 0);
  ok("open-read state honest", t.el("agentStatusOpsState").textContent.includes("刷新成功"));
}

// 2. 无 token → 清空并等待登录（不请求网络）
{
  const t = makeWorld(); let called = 0;
  t.world.__authImpl = async () => { called++; return ROWS; };
  t.setToken("");
  await t.run(`loadAgentStatusOps()`); await flush();
  ok("no-token clears without fetch", called === 0 && t.el("agentStatusOpsState").textContent === "等待登录");
}

// 3. 并发抑制：在途时第二次调用不发起请求
{
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  t.world.__authImpl = async () => { n++; await new Promise(r => setTimeout(r, 30)); return ROWS; };
  const p1 = t.run(`loadAgentStatusOps()`); const p2 = t.run(`loadAgentStatusOps()`);
  await p1; await p2; await flush();
  ok("concurrency suppressed", n === 1);
}

// 4. 失败退避：60s→120s→240s→300s 封顶；成功重置
{
  const t = makeWorld(); t.setToken("tok");
  const delays = [];
  for (let i = 1; i <= 5; i++) {
    t.world.__authImpl = async () => { const e = new Error("x"); e.status = 500; throw e; };
    const before = Date.now();
    await t.run(`loadAgentStatusOps()`); await flush(); await flush();
    delays.push(Math.round((t.vars().agentOpsNextAttempt - before) / 1000));
    t.setVars({ agentOpsNextAttempt: 0 }); // 绕过退避门控以便连续触发
  }
  ok("backoff 60/120/240/300/300", JSON.stringify(delays) === JSON.stringify([60, 120, 240, 300, 300]));
  t.world.__authImpl = async () => ROWS;
  await t.run(`loadAgentStatusOps()`); await flush(); await flush();
  ok("backoff reset on success", t.vars().agentOpsFailures === 0 && t.vars().agentOpsNextAttempt === 0);
}

// 5. 401 → 清空并提示登录失效；403 → 清空列表+权限文案（不碰 token 由 authApi 侧处理）
{
  const t = makeWorld(); t.setToken("tok");
  t.world.__authImpl = async () => { const e = new Error("u"); e.status = 401; throw e; };
  await t.run(`loadAgentStatusOps()`); await flush(); await flush();
  ok("401 clears to login", t.el("agentStatusOpsState").textContent.includes("登录已失效"));
  const t2 = makeWorld(); t2.setToken("tok");
  t2.world.__authImpl = async () => { const e = new Error("f"); e.status = 403; throw e; };
  await t2.run(`loadAgentStatusOps()`); await flush(); await flush();
  ok("403 clears list honestly", t2.el("agentStatusOpsList").innerHTML === "" &&
    t2.el("agentStatusOpsState").textContent.includes("权限不足"));
}

// 6. 隐藏暂停：隐藏时 ensureTimers 不持有任何定时器
{
  const t = makeWorld(); t.setToken("tok");
  t.world.document.hidden = true;
  t.run(`agentOpsEnsureTimers()`);
  ok("hidden holds no timers", t.timerCount() === 0);
  t.world.document.hidden = false;
  t.run(`agentOpsEnsureTimers()`);
  ok("visible holds hourly timer only (track off)", JSON.stringify(t.timerMs()) === JSON.stringify([60000]));
}

// 7. 可见时1小时兜底：超1小时未成功则读；新鲜则不读
{
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  t.world.__authImpl = async () => { n++; return ROWS; };
  t.run(`agentOpsEnsureTimers()`);
  t.setVars({ agentOpsLastSuccessAt: Date.now() - 3600001 });
  t.fireTimers(); await flush(); await flush();
  ok("hourly fallback fires when stale", n === 1);
  const t2 = makeWorld(); t2.setToken("tok"); let n2 = 0;
  t2.world.__authImpl = async () => { n2++; return ROWS; };
  t2.run(`agentOpsEnsureTimers()`);
  t2.setVars({ agentOpsLastSuccessAt: Date.now() });
  t2.fireTimers(); await flush();
  ok("hourly fallback quiet when fresh", n2 === 0);
}

// 8. 30秒跟踪默认关；打开后仅可见时生效
{
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  t.world.__authImpl = async () => { n++; return ROWS; };
  t.run(`agentOpsEnsureTimers()`);
  ok("track30s default off", !t.timerMs().includes(30000));
  t.setVars({ agentOpsTrack30s: true });
  t.run(`agentOpsEnsureTimers()`);
  ok("track30s on creates 30s timer", JSON.stringify(t.timerMs()) === JSON.stringify([30000, 60000]));
  t.fireTimers(); await flush(); await flush();
  ok("track30s timer triggers read", n >= 1);
}

// 9. 回归A：请求挂起→隐藏→返回，在途结束后补读一次
{
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  let release;
  t.world.__authImpl = () => new Promise(res => { n++; release = () => res(ROWS); });
  const p = t.run(`loadAgentStatusOps()`);           // 在途
  t.world.document.hidden = true;
  t.run(`agentOpsOnVisibilityChange()`);             // 隐藏
  ok("hidden-during-flight flagged", t.vars().agentOpsPendingRead === true);
  t.world.document.hidden = false;
  release(); await p; await flush(); await flush(); // 在途结束（已返回可见）
  ok("supplementary read after flight", n === 2);
  ok("flag consumed", t.vars().agentOpsPendingRead === false);
}
{
  // 变体：在途在隐藏期间结束，返回可见时补读
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  let release;
  t.world.__authImpl = () => new Promise(res => { n++; release = () => res(ROWS); });
  const p = t.run(`loadAgentStatusOps()`);
  t.world.document.hidden = true;
  t.run(`agentOpsOnVisibilityChange()`);
  release(); await p; await flush();                // 隐藏期间结束 → 不补读
  ok("no supplementary read while hidden", n === 1);
  t.world.document.hidden = false;
  t.run(`agentOpsOnVisibilityChange()`); await flush(); await flush();
  ok("supplementary read on return", n === 2);
}

// 10. 回归B：真正退出清等待关系；旧在途请求不污染新会话
{
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  let release;
  t.world.__authImpl = () => new Promise(res => { n++; release = () => res(ROWS); });
  const p = t.run(`loadAgentStatusOps()`);          // 旧会话在途请求
  t.run(`agentOpsEnsureTimers()`);
  t.setVars({ agentOpsTrack30s: true, agentOpsLastSuccessAt: 123, agentOpsPendingRead: true });
  t.run(`clearAgentStatusOps()`);                   // 退出
  const v = t.vars();
  ok("logout clears wait relations", v.agentOpsLoading === false && v.agentOpsNextAttempt === 0 &&
    v.agentOpsLastSuccessAt === 0 && v.agentOpsPendingRead === false &&
    v.agentOpsTrack30s === false && t.timerCount() === 0);
  ok("logout clears list", t.el("agentStatusOpsList").innerHTML === "");
  t.setToken("tok2");                               // 新会话
  release(); await p; await flush();
  ok("old flight ignored by new session", t.el("agentStatusOpsList").innerHTML === "" && n === 1);
  t.world.__authImpl = async () => { n++; return ROWS; };
  await t.run(`loadAgentStatusOps()`); await flush(); await flush();
  ok("new session reads fresh", n === 2 && t.el("agentStatusOpsList").innerHTML.includes("<tr>"));
}

// 11. 静态契约：无无条件30秒定时器；文案如实；CSP/权限/DB 未动
{
  const hasUnconditional30s = /setInterval\(\(\)=>\{loadAgentStatusOps\(\)\.catch\(\(\)=>\{\}\);\},30000\)/.test(src);
  ok("no unconditional 30s interval", !hasUnconditional30s);
  const html = readFileSync(HTML, "utf8");
  ok("copy honest (no 每30秒刷新)", !html.includes("每30秒刷新") && html.includes("可见时每小时兜底同步"));
  ok("copy not feedback-collecting", !/反馈|评价|打分/.test(html.match(/agentStatusOps[\s\S]{0,400}/)?.[0] || ""));
  ok("CSP unchanged", html.includes("connect-src https://ftcyyvyoowkctbupzkct.supabase.co"));
  ok("no new endpoints", (src.match(/\/rest\/v1\/agent_status/g) || []).length >= 1 &&
    !src.includes("/rest/v1/agent_personal"));
  ok("enterOperationsHub arms timers", /async function enterOperationsHub\(\)[\s\S]{0,300}agentOpsEnsureTimers\(\)/.test(src));
  ok("toggle wired", src.includes('agentStatusOpsTrack30s') && html.includes('id="agentStatusOpsTrack30s"'));
}

// 12. 个人板：六席可点击 + 五栏契约；无假数据、不标完成
{
  const t = makeWorld(); t.setToken("tok");
  t.world.__authImpl = async () => ROWS;
  await t.run(`loadAgentStatusOps()`); await flush(); await flush();
  const html = t.el("agentStatusOpsList").innerHTML;
  const seats = ["bi", "mo", "zhi", "yan", "juan", "xia"];
  ok("six seats clickable", seats.every(id => html.includes(`data-agent="${id}"`)));
  // 打开个人板
  t.el("agentPersonalBoard").classList.add("hidden");
  t.run(`openAgentPersonalBoard("bi")`);
  ok("personal board opens with seat title",
    !t.el("agentPersonalBoard").classList.contains("hidden") &&
    t.el("agentPersonalTitle").textContent.includes("笔"));
  const doc = readFileSync(HTML, "utf8");
  const cols = ["当前", "已批准待办", "待决", "近期完成", "归档"];
  ok("five-column contract", cols.every(c => doc.includes(`<h3>${c}</h3>`)));
  ok("honest empty states, no fake data",
    (doc.match(/数据未接入/g) || []).length >= 6);
  ok("marked as preparation, not complete", doc.includes("准备中"));
}

// 13. 回归#1：初读成功→无在途隐藏→1小时内返回，每次返回读取一次
{
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  t.world.__authImpl = async () => { n++; return ROWS; };
  await t.run(`loadAgentStatusOps()`); await flush(); await flush(); // 初读成功 call 1
  t.world.document.hidden = true;
  t.run(`agentOpsOnVisibilityChange()`); // 无在途隐藏
  t.world.document.hidden = false;
  t.run(`agentOpsOnVisibilityChange()`); await flush(); await flush(); // 1小时内返回
  ok("return-within-1h reads once", n === 2);
}

// 14. 回归#2：退出/401/403 须关闭个人板并重置标题
{
  const t = makeWorld();
  t.run(`openAgentPersonalBoard("bi")`);
  ok("personal opens", !t.el("agentPersonalBoard").classList.contains("hidden"));
  t.run(`clearAgentStatusOps()`); // 退出路径
  ok("clear closes personal board", t.el("agentPersonalBoard").classList.contains("hidden"));
  ok("clear resets personal title", t.el("agentPersonalTitle").textContent === "个人看板");
}
{
  const t2 = makeWorld(); t2.setToken("tok");
  t2.world.__authImpl = async () => { const e = new Error("f"); e.status = 403; throw e; };
  t2.run(`openAgentPersonalBoard("juan")`);
  await t2.run(`loadAgentStatusOps()`); await flush(); await flush();
  ok("403 closes personal board", t2.el("agentPersonalBoard").classList.contains("hidden"));
  ok("403 resets personal title", t2.el("agentPersonalTitle").textContent === "个人看板");
}

// 15. 回归#3：pending补读保留到允许执行，不提前消费
{
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  t.world.__authImpl = async () => { n++; return ROWS; };
  await t.run(`loadAgentStatusOps()`); await flush(); await flush(); // call 1 成功
  let rej;
  t.world.__authImpl = () => new Promise((_, r) => { n++; rej = r; });
  const p = t.run(`loadAgentStatusOps()`); // call 2 在途
  t.world.document.hidden = true;
  t.run(`agentOpsOnVisibilityChange()`); // 隐藏 → flag
  rej(Object.assign(new Error("x"), { status: 500 }));
  await p; await flush(); await flush(); // 500 → 退避60s
  t.world.document.hidden = false;
  t.run(`agentOpsOnVisibilityChange()`); await flush(); await flush(); // 返回 → 补读被退避抑制
  ok("still 2 calls during backoff", n === 2);
  ok("pending flag preserved, not consumed early", t.vars().agentOpsPendingRead === true);
  t.setVars({ agentOpsNextAttempt: Date.now() - 1 }); // 退避结束（lastSuccess 仍新鲜，验证 flag 通道）
  t.world.__authImpl = async () => { n++; return ROWS; };
  t.fireTimers(); await flush(); await flush(); // watchdog → pending补读执行
  ok("3rd call after backoff via pending flag", n === 3);
  ok("flag consumed on execution", t.vars().agentOpsPendingRead === false);
}

// 16. 回归#3漏支：初读成功→手动500→退避→无在途隐藏→返回登记pending→退避后watchdog补读
{
  const t = makeWorld(); t.setToken("tok"); let n = 0;
  t.world.__authImpl = async () => { n++; return ROWS; };
  await t.run(`loadAgentStatusOps()`); await flush(); await flush(); // call 1 成功
  t.world.__authImpl = async () => { n++; const e = new Error("x"); e.status = 500; throw e; };
  await t.run(`loadAgentStatusOps()`); await flush(); await flush(); // call 2 手动→500→60s退避
  ok("backoff active after 500", t.vars().agentOpsNextAttempt > Date.now());
  t.world.document.hidden = true;
  t.run(`agentOpsOnVisibilityChange()`); // 无在途隐藏
  ok("no pending from hidden-without-flight", t.vars().agentOpsPendingRead === false);
  t.world.document.hidden = false;
  t.run(`agentOpsOnVisibilityChange()`); await flush(); await flush(); // 返回 → 登记pending，尝试被退避抑制
  ok("still 2 calls during backoff", n === 2);
  ok("pending demand registered on return", t.vars().agentOpsPendingRead === true);
  t.setVars({ agentOpsNextAttempt: Date.now() - 1 }); // 退避到期（lastSuccess 仍新鲜，验证 pending 通道）
  t.world.__authImpl = async () => { n++; return ROWS; };
  t.fireTimers(); await flush(); await flush(); // watchdog → call 3
  ok("3rd call after backoff via pending demand", n === 3);
  ok("pending consumed on execution", t.vars().agentOpsPendingRead === false);
}

// 17. 回归（跨路径）：其他 ops API 401 → 共享清理路径立即全清看板 → 新登录不残留
{
  const t = makeWorld();
  // 真实 api() 的依赖桩：401 响应 + 不重试刷新
  t.world.URLSearchParams = URLSearchParams;
  t.world.fetch = async () => ({ status: 401, ok: false, json: async () => ({}) });
  t.world.refreshAccessTokenFromStoredSession = async () => false;
  let sessionCleared = 0, authStage = "";
  t.world.clearOperationsSessionStorage = () => { sessionCleared++; };
  t.world.setAuthStage = (s) => { authStage = s; };
  t.run(`var FN="https://example.invalid/fn";`);
  // 旧会话：看板有数据、个人板打开、timer 运行、pending 置位
  t.setToken("tok1");
  t.world.__authImpl = async () => ROWS;
  await t.run(`loadAgentStatusOps()`); await flush(); await flush();
  t.run(`openAgentPersonalBoard("bi")`);
  t.run(`agentOpsEnsureTimers()`);
  t.setVars({ agentOpsPendingRead: true });
  const genBefore = t.vars().agentOpsGeneration;
  ok("setup: list has rows", t.el("agentStatusOpsList").innerHTML.includes("<tr><td>"));
  ok("setup: personal open", !t.el("agentPersonalBoard").classList.contains("hidden"));
  ok("setup: timer running", t.timerCount() > 0);
  // 其他 ops API 401（非看板自身请求）
  let err = null;
  try { await t.run(`api("opsTestAction")`); } catch (e) { err = e; }
  await flush();
  ok("api 401 throws AUTH_REQUIRED", err && err.status === 401);
  ok("shared path ran", sessionCleared === 1 && authStage === "login");
  ok("cross-path: token cleared", t.run(`token`) === "");
  ok("cross-path: list cleared", t.el("agentStatusOpsList").innerHTML === "");
  ok("cross-path: personal closed", t.el("agentPersonalBoard").classList.contains("hidden"));
  ok("cross-path: personal title reset", t.el("agentPersonalTitle").textContent === "个人看板");
  ok("cross-path: pending cleared", t.vars().agentOpsPendingRead === false);
  ok("cross-path: timers cleared", t.timerCount() === 0);
  ok("cross-path: generation bumped", t.vars().agentOpsGeneration > genBefore);
  // 新会话登录读取：旧个人 title 不残留（看板自身读取不动个人面板）
  t.setToken("tok2");
  t.world.__authImpl = async () => ROWS;
  await t.run(`loadAgentStatusOps()`); await flush(); await flush();
  ok("new session: list fresh", t.el("agentStatusOpsList").innerHTML.includes("<tr><td>"));
  ok("new session: old personal title gone", t.el("agentPersonalTitle").textContent === "个人看板");
  ok("new session: personal stays closed", t.el("agentPersonalBoard").classList.contains("hidden"));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
