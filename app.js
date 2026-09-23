"use strict";

if (window.top !== window.self) {
  document.documentElement.innerHTML = "";
  throw new Error("Framed execution blocked");
}

const BASE="https://ibshmenzooxndneqwqht.supabase.co";
const PUB="sb_publishable_yqKuTHTSDSv427w71lJWbA_2DDk2_1v";
const FN=BASE+"/functions/v1/p2-ai-provider-admin";
let token=sessionStorage.getItem("mz_ai_admin_token")||"";
let keyStates={};
const $=id=>document.getElementById(id);

const PRESETS={
  glm47:{
    provider:"zhipuai",
    api_style:"chat_completions",
    base_url:"https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model:"glm-4.7",
    timeout_ms:40000,
    max_repair_attempts:1
  },
  glm53flash:{
    provider:"zhipuai",
    api_style:"chat_completions",
    base_url:"https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model:"glm-5.3-flash",
    timeout_ms:60000,
    max_repair_attempts:1
  },
  deepseek:{
    provider:"deepseek",
    api_style:"chat_completions",
    base_url:"https://api.deepseek.com/chat/completions",
    model:"deepseek-flash",
    timeout_ms:40000,
    max_repair_attempts:1
  },
  custom:{
    provider:"openai_compatible",
    api_style:"chat_completions",
    base_url:"https://",
    model:"",
    timeout_ms:40000,
    max_repair_attempts:1
  }
};

function payload(){
  return{
    provider:$("provider").value,
    api_style:$("api_style").value,
    base_url:$("base_url").value.trim(),
    model:$("model").value.trim(),
    api_key:$("api_key").value.trim(),
    timeout_ms:Number($("timeout_ms").value),
    max_repair_attempts:Number($("repairs").value),
    enabled:$("enabled").value==="true"
  };
}

function effectiveThinking(){
  const provider=$("provider").value;
  const model=$("model").value.trim().toLowerCase();
  if(provider==="zhipuai"&&(model==="glm-5.3-flash"||model==="glm-5.3-flashx"))return"enabled_required";
  if(provider==="zhipuai"||provider==="deepseek")return"disabled";
  return"provider_default";
}

function refreshDraft(){
  const mode=effectiveThinking();
  $("thinking_mode").value=mode;
  $("key_state").value=keyStates[$("provider").value]?"已配置（不回显）":"未配置";
  $("policy_note").textContent=
    mode==="enabled_required"
      ?"GLM-5.3-Flash 当前模型策略要求 Thinking；适合高能力模式，不适合作为省 reasoning token 的默认线路。"
      :mode==="disabled"
        ?"当前预设关闭 Thinking，适合结构化规划任务控制 token 与延迟。"
        :"Thinking 由目标 Provider 协议决定。";
}

function applyPreset(name){
  const p=PRESETS[name];
  if(!p)return;
  $("provider").value=p.provider;
  $("api_style").value=p.api_style;
  $("base_url").value=p.base_url;
  $("model").value=p.model;
  $("timeout_ms").value=p.timeout_ms;
  $("repairs").value=p.max_repair_attempts;
  $("enabled").value="true";
  $("api_key").value="";
  refreshDraft();
}

function showHealth(x){
  const node=$("health");
  node.className="status "+(x.last_test_ok===true?"ok":x.last_test_ok===false?"bad":"");
  node.textContent=[
    "最后测试: "+(x.last_test_at||"无"),
    "结果: "+(x.last_test_ok==null?"未测试":x.last_test_ok?"PASS":"FAIL"),
    "延迟: "+(x.last_test_latency_ms??"-")+" ms",
    "HTTP: "+(x.last_test_http_status??"-"),
    "错误: "+(x.last_test_error_code||"-"),
    "信息: "+(x.last_test_message||"-")
  ].join("\n");
}

function setAuthenticated(authenticated){
  $("workspaceHero")?.classList.toggle("hidden",authenticated);
  $("login").classList.toggle("hidden",authenticated);
  $("console").classList.toggle("hidden",!authenticated);
}

async function api(action,method="GET",body=null){
  const response=await fetch(FN+"?action="+encodeURIComponent(action),{
    method,
    headers:{
      Authorization:"Bearer "+token,
      "Content-Type":"application/json"
    },
    body:body?JSON.stringify(body):null
  });
  const value=await response.json();
  if(response.status===401||response.status===403){
    sessionStorage.removeItem("mz_ai_admin_token");
    token="";
    setAuthenticated(false);
    throw new Error("身份验证失败或会话已失效");
  }
  if(!response.ok)throw new Error(value.error||"请求失败");
  return value;
}

async function signIn(){
  const email=$("email").value.trim();
  const password=$("password").value;
  if(!email||!password){
    alert("请输入账号和密码");
    return;
  }
  const response=await fetch(BASE+"/auth/v1/token?grant_type=password",{
    method:"POST",
    headers:{apikey:PUB,"Content-Type":"application/json"},
    body:JSON.stringify({email,password})
  });
  const value=await response.json();
  $("password").value="";
  if(!response.ok||!value.access_token){
    alert("身份验证失败");
    return;
  }
  token=value.access_token;
  sessionStorage.setItem("mz_ai_admin_token",token);
  await loadConfig();
}

async function loadConfig(){
  const value=await api("config");
  const c=value.config;
  keyStates=c.api_key_states||{};
  setAuthenticated(true);
  $("provider").value=c.provider;
  $("api_style").value=c.api_style;
  $("base_url").value=c.base_url;
  $("model").value=c.model;
  $("timeout_ms").value=c.timeout_ms;
  $("repairs").value=c.max_repair_attempts;
  $("enabled").value=String(c.enabled);
  $("api_key").value="";
  $("activeBadge").textContent=(c.provider||"-")+" / "+(c.model||"-");
  refreshDraft();
  showHealth(c);
}

async function save(){
  try{
    await api("save","POST",payload());
    $("api_key").value="";
    await loadConfig();
    alert("已保存并启用");
  }catch(error){
    $("api_key").value="";
    alert(error.message);
  }
}

async function testProvider(mode){
  try{
    const value=await api("test","POST",{...payload(),mode});
    $("api_key").value="";
    const node=$("health");
    node.className="status "+(value.result.ok?"ok":"bad");
    node.textContent=JSON.stringify(value.result,null,2);
  }catch(error){
    $("api_key").value="";
    alert(error.message);
  }
}

function logout(){
  sessionStorage.removeItem("mz_ai_admin_token");
  token="";
  $("api_key").value="";
  setAuthenticated(false);
}

document.querySelectorAll("[data-preset]").forEach(
  button=>button.addEventListener("click",()=>applyPreset(button.dataset.preset))
);
["provider","model","base_url"].forEach(
  id=>$(id).addEventListener("input",refreshDraft)
);
$("loginBtn").addEventListener("click",()=>signIn().catch(error=>alert(error.message)));
$("saveBtn").addEventListener("click",save);
$("testConnBtn").addEventListener("click",()=>testProvider("connection"));
$("testRespBtn").addEventListener("click",()=>testProvider("generation"));
$("reloadBtn").addEventListener("click",()=>loadConfig().catch(error=>alert(error.message)));
$("logoutBtn").addEventListener("click",logout);

if(token){
  loadConfig().catch(()=>logout());
}