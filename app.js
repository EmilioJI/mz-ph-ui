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
let decisionKeyConfigured=false;
const $=id=>document.getElementById(id);
const CUSTOM_MODEL="__custom__";

const PROVIDERS={
  zhipuai:{
    default_style:"chat_completions",
    supported_styles:["chat_completions"],
    base_urls:{
      chat_completions:"https://open.bigmodel.cn/api/paas/v4/chat/completions"
    },
    default_model:"glm-4.7",
    default_thinking:"disabled",
    thinking_editable:true,
    models:[
      {id:"glm-4.7",label:"GLM-4.7 · 非思考默认"},
      {id:"glm-5.3-flash",label:"GLM-5.3-Flash"},
      {id:"glm-5.3",label:"GLM-5.3"},
      {id:"glm-5.2",label:"GLM-5.2"}
    ]
  },
  deepseek:{
    default_style:"chat_completions",
    supported_styles:["chat_completions","responses"],
    base_urls:{
      chat_completions:"https://api.deepseek.com/chat/completions",
      responses:"https://api.deepseek.com/responses"
    },
    default_model:"deepseek-flash",
    default_thinking:"disabled",
    thinking_editable:true,
    models:[
      {id:"deepseek-flash",label:"DeepSeek Flash · V4.1 Flash"},
      {id:"deepseek-v4-pro",label:"DeepSeek V4 Pro"}
    ]
  },
  openai:{
    default_style:"responses",
    supported_styles:["responses","chat_completions"],
    base_urls:{
      responses:"https://api.openai.com/v1/responses",
      chat_completions:"https://api.openai.com/v1/chat/completions"
    },
    default_model:"gpt-5.6-luna",
    default_thinking:"disabled",
    thinking_editable:true,
    models:[
      {id:"gpt-5.6-luna",label:"GPT-5.6 Luna · 成本优先"},
      {id:"gpt-5.6-terra",label:"GPT-5.6 Terra · 平衡"},
      {id:"gpt-5.6-sol",label:"GPT-5.6 Sol · 高能力"},
      {id:"gpt-5.6",label:"GPT-5.6 · 默认别名"}
    ]
  },
  openai_compatible:{
    default_style:"chat_completions",
    supported_styles:["chat_completions","responses"],
    base_urls:{},
    default_model:"",
    default_thinking:"provider_default",
    thinking_editable:false,
    models:[]
  }
};

const PRESETS={
  glm47:{
    provider:"zhipuai",
    api_style:"chat_completions",
    base_url:"https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model:"glm-4.7",
    thinking_mode:"disabled",
    timeout_ms:40000,
    max_repair_attempts:1
  },
  glm53flash:{
    provider:"zhipuai",
    api_style:"chat_completions",
    base_url:"https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model:"glm-5.3-flash",
    thinking_mode:"enabled",
    timeout_ms:60000,
    max_repair_attempts:1
  },
  deepseek:{
    provider:"deepseek",
    api_style:"chat_completions",
    base_url:"https://api.deepseek.com/chat/completions",
    model:"deepseek-flash",
    thinking_mode:"disabled",
    timeout_ms:40000,
    max_repair_attempts:1
  },
  custom:{
    provider:"openai_compatible",
    api_style:"chat_completions",
    base_url:"",
    model:"",
    thinking_mode:"provider_default",
    timeout_ms:40000,
    max_repair_attempts:1
  }
};

function providerConfig(){
  return PROVIDERS[$("provider").value]||PROVIDERS.openai_compatible;
}

function isGlm53Flash(model=selectedModel()){
  const value=String(model||"").trim().toLowerCase();
  return value==="glm-5.3-flash"||value==="glm-5.3-flashx";
}

function syncThinkingControl(preferredMode=null){
  const provider=$("provider").value;
  const config=providerConfig();
  const select=$("thinking_mode");
  const help=$("thinking_help");
  let mode=preferredMode||select.value||config.default_thinking||"disabled";

  if(provider==="zhipuai"&&isGlm53Flash()){
    mode="enabled";
    select.disabled=true;
    help.textContent="当前模型强制开启 Thinking，无法关闭。";
  }else if(!config.thinking_editable){
    mode="provider_default";
    select.disabled=true;
    help.textContent="该兼容 Provider 的思考参数不统一，交由供应商默认处理。";
  }else{
    select.disabled=false;
    if(!["disabled","enabled","provider_default"].includes(mode))mode=config.default_thinking||"disabled";
    help.textContent="默认关闭；可手动开启，或交由供应商默认处理。";
  }
  select.value=mode;
}

function selectedModel(){
  return $("model_select").value===CUSTOM_MODEL
    ?$("model_custom").value.trim()
    :$("model_select").value.trim();
}

function setModelValue(model){
  const wanted=(model||"").trim();
  const config=providerConfig();
  const known=config.models.some(item=>item.id===wanted);
  $("model_select").value=known?wanted:CUSTOM_MODEL;
  $("model_custom").value=known?"":wanted;
  $("model_custom").classList.toggle("hidden",known);
  if(!known)$("model_custom").focus({preventScroll:true});
}

function populateModelOptions(preferredModel=""){
  const select=$("model_select");
  const config=providerConfig();
  select.replaceChildren();
  config.models.forEach(item=>{
    const option=document.createElement("option");
    option.value=item.id;
    option.textContent=item.label;
    select.appendChild(option);
  });
  const custom=document.createElement("option");
  custom.value=CUSTOM_MODEL;
  custom.textContent="自定义模型…";
  select.appendChild(custom);

  const initial=(preferredModel||config.default_model||"").trim();
  setModelValue(initial);
}

function syncApiStyleAvailability(){
  const config=providerConfig();
  Array.from($("api_style").options).forEach(option=>{
    option.disabled=!config.supported_styles.includes(option.value);
  });
  if(!config.supported_styles.includes($("api_style").value)){
    $("api_style").value=config.default_style;
  }
}

function syncBaseUrl({force=false}={}){
  const config=providerConfig();
  const provider=$("provider").value;
  const style=$("api_style").value;
  const mapped=config.base_urls[style]||"";
  const editable=provider==="openai_compatible";
  $("base_url").readOnly=!editable;

  if(editable){
    if(force)$("base_url").value="";
    $("base_url").placeholder="https://your-provider.example/v1/chat/completions";
    return;
  }

  $("base_url").placeholder="";
  if(force||mapped)$("base_url").value=mapped;
}

function applyProviderDefaults(){
  const config=providerConfig();
  $("api_style").value=config.default_style;
  syncApiStyleAvailability();
  syncBaseUrl({force:true});
  populateModelOptions(config.default_model);
  syncThinkingControl(config.default_thinking);
  $("api_key").value="";
  refreshDraft();
}

function payload(){
  return{
    provider:$("provider").value,
    api_style:$("api_style").value,
    base_url:$("base_url").value.trim(),
    model:selectedModel(),
    thinking_mode:$("thinking_mode").value,
    api_key:$("api_key").value.trim(),
    timeout_ms:Number($("timeout_ms").value),
    max_repair_attempts:Number($("repairs").value),
    enabled:$("enabled").value==="true"
  };
}

function validatePayload(value){
  if(!value.base_url)throw new Error("请填写 Base URL");
  if(!/^https:\/\//i.test(value.base_url))throw new Error("Base URL 必须使用 https://");
  if(!value.model)throw new Error("请选择或填写模型 ID");
  return value;
}

function refreshDraft(){
  syncThinkingControl();
  const mode=$("thinking_mode").value;
  const typedKey=$("api_key").value.trim();
  $("key_state").value=typedKey
    ?"已输入新 Key（尚未保存）"
    :keyStates[$("provider").value]
      ?"已保存到 Vault（不回显）"
      :"尚未保存";
  $("policy_note").textContent=
    $("thinking_mode").disabled&&mode==="enabled"
      ?"当前模型强制开启 Thinking；这是模型约束，不是可选设置。"
      :mode==="disabled"
        ?"Thinking 已关闭：优先降低 reasoning token 与延迟。"
        :mode==="enabled"
          ?"Thinking 已开启：可能提高复杂任务质量，同时增加延迟与 token 消耗。"
          :"Thinking 使用供应商默认行为。";
}

function applyPreset(name){
  const p=PRESETS[name];
  if(!p)return;
  $("provider").value=p.provider;
  syncApiStyleAvailability();
  $("api_style").value=p.api_style;
  syncApiStyleAvailability();
  syncBaseUrl({force:true});
  $("base_url").value=p.base_url;
  populateModelOptions(p.model);
  syncThinkingControl(p.thinking_mode);
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

function setProviderTestBusy(busy,label=""){
  const conn=$("testConnBtn");
  const resp=$("testRespBtn");
  conn.disabled=busy;
  resp.disabled=busy;
  conn.textContent=busy&&label==="connection"?"测试连接中…":"测试连接";
  resp.textContent=busy&&label==="generation"?"测试响应中…":"测试响应";
  if(busy){
    const node=$("health");
    node.className="status";
    node.textContent=label==="generation"
      ?"正在调用当前模型并验证响应…"
      :"正在连接当前 Provider…";
    node.setAttribute("aria-busy","true");
  }else{
    $("health").removeAttribute("aria-busy");
  }
}

function showProviderTestResult(result){
  const node=$("health");
  const ok=result?.ok===true;
  node.className="status "+(ok?"ok":"bad");
  node.textContent=[
    "结果: "+(ok?"PASS":"FAIL"),
    "Provider: "+($("provider").value||"-"),
    "模型: "+(selectedModel()||"-"),
    "Thinking: "+(result?.thinking_mode||$("thinking_mode").value||"-"),
    "延迟: "+(result?.latency_ms??"-")+" ms",
    "HTTP: "+(result?.http_status??"-"),
    "返回: "+(result?.preview||"-"),
    "错误: "+(result?.error_code||"-"),
    "信息: "+(result?.message||"-")
  ].join("\n");
}

function decisionPayload(){
  return{
    base_url:$("jev_base_url").value.trim(),
    model:$("jev_model").value.trim(),
    api_key:$("jev_api_key").value.trim(),
    timeout_ms:Number($("jev_timeout_ms").value),
    enabled:$("jev_enabled").value==="true"
  };
}

function validateDecisionPayload(value){
  if(value.base_url!=="https://jev.bocha.cn/v1/systemone"){
    throw new Error("Jev Service URL 必须使用受控的 https://jev.bocha.cn/v1/systemone");
  }
  if(!value.model)throw new Error("请填写 Jev 模型 ID");
  if(!Number.isInteger(value.timeout_ms)||value.timeout_ms<3000||value.timeout_ms>60000){
    throw new Error("Jev Timeout 必须是 3000–60000 ms");
  }
  if(value.enabled&&!value.api_key&&!decisionKeyConfigured){
    throw new Error("开启 Jev 前需要先填写或保存 Bocha Jev API Key");
  }
  return value;
}

function refreshDecisionDraft(){
  const typedKey=$("jev_api_key").value.trim();
  const enabled=$("jev_enabled").value==="true";
  $("jev_key_state").value=typedKey
    ?"已输入新 Key（尚未保存）"
    :decisionKeyConfigured
      ?"已保存到 Vault（不回显）"
      :"尚未保存";
  $("jevBadge").textContent=enabled?"Jev ON · fail-open":"Jev OFF";
}

function showDecisionHealth(x){
  const node=$("jevHealth");
  const isResult=typeof x?.ok==="boolean";
  const ok=isResult?x.ok:x?.last_test_ok;
  node.className="status top-gap "+(ok===true?"ok":ok===false?"bad":"");
  if(isResult){
    node.textContent=[
      "结果: "+(x.ok?"PASS":"FAIL"),
      "模型: "+(x.model||"-"),
      "延迟: "+(x.latency_ms??"-")+" ms",
      "HTTP: "+(x.http_status??"-"),
      "故障策略: "+(x.failure_policy||"fail_open"),
      "回答: "+(x.answer?JSON.stringify(x.answer):"-"),
      "错误: "+(x.error_code||"-"),
      "信息: "+(x.message||"-")
    ].join("\n");
    return;
  }
  node.textContent=[
    "最后测试: "+(x?.last_test_at||"无"),
    "结果: "+(x?.last_test_ok==null?"未测试":x.last_test_ok?"PASS":"FAIL"),
    "延迟: "+(x?.last_test_latency_ms??"-")+" ms",
    "HTTP: "+(x?.last_test_http_status??"-"),
    "故障策略: fail_open",
    "错误: "+(x?.last_test_error_code||"-"),
    "信息: "+(x?.last_test_message||"-")
  ].join("\n");
}

async function loadDecisionConfig(){
  const value=await api("decision_config");
  const cfg=value.config||{};
  decisionKeyConfigured=cfg.api_key_configured===true;
  $("jev_base_url").value=cfg.base_url||"https://jev.bocha.cn/v1/systemone";
  $("jev_model").value=cfg.model||"bocha-jev-v1";
  $("jev_timeout_ms").value=Number(cfg.timeout_ms||15000);
  $("jev_enabled").value=String(cfg.enabled===true);
  $("jev_api_key").value="";
  $("jev_failure_policy").value="fail-open · Jev 失败不阻塞主规划";
  refreshDecisionDraft();
  showDecisionHealth(cfg);
}

async function saveDecision(){
  try{
    const value=validateDecisionPayload(decisionPayload());
    await api("decision_save","POST",value);
    $("jev_api_key").value="";
    await loadDecisionConfig();
    alert(value.enabled?"Jev 已保存并允许决策增强":"Jev 已保存并保持关闭");
  }catch(error){
    alert(error.message);
  }
}

async function testDecision(){
  try{
    const value=validateDecisionPayload(decisionPayload());
    const response=await api("decision_test","POST",value);
    showDecisionHealth(response.result||{});
    refreshDecisionDraft();
  }catch(error){
    alert(error.message);
  }
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

  $("provider").value=PROVIDERS[c.provider]?c.provider:"openai_compatible";
  $("api_style").value=c.api_style;
  syncApiStyleAvailability();
  if(c.api_style&&Array.from($("api_style").options).some(o=>o.value===c.api_style&&!o.disabled)){
    $("api_style").value=c.api_style;
  }
  $("base_url").value=c.base_url||"";
  syncBaseUrl({force:false});
  $("base_url").value=c.base_url||$("base_url").value;
  populateModelOptions(c.model||"");
  syncThinkingControl(c.thinking_mode||providerConfig().default_thinking);
  $("timeout_ms").value=c.timeout_ms;
  $("repairs").value=c.max_repair_attempts;
  $("enabled").value=String(c.enabled);
  $("api_key").value="";
  $("activeBadge").textContent=(c.provider||"-")+" / "+(c.model||"-");
  refreshDraft();
  showHealth(c);
  loadDecisionConfig().catch(error=>{
    $("jevHealth").className="status top-gap bad";
    $("jevHealth").textContent="Jev 配置暂不可用；主 Provider 不受影响。\n"+error.message;
  });
}

async function save(){
  try{
    const value=validatePayload(payload());
    await api("save","POST",value);
    $("api_key").value="";
    await loadConfig();
    alert("已保存并启用");
  }catch(error){
    alert(error.message);
  }
}

async function testProvider(mode){
  setProviderTestBusy(true,mode);
  try{
    const value=validatePayload(payload());
    const response=await api("test","POST",{...value,mode});
    showProviderTestResult(response.result||{});
  }catch(error){
    const node=$("health");
    node.className="status bad";
    node.textContent="测试失败："+error.message;
  }finally{
    setProviderTestBusy(false,mode);
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

$("provider").addEventListener("change",applyProviderDefaults);
$("api_style").addEventListener("change",()=>{
  syncBaseUrl({force:$("provider").value!=="openai_compatible"});
  refreshDraft();
});
$("model_select").addEventListener("change",()=>{
  const custom=$("model_select").value===CUSTOM_MODEL;
  $("model_custom").classList.toggle("hidden",!custom);
  if(custom)$("model_custom").focus();
  syncThinkingControl();
  refreshDraft();
});
$("model_custom").addEventListener("input",()=>{syncThinkingControl();refreshDraft();});
$("thinking_mode").addEventListener("change",refreshDraft);
$("api_key").addEventListener("input",refreshDraft);
$("base_url").addEventListener("input",refreshDraft);

$("jev_enabled").addEventListener("change",refreshDecisionDraft);
$("jev_api_key").addEventListener("input",refreshDecisionDraft);
$("jev_model").addEventListener("input",refreshDecisionDraft);

$("loginBtn").addEventListener("click",()=>signIn().catch(error=>alert(error.message)));
$("password").addEventListener("keydown",event=>{
  if(event.key==="Enter")signIn().catch(error=>alert(error.message));
});
$("saveBtn").addEventListener("click",save);
$("testConnBtn").addEventListener("click",()=>testProvider("connection"));
$("testRespBtn").addEventListener("click",()=>testProvider("generation"));
$("reloadBtn").addEventListener("click",()=>loadConfig().catch(error=>alert(error.message)));
$("jevSaveBtn").addEventListener("click",saveDecision);
$("jevTestBtn").addEventListener("click",testDecision);
$("jevReloadBtn").addEventListener("click",()=>loadDecisionConfig().catch(error=>alert(error.message)));
$("logoutBtn").addEventListener("click",logout);

if(token){
  loadConfig().catch(()=>logout());
}
