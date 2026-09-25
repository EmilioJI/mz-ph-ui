"use strict";

if (window.top !== window.self) {
  document.documentElement.innerHTML = "";
  throw new Error("Framed execution blocked");
}
if (window.opener !== null) {
  document.documentElement.innerHTML = "";
  throw new Error("Opened-window execution blocked");
}
window.name = "";

const BASE="https://ibshmenzooxndneqwqht.supabase.co";
const PUB="sb_publishable_yqKuTHTSDSv427w71lJWbA_2DDk2_1v";
const FN=BASE+"/functions/v1/p2-ai-provider-admin";
let token="";
let keyStates={};
let decisionKeyConfigured=false;
let opsAuthStatus=null;
let mfaFactorId="";
let mfaMode="";
let passwordSetupMode="";
let backupTotpFactorId="";
let opsMemberships=[];
let selectedProjectKey=sessionStorage.getItem("mz_ops_project")||"mengzheng";
let projectRuntimeSnapshot=null;
let runtimeConsumerRawToken="";
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

function setAuthStage(stage){
  const login=stage==="login";
  const passwordSetup=stage==="password_setup";
  const mfa=stage==="mfa";
  const consoleOpen=stage==="console";
  $("workspaceHero")?.classList.toggle("hidden",!(login||passwordSetup));
  $("login").classList.toggle("hidden",!login);
  $("passwordSetup").classList.toggle("hidden",!passwordSetup);
  $("mfa").classList.toggle("hidden",!mfa);
  $("console").classList.toggle("hidden",!consoleOpen);
}

function consumePasswordSetupCallback(){
  const raw=window.location.hash||"";
  if(!raw.startsWith("#"))return false;

  const params=new URLSearchParams(raw.slice(1));
  const type=String(params.get("type")||"").toLowerCase();
  const accessToken=params.get("access_token")||"";
  if(!accessToken||!(type==="invite"||type==="recovery"))return false;

  passwordSetupMode=type;
  token=accessToken;
  history.replaceState(null,"",window.location.pathname+window.location.search);
  return true;
}

async function preparePasswordSetup(){
  setAuthStage("password_setup");
  $("passwordSetupStatus").className="status top-gap";
  $("passwordSetupStatus").textContent="正在验证邀请会话…";
  $("newPassword").value="";
  $("confirmPassword").value="";

  try{
    const user=await authApi("/auth/v1/user");
    $("passwordSetupEmail").value=String(user?.email||"");
    $("passwordSetupIntro").textContent=passwordSetupMode==="recovery"
      ?"安全会话已验证。请设置新的管理员登录密码。"
      :"邀请已验证。请设置这个独立管理员账号的登录密码。";
    $("passwordSetupStatus").className="status top-gap ok";
    $("passwordSetupStatus").textContent="邀请会话有效。密码不会保存在 Operations Hub。";
    $("newPassword").focus();
  }catch(error){
    token="";
    passwordSetupMode="";
    history.replaceState(null,"",window.location.pathname+window.location.search);
    setAuthStage("login");
    alert("邀请会话已失效或无法验证，请重新发送邀请后再试。");
  }
}

async function completePasswordSetup(){
  const first=$("newPassword").value;
  const second=$("confirmPassword").value;
  if(first.length<12){
    throw new Error("新密码至少需要 12 个字符。");
  }
  if(!/[A-Za-z]/.test(first)||!/\d/.test(first)){
    throw new Error("新密码至少需要同时包含字母和数字。");
  }
  if(first!==second){
    throw new Error("两次输入的密码不一致。");
  }

  const button=$("passwordSetupBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="正在设置…";
  $("passwordSetupStatus").className="status top-gap";
  $("passwordSetupStatus").textContent="正在安全提交新密码…";

  try{
    await authApi("/auth/v1/user","PUT",{password:first});
    $("newPassword").value="";
    $("confirmPassword").value="";
    token="";
    passwordSetupMode="";
      history.replaceState(null,"",window.location.pathname+window.location.search);
    setAuthStage("login");
    $("email").value=$("passwordSetupEmail").value||"";
    $("password").value="";
    alert("密码已设置成功。下一步需要启用 Operations Hub Owner 权限，再用这个账号登录并绑定 Google Authenticator。");
    $("password").focus();
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

function setAuthenticated(authenticated){
  setAuthStage(authenticated?"console":"login");
}

async function authApi(path,method="GET",body=null){
  const response=await fetch(BASE+path,{
    method,
    headers:{
      apikey:PUB,
      Authorization:"Bearer "+token,
      "Content-Type":"application/json",
      "Accept":"application/json"
    },
    body:body?JSON.stringify(body):null
  });
  let value={};
  try{value=await response.json()}catch(_e){}
  if(!response.ok){
    const error=new Error(value?.msg||value?.message||value?.error_description||value?.error||"认证请求失败");
    error.status=response.status;
    throw error;
  }
  return value;
}

function qrDataUri(raw){
  const value=String(raw||"").trim();
  if(!value)return "";
  if(value.startsWith("data:image/"))return value;
  return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(value);
}

function membershipFor(projectKey=selectedProjectKey){
  return opsMemberships.find(item=>item?.project_key===projectKey)||null;
}

function capabilitySummary(capabilities){
  const value=capabilities&&typeof capabilities==="object"?capabilities:{};
  const labels={
    provider_control:"Provider",
    jev_decision:"Jev",
    security:"Security",
    audit:"Audit",
    cloud_runtime:"Cloud",
    ci:"CI",
    release_health:"Release",
    device_provider_settings:"Device config"
  };
  return Object.entries(value)
    .map(([key,status])=>(labels[key]||key)+"="+String(status))
    .join(" · ")||"基础接入";
}

function projectIntegrationMessage(project){
  const key=project?.project_key||"";
  if(key==="mengzheng"){
    return "完整运维适配已启用：主模型 Provider、Jev 决策增强、安全设置与审计均可在本 Hub 操作。";
  }
  if(key==="xiaoshutong"){
    return "基础接入 + staged 配置仓已完成。已映射 core-api 的 XST_* 模型/OCR/ASR/TTS 合同，Key 使用小书童独立 Vault 命名空间；当前尚未接管运行时。";
  }
  if(key==="fuzipartner"){
    return "基础接入已完成。当前以 Android 本地能力为主，没有独立云端 Provider 控制面；下一层接入 CI、版本与发布健康状态。";
  }
  if(key==="jev-chat-jarvis"){
    return "基础接入 + staged 配置仓已完成。Judge / Reply / Vision 已独立建模并使用 JEV 专属 Vault；Android 当前仍读取设备端设置，尚未切换到云端接管。";
  }
  return "项目已注册到统一认证、RBAC 与审计体系；项目专属运维适配待接入。";
}

function runtimeField(spec,value,secretStates){
  const wrap=document.createElement("div");
  if(spec.full)wrap.classList.add("full");

  const label=document.createElement("label");
  const id="runtime_"+spec.key;
  label.htmlFor=id;
  label.textContent=spec.label;
  wrap.appendChild(label);

  let input;
  if(Array.isArray(spec.options)){
    input=document.createElement("select");
    for(const optionSpec of spec.options){
      const option=document.createElement("option");
      const tuple=Array.isArray(optionSpec)?optionSpec:[optionSpec,optionSpec];
      option.value=String(tuple[0]);
      option.textContent=String(tuple[1]);
      input.appendChild(option);
    }
  }else{
    input=document.createElement("input");
    input.type=spec.secret?"password":(spec.type||"text");
    if(spec.secret)input.autocomplete="new-password";
    if(spec.type==="number"){
      if(spec.min!==undefined)input.min=String(spec.min);
      if(spec.max!==undefined)input.max=String(spec.max);
      if(spec.step!==undefined)input.step=String(spec.step);
    }
  }
  input.id=id;

  if(spec.secret){
    input.dataset.secretSlot=spec.key;
    const configured=secretStates?.[spec.key]===true;
    input.placeholder=configured
      ?"已保存到独立 Vault（留空保持）"
      :"尚未保存 Key";
  }else{
    input.dataset.runtimeKey=spec.key;
    input.dataset.valueType=spec.valueType||"string";
    const raw=value?.[spec.key];
    if(spec.valueType==="nullable_bool"){
      input.value=raw===true?"true":raw===false?"false":"";
    }else if(raw!==undefined&&raw!==null){
      input.value=String(raw);
    }else if(spec.defaultValue!==undefined){
      input.value=String(spec.defaultValue);
    }
  }
  wrap.appendChild(input);

  if(spec.note){
    const note=document.createElement("p");
    note.className="field-note";
    note.textContent=spec.note;
    wrap.appendChild(note);
  }
  return wrap;
}

function xiaoshutongRuntimeSpecs(){
  return [
    {key:"model_provider",label:"文本模型 Provider",options:[
      ["FAKE","FAKE · 不调用真实模型"],
      ["OPENAI_COMPATIBLE","OpenAI-compatible"],
      ["ZHIPU_GLM52_TEXT_ONLY","Zhipu GLM-5.2 text-only"]
    ]},
    {key:"model_runtime_profile",label:"模型运行档",options:[
      ["ZHIPU_GLM47","ZHIPU_GLM47"],
      ["DEEPSEEK_FLASH","DEEPSEEK_FLASH"]
    ]},
    {key:"model_base_url",label:"模型 Base URL",full:true,note:"保持与小书童 core-api 当前 XST_MODEL_BASE_URL 合同一致。"},
    {key:"model_name",label:"模型 ID"},
    {key:"model_api_key",label:"模型 API Key",secret:true},
    {key:"model_timeout_seconds",label:"模型超时（秒）",type:"number",min:1,max:120,step:1,valueType:"number"},
    {key:"model_max_tokens",label:"Max Tokens",type:"number",min:1,max:8192,step:1,valueType:"integer"},
    {key:"model_thinking_enabled",label:"Thinking",options:[
      ["","未指定 · 交由当前运行档"],
      ["false","关闭"],
      ["true","开启"]
    ],valueType:"nullable_bool"},

    {key:"homework_ocr_provider",label:"作业 OCR",options:[
      ["FAKE","FAKE"],
      ["HTTP_JSON","HTTP_JSON"]
    ]},
    {key:"homework_ocr_base_url",label:"OCR Base URL"},
    {key:"homework_ocr_api_key",label:"OCR API Key",secret:true},

    {key:"homework_multimodal_provider",label:"作业多模态",options:[
      ["DISABLED","DISABLED"],
      ["OPENAI_COMPATIBLE","OPENAI_COMPATIBLE"]
    ]},
    {key:"homework_multimodal_endpoint",label:"多模态 Endpoint"},
    {key:"homework_multimodal_model",label:"多模态模型"},
    {key:"homework_multimodal_api_key",label:"多模态 API Key",secret:true},

    {key:"asr_provider",label:"ASR Provider",options:[
      ["FAKE","FAKE"],
      ["HTTP","HTTP"],
      ["LOCAL_FUNASR","LOCAL_FUNASR"]
    ]},
    {key:"asr_base_url",label:"ASR Base URL"},
    {key:"asr_model",label:"ASR 模型"},
    {key:"asr_api_key",label:"ASR API Key",secret:true},

    {key:"tts_provider",label:"TTS Provider",options:[
      ["FAKE","FAKE"],
      ["HTTP","HTTP"],
      ["LOCAL_HTTP","LOCAL_HTTP"],
      ["LOCAL_QWEN3_TTS","LOCAL_QWEN3_TTS"]
    ]},
    {key:"tts_base_url",label:"TTS Base URL"},
    {key:"tts_model",label:"TTS 模型"},
    {key:"tts_voice",label:"TTS Voice"},
    {key:"tts_api_key",label:"TTS API Key",secret:true}
  ];
}

function jevRuntimeSpecs(){
  return [
    {key:"judge_provider",label:"Judge Provider",options:[
      ["openrouter","OpenRouter"],
      ["typesafe","TypeSafe / Jev"],
      ["custom","Custom"]
    ]},
    {key:"judge_base_url",label:"Judge Base URL"},
    {key:"judge_model",label:"Judge 模型"},
    {key:"judge_api_key",label:"Judge API Key",secret:true},

    {key:"reply_base_url",label:"Reply Base URL"},
    {key:"reply_model",label:"Reply 模型"},
    {key:"reply_api_key",label:"Reply API Key",secret:true,note:"留空保持独立 Vault 中已保存的 Reply Key。"},

    {key:"vision_base_url",label:"Vision Base URL"},
    {key:"vision_model",label:"Vision 模型"},
    {key:"vision_api_key",label:"Vision API Key",secret:true,note:"DeepSeek 官方当前不提供 JEV 这里所需的视觉路由。"}
  ];
}

function runtimeSpecsFor(projectKey){
  if(projectKey==="xiaoshutong")return xiaoshutongRuntimeSpecs();
  if(projectKey==="jev-chat-jarvis")return jevRuntimeSpecs();
  return [];
}

function runtimeDescription(projectKey){
  if(projectKey==="xiaoshutong"){
    return "小书童独立运行时草稿。字段映射现有 core-api 的 XST_* Provider / OCR / ASR / TTS 合同。";
  }
  if(projectKey==="jev-chat-jarvis"){
    return "JEV 独立运行时草稿。字段映射当前 Android Judge / Reply / Vision 三路配置。";
  }
  return "项目专属配置。";
}

function runtimeGroupKey(projectKey,spec){
  if(projectKey==="xiaoshutong"){
    if(spec.key.startsWith("model_"))return "model";
    if(spec.key.startsWith("homework_"))return "homework";
    if(spec.key.startsWith("asr_")||spec.key.startsWith("tts_"))return "speech";
  }
  if(projectKey==="jev-chat-jarvis"){
    if(spec.key.startsWith("judge_"))return "judge";
    if(spec.key.startsWith("reply_"))return "reply";
    if(spec.key.startsWith("vision_"))return "vision";
  }
  return "general";
}

function runtimeGroupMeta(projectKey,groupKey){
  const groups={
    xiaoshutong:{
      model:["文本模型","决定小书童普通对话与结构化理解所使用的受控模型档案。"],
      homework:["作业理解","OCR 与多模态作业理解独立配置，不与普通对话模型密钥混用。"],
      speech:["语音","ASR / TTS 可以保持本地低时延，也可以在未来切换到受控云 Provider。"]
    },
    "jev-chat-jarvis":{
      judge:["Judge","结构化判断模型。"],
      reply:["Reply","自然语言回答模型。"],
      vision:["Vision","视觉理解模型。"]
    }
  };
  const value=groups[projectKey]?.[groupKey]||["项目配置","项目专属运行时字段。"];
  return {title:value[0],description:value[1]};
}

const XIAOSHUTONG_MODEL_PROFILES=Object.freeze({
  ZHIPU_GLM47:Object.freeze({
    model_provider:"OPENAI_COMPATIBLE",
    model_runtime_profile:"ZHIPU_GLM47",
    model_base_url:"https://open.bigmodel.cn/api/paas/v4",
    model_name:"glm-4.7",
    model_thinking_enabled:false,
    minimum_max_tokens:1
  }),
  ZHIPU_GLM53_FLASH:Object.freeze({
    model_provider:"OPENAI_COMPATIBLE",
    model_runtime_profile:"ZHIPU_GLM53_FLASH",
    model_base_url:"https://open.bigmodel.cn/api/paas/v4",
    model_name:"glm-5.3-flash",
    model_thinking_enabled:true,
    minimum_max_tokens:512
  }),
  DEEPSEEK_FLASH:Object.freeze({
    model_provider:"OPENAI_COMPATIBLE",
    model_runtime_profile:"DEEPSEEK_FLASH",
    model_base_url:"https://api.deepseek.com",
    model_name:"deepseek-flash",
    model_thinking_enabled:false,
    minimum_max_tokens:1
  })
});

function normalizeRuntimeUrl(value){
  return String(value||"").trim().replace(/\/+$/,"");
}

function validateXiaoshutongRuntimeDraft(config){
  const timeout=Number(config.model_timeout_seconds);
  const maxTokens=Number(config.model_max_tokens);
  if(!Number.isFinite(timeout)||timeout<1||timeout>120){
    throw new Error("模型超时必须为 1–120 秒");
  }
  if(!Number.isInteger(maxTokens)||maxTokens<1||maxTokens>8192){
    throw new Error("Max Tokens 必须为 1–8192 的整数");
  }

  if(config.model_provider==="OPENAI_COMPATIBLE"){
    const rule=XIAOSHUTONG_MODEL_PROFILES[String(config.model_runtime_profile||"")];
    if(!rule){
      throw new Error("OpenAI-compatible 真模型必须选择受控运行档");
    }
    if(
      normalizeRuntimeUrl(config.model_base_url)!==normalizeRuntimeUrl(rule.model_base_url)
      ||String(config.model_name||"").trim()!==rule.model_name
      ||config.model_thinking_enabled!==rule.model_thinking_enabled
    ){
      throw new Error(
        "模型运行档与 Base URL / Model / Thinking 不一致，请重新选择受控预设"
      );
    }
    if(maxTokens<rule.minimum_max_tokens){
      throw new Error(
        "当前模型运行档至少需要 "+rule.minimum_max_tokens+" Max Tokens"
      );
    }
  }
  return config;
}

function validateProjectRuntimeDraft(projectKey,draft){
  if(projectKey==="xiaoshutong"){
    validateXiaoshutongRuntimeDraft(draft.config);
  }
  return draft;
}

function applyXiaoshutongModelPreset(profileId){
  const preset=XIAOSHUTONG_MODEL_PROFILES[profileId];
  if(!preset)return;
  for(const [key,value] of Object.entries(preset)){
    const input=document.querySelector(
      '#runtimeConfigFields [data-runtime-key="'+key+'"]'
    );
    if(input)input.value=String(value);
  }
  const maxTokensInput=document.querySelector(
    '#runtimeConfigFields [data-runtime-key="model_max_tokens"]'
  );
  if(
    maxTokensInput
    &&Number(maxTokensInput.value)<preset.minimum_max_tokens
  ){
    maxTokensInput.value=String(preset.minimum_max_tokens);
  }
  $("runtimeConfigStatus").className="status top-gap";
  $("runtimeConfigStatus").textContent=[
    "已载入小书童受控模型预设："+profileId,
    "当前只修改浏览器草稿，尚未保存。",
    "API Key 未读取、未覆盖；留空仍保持 Vault 中已保存的 Key。"
  ].join("\n");
}

function renderRuntimePresetPanel(projectKey){
  const panel=$("runtimePresetPanel");
  const bar=$("runtimePresetBar");
  bar.replaceChildren();
  if(projectKey!=="xiaoshutong"){
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  const presets=[
    ["ZHIPU_GLM47","GLM-4.7","现有受控保底"],
    ["ZHIPU_GLM53_FLASH","GLM-5.3-Flash","智谱新一代 Flash · Thinking 必开"],
    ["DEEPSEEK_FLASH","DeepSeek Flash","低时延候选"]
  ];
  for(const [id,title,summary] of presets){
    const button=document.createElement("button");
    button.type="button";
    button.className="preset";
    button.dataset.runtimePreset=id;
    const strong=document.createElement("strong");
    strong.textContent=title;
    const span=document.createElement("span");
    span.textContent=summary;
    button.append(strong,span);
    button.addEventListener("click",()=>applyXiaoshutongModelPreset(id));
    bar.appendChild(button);
  }
}

function renderRuntimeConfig(value){
  projectRuntimeSnapshot=value||{};
  const card=$("projectRuntimeConfig");
  const specs=runtimeSpecsFor(selectedProjectKey);
  if(!specs.length){
    card.classList.add("hidden");
    $("runtimeConfigFields").replaceChildren();
    renderRuntimePresetPanel("");
    projectRuntimeSnapshot=null;
    return;
  }

  card.classList.remove("hidden");
  $("runtimeConfigDescription").textContent=runtimeDescription(selectedProjectKey);
  const status=String(value?.runtime_adapter_status||"not_connected");
  $("runtimeAdapterBadge").textContent="Adapter · "+status;
  $("runtimeConfigBoundary").textContent=value?.enabled===true
    ?"运行时接管已启用。"
    :"当前仅保存 staged 配置，不接管运行时；项目仍使用自身现有配置来源。";

  renderRuntimePresetPanel(selectedProjectKey);
  const root=$("runtimeConfigFields");
  root.replaceChildren();
  const config=value?.config&&typeof value.config==="object"?value.config:{};
  const secretStates=value?.secret_states&&typeof value.secret_states==="object"
    ?value.secret_states:{};
  const grouped=new Map();
  for(const spec of specs){
    const groupKey=runtimeGroupKey(selectedProjectKey,spec);
    if(!grouped.has(groupKey))grouped.set(groupKey,[]);
    grouped.get(groupKey).push(spec);
  }
  for(const [groupKey,groupSpecs] of grouped.entries()){
    const group=document.createElement("section");
    group.className="runtime-config-group";
    group.dataset.runtimeGroup=groupKey;
    const meta=runtimeGroupMeta(selectedProjectKey,groupKey);

    const heading=document.createElement("div");
    heading.className="runtime-group-heading";
    const title=document.createElement("h3");
    title.textContent=meta.title;
    const description=document.createElement("p");
    description.className="muted";
    description.textContent=meta.description;
    heading.append(title,description);

    const fields=document.createElement("div");
    fields.className="grid";
    for(const spec of groupSpecs){
      fields.appendChild(runtimeField(spec,config,secretStates));
    }
    group.append(heading,fields);
    root.appendChild(group);
  }

  const configuredSecrets=Object.values(secretStates).filter(Boolean).length;
  const project=membershipFor(selectedProjectKey);
  const providerControl=String(project?.capabilities?.provider_control||"-");
  const runtimeEvidence=String(project?.status_snapshot?.ops_runtime_adapter||"-");
  $("runtimeConfigStatus").className="status top-gap";
  $("runtimeConfigStatus").textContent=[
    "项目: "+selectedProjectKey,
    "Provider Control: "+providerControl,
    "Adapter: "+status,
    "项目证据: "+runtimeEvidence,
    "接管运行时: "+(value?.enabled===true?"YES":"NO"),
    "配置修订: "+(value?.revision??"-"),
    "已保存独立密钥: "+configuredSecrets
  ].join("\n");
  $("runtimeSaveBtn").textContent=value?.enabled===true
    ?"保存运行时配置"
    :"保存草稿配置（不接管运行时）";
}

function collectRuntimeConfig(){
  const config={};
  document.querySelectorAll("#runtimeConfigFields [data-runtime-key]").forEach(input=>{
    const key=input.dataset.runtimeKey;
    const type=input.dataset.valueType||"string";
    if(type==="integer")config[key]=Number.parseInt(input.value,10);
    else if(type==="number")config[key]=Number(input.value);
    else if(type==="nullable_bool")config[key]=input.value===""?null:input.value==="true";
    else config[key]=input.value.trim();
  });
  const secrets={};
  document.querySelectorAll("#runtimeConfigFields [data-secret-slot]").forEach(input=>{
    const value=input.value.trim();
    if(value)secrets[input.dataset.secretSlot]=value;
  });
  return {config,secrets};
}

function base64Url(bytes){
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}

function clearRuntimeConsumerToken(){
  runtimeConsumerRawToken="";
  $("runtimeConsumerToken").value="";
  $("runtimeConsumerTokenWrap").classList.add("hidden");
}

function renderRuntimeConsumerStatus(status){
  const panel=$("runtimeConsumerPanel");
  if(selectedProjectKey!=="xiaoshutong"){
    panel.classList.add("hidden");
    clearRuntimeConsumerToken();
    return;
  }
  panel.classList.remove("hidden");
  const configured=status?.token_configured===true;
  const enabled=status?.enabled===true;
  $("runtimeConsumerBadge").textContent=enabled
    ?"Consumer · ENABLED"
    :configured
      ?"Consumer · 已配置 / 禁用"
      :"Consumer · 未配置";
  $("runtimeConsumerStatus").className="status top-gap "+(enabled?"bad":"");
  $("runtimeConsumerStatus").textContent=[
    "Token digest: "+(configured?"CONFIGURED":"NOT_CONFIGURED"),
    "Consumer enabled: "+(enabled?"YES":"NO"),
    "最近轮换: "+(status?.rotated_at||"-"),
    "最近使用: "+(status?.last_used_at||"-"),
    enabled
      ?"警告：consumer 已启用；应同时确认 runtime adapter 是否经过单独批准。"
      :"安全状态：当前 token 无法调用 runtime endpoint。"
  ].join("\n");
}

async function loadRuntimeConsumerStatus(){
  if(selectedProjectKey!=="xiaoshutong"){
    renderRuntimeConsumerStatus(null);
    return;
  }
  const response=await api(
    "runtime_consumer_status","GET",null,{project:selectedProjectKey}
  );
  renderRuntimeConsumerStatus(response.status||{});
}

async function rotateRuntimeConsumerToken(){
  if(selectedProjectKey!=="xiaoshutong")return;
  const button=$("runtimeConsumerRotateBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="生成中…";
  clearRuntimeConsumerToken();
  try{
    const random=new Uint8Array(32);
    crypto.getRandomValues(random);
    const rawToken="xst_ops_"+base64Url(random);
    const digest=await sha256Hex(rawToken);

    const response=await api("runtime_consumer_rotate","POST",{
      token_sha256:digest
    },{project:selectedProjectKey});

    runtimeConsumerRawToken=rawToken;
    $("runtimeConsumerToken").value=rawToken;
    $("runtimeConsumerTokenWrap").classList.remove("hidden");
    renderRuntimeConsumerStatus(response.status||{});
    $("runtimeConsumerStatus").className="status top-gap ok";
    $("runtimeConsumerStatus").textContent+=
      "\n新 Token 只在当前页面内存中存在；后台仅保存 SHA-256，consumer 仍保持禁用。";
  }catch(error){
    $("runtimeConsumerStatus").className="status top-gap bad";
    $("runtimeConsumerStatus").textContent="Token 轮换失败："+error.message;
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function loadProjectRuntimeConfig(){
  const specs=runtimeSpecsFor(selectedProjectKey);
  if(!specs.length){
    renderRuntimeConfig(null);
    return;
  }
  $("runtimeConfigStatus").className="status top-gap";
  $("runtimeConfigStatus").textContent="正在加载项目独立配置…";
  const value=await api("runtime_config","GET",null,{project:selectedProjectKey});
  renderRuntimeConfig(value.config||{});
}

async function saveProjectRuntimeConfig(){
  if(!runtimeSpecsFor(selectedProjectKey).length)return;
  const button=$("runtimeSaveBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="保存中…";
  try{
    const draft=validateProjectRuntimeDraft(
      selectedProjectKey,
      collectRuntimeConfig()
    );
    const response=await api("runtime_save","POST",{
      config:draft.config,
      secrets:draft.secrets,
      enabled:projectRuntimeSnapshot?.enabled===true
    },{project:selectedProjectKey});
    renderRuntimeConfig(response.config||{});
    $("runtimeConfigStatus").className="status top-gap ok";
    $("runtimeConfigStatus").textContent=[
      "草稿保存成功",
      "Adapter: "+String(response.config?.runtime_adapter_status||"-"),
      "接管运行时: "+(response.config?.enabled===true?"YES":"NO"),
      "配置修订: "+String(response.config?.revision??"-"),
      "新输入 Key 已清空；已保存 Key 不回显"
    ].join("\n");
  }catch(error){
    $("runtimeConfigStatus").className="status top-gap bad";
    $("runtimeConfigStatus").textContent="保存失败："+error.message;
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

function renderProjectSelection(){
  const project=membershipFor();
  if(!project)return;

  $("roleBadge").textContent="角色 · "+String(project.role||"-");
  $("projectRepo").value=String(project.repository_full_name||"-");
  $("projectBranch").value=String(project.default_branch||"-");
  $("projectType").value=String(project.project_type||"-");
  $("projectCapabilities").value=capabilitySummary(project.capabilities);
  $("projectIntegrationNote").textContent=projectIntegrationMessage(project);

  const snapshot=project.status_snapshot&&typeof project.status_snapshot==="object"
    ?project.status_snapshot:{};
  const snapshotEntries=Object.entries(snapshot);
  $("projectStatusSnapshot").textContent=snapshotEntries.length
    ?snapshotEntries.map(([key,value])=>key+": "+String(value)).join("\n")
    :"项目状态快照：尚未提供";
  $("projectStatusSource").textContent=project.status_source
    ?("证据来源："+String(project.status_source)
      +(project.status_updated_at?" · "+new Date(project.status_updated_at).toLocaleString():""))
    :"";

  const isMengzheng=selectedProjectKey==="mengzheng";
  for(const id of ["mengzhengModelPresets","mengzhengProviderConfig","mengzhengJevConfig"]){
    $(id).classList.toggle("hidden",!isMengzheng);
  }
}

function applyOpsStatus(status){
  opsAuthStatus=status||{};
  opsMemberships=Array.isArray(status?.memberships)?status.memberships:[];
  if(!opsMemberships.length)return;

  const select=$("projectSelect");
  select.replaceChildren();
  for(const project of opsMemberships){
    const option=document.createElement("option");
    option.value=String(project.project_key||"");
    option.textContent=String(project.display_name||project.project_key||"项目");
    select.appendChild(option);
  }

  const saved=sessionStorage.getItem("mz_ops_project")||selectedProjectKey;
  selectedProjectKey=opsMemberships.some(p=>p?.project_key===saved)
    ?saved
    :opsMemberships.some(p=>p?.project_key==="mengzheng")
      ?"mengzheng"
      :String(opsMemberships[0].project_key||"");
  select.value=selectedProjectKey;
  select.disabled=opsMemberships.length<=1;
  sessionStorage.setItem("mz_ops_project",selectedProjectKey);

  $("mfaSessionState").value=status?.aal==="aal2"
    ?"aal2 · MFA 已验证"
    :"aal1 · 需要二次验证";
  renderProjectSelection();
}

async function api(action,method="GET",body=null,query={}){
  const params=new URLSearchParams({action:String(action||"")});
  for(const [key,value] of Object.entries(query||{})){
    if(value!==undefined&&value!==null&&String(value)!=="")params.set(key,String(value));
  }
  const response=await fetch(FN+"?"+params.toString(),{
    method,
    headers:{
      Authorization:"Bearer "+token,
      "Content-Type":"application/json"
    },
    body:body?JSON.stringify(body):null
  });
  let value={};
  try{value=await response.json()}catch(_e){}
  if(response.status===401){
      token="";
    setAuthStage("login");
    const error=new Error("身份验证失败或会话已失效");
    error.code="AUTH_REQUIRED";
    throw error;
  }
  if(!response.ok){
    const error=new Error(value.error||"请求失败");
    error.code=value.code||"REQUEST_FAILED";
    error.status=response.status;
    if(error.code==="MFA_REQUIRED"){
      setAuthStage("mfa");
      prepareMfa().catch(mfaError=>{
        $("mfaStatus").className="status top-gap bad";
        $("mfaStatus").textContent="无法启动二次验证："+mfaError.message;
      });
    }
    throw error;
  }
  return value;
}

async function prepareMfa(){
  setAuthStage("mfa");
  $("mfaStatus").className="status top-gap";
  $("mfaStatus").textContent="正在检查验证器…";
  $("mfaCode").value="";
  $("mfaEnroll").classList.add("hidden");
  $("mfaQr").removeAttribute("src");
  $("mfaSecret").value="";
  mfaFactorId="";
  mfaMode="";

  const user=await authApi("/auth/v1/user");
  const factors=Array.isArray(user?.factors)?user.factors:[];
  const verified=factors.find(f=>f?.factor_type==="totp"&&f?.status==="verified");

  if(verified?.id){
    mfaFactorId=verified.id;
    mfaMode="challenge";
    $("mfaBadge").textContent="TOTP";
    $("mfaInstruction").textContent="请输入验证器 App 当前显示的动态验证码。";
    $("mfaVerifyBtn").textContent="验证并进入";
    $("mfaStatus").textContent="已找到已绑定的 TOTP 验证器。";
    $("mfaCode").focus();
    return;
  }

  for(const factor of factors){
    if(factor?.factor_type==="totp"&&factor?.status==="unverified"&&factor?.id){
      try{await authApi("/auth/v1/factors/"+encodeURIComponent(factor.id),"DELETE")}catch(_e){}
    }
  }

  const enrolled=await authApi("/auth/v1/factors","POST",{
    friendly_name:"MZ Operations Hub",
    factor_type:"totp",
    issuer:"MZ Operations Hub"
  });
  if(!enrolled?.id||!enrolled?.totp?.secret)throw new Error("TOTP 绑定初始化失败");

  mfaFactorId=enrolled.id;
  mfaMode="enroll";
  $("mfaBadge").textContent="首次绑定";
  $("mfaInstruction").textContent="这是首次绑定。请先扫描二维码，再输入验证器 App 生成的动态验证码。";
  $("mfaEnroll").classList.remove("hidden");
  $("mfaQr").src=qrDataUri(enrolled.totp.qr_code);
  $("mfaSecret").value=String(enrolled.totp.secret||"");
  $("mfaVerifyBtn").textContent="完成绑定并进入";
  $("mfaStatus").textContent="二维码已生成；密钥只用于本次绑定。";
  $("mfaCode").focus();
}

async function verifyMfa(){
  const code=$("mfaCode").value.replace(/\s+/g,"").trim();
  if(!/^\d{6,8}$/.test(code)){
    $("mfaStatus").className="status top-gap bad";
    $("mfaStatus").textContent="请输入验证器 App 中的 6–8 位数字验证码。";
    return;
  }
  if(!mfaFactorId){
    await prepareMfa();
    return;
  }

  const button=$("mfaVerifyBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="验证中…";
  $("mfaStatus").className="status top-gap";
  $("mfaStatus").textContent="正在验证第二因素…";

  try{
    const challenge=await authApi(
      "/auth/v1/factors/"+encodeURIComponent(mfaFactorId)+"/challenge",
      "POST",
      {factorId:mfaFactorId}
    );
    if(!challenge?.id)throw new Error("无法创建 MFA challenge");

    const verified=await authApi(
      "/auth/v1/factors/"+encodeURIComponent(mfaFactorId)+"/verify",
      "POST",
      {challenge_id:challenge.id,code}
    );
    const elevatedToken=verified?.access_token||verified?.session?.access_token||"";
    if(!elevatedToken)throw new Error("MFA 验证成功但未返回安全会话");

    token=elevatedToken;
    const status=await api("auth_status");
    if(status.aal!=="aal2")throw new Error("安全会话未提升到 aal2");

    applyOpsStatus(status);
    $("mfaStatus").className="status top-gap ok";
    $("mfaStatus").textContent=mfaMode==="enroll"?"TOTP 已绑定并验证。":"二次验证通过。";
    await enterOperationsHub();
  }catch(error){
    $("mfaStatus").className="status top-gap bad";
    $("mfaStatus").textContent="验证失败："+error.message;
    $("mfaCode").select();
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function loadSecuritySettings(){
  const user=await authApi("/auth/v1/user");
  const factors=Array.isArray(user?.factors)?user.factors:[];
  const verifiedTotp=factors.filter(
    factor=>factor?.factor_type==="totp"&&factor?.status==="verified"
  );
  const count=verifiedTotp.length;

  $("totpFactorSummary").value=count+" 个已验证因子";
  $("totpFactorBadge").textContent=count>=2?"TOTP · 冗余已建立":"TOTP · 建议添加备用";
  $("totpFactorBadge").className="badge";
  $("mfaPolicyState").value=opsAuthStatus?.mfa_required===true
    ?"强制 · aal2"
    :"未强制";
  $("backupTotpStartBtn").disabled=count>=10;

  const advice=$("backupTotpAdvice");
  if(count>=2){
    advice.textContent="已建立备用 MFA 因子。建议两个因子放在不同设备或不同验证器中，避免单点丢失。";
  }else if(count===1){
    advice.textContent="当前只有 1 个 TOTP 因子。建议添加一个备用验证器；Supabase 不提供传统 recovery codes。";
  }else{
    advice.textContent="当前没有检测到已验证 TOTP 因子；请重新登录并完成 MFA 绑定。";
  }

  $("securityStatus").className="status top-gap "+(count>=1?"ok":"bad");
  $("securityStatus").textContent=[
    "会话: "+(opsAuthStatus?.aal||"-"),
    "MFA 强制: "+(opsAuthStatus?.mfa_required===true?"YES":"NO"),
    "已验证 TOTP: "+count,
    "备用状态: "+(count>=2?"READY":"建议补充")
  ].join("\n");
  return verifiedTotp;
}

async function cleanupBackupTotp(){
  if(!backupTotpFactorId)return;
  const factorId=backupTotpFactorId;
  backupTotpFactorId="";
  try{
    await authApi("/auth/v1/factors/"+encodeURIComponent(factorId),"DELETE");
  }catch(_e){}
}

function resetBackupTotpPanel(){
  backupTotpFactorId="";
  $("backupTotpPanel").classList.add("hidden");
  $("backupTotpQr").removeAttribute("src");
  $("backupTotpSecret").value="";
  $("backupTotpCode").value="";
  $("backupTotpVerifyBtn").disabled=false;
}

async function startBackupTotpEnrollment(){
  if(opsAuthStatus?.aal!=="aal2"){
    throw new Error("请先完成 MFA 二次验证");
  }
  await cleanupBackupTotp();
  resetBackupTotpPanel();

  const enrolled=await authApi("/auth/v1/factors","POST",{
    friendly_name:"MZ Operations Hub Backup",
    factor_type:"totp",
    issuer:"MZ Operations Hub"
  });
  if(!enrolled?.id||!enrolled?.totp?.secret){
    throw new Error("备用 TOTP 初始化失败");
  }

  backupTotpFactorId=enrolled.id;
  $("backupTotpQr").src=qrDataUri(enrolled.totp.qr_code);
  $("backupTotpSecret").value=String(enrolled.totp.secret||"");
  $("backupTotpPanel").classList.remove("hidden");
  $("securityStatus").className="status top-gap";
  $("securityStatus").textContent="备用验证器待确认：扫码后输入动态验证码。";
  $("backupTotpCode").focus();
}

async function verifyBackupTotp(){
  const code=$("backupTotpCode").value.replace(/\s+/g,"").trim();
  if(!backupTotpFactorId)throw new Error("请先开始备用验证器绑定");
  if(!/^\d{6,8}$/.test(code))throw new Error("请输入 6–8 位数字验证码");

  const button=$("backupTotpVerifyBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="验证中…";
  try{
    const challenge=await authApi(
      "/auth/v1/factors/"+encodeURIComponent(backupTotpFactorId)+"/challenge",
      "POST",
      {factorId:backupTotpFactorId}
    );
    if(!challenge?.id)throw new Error("无法创建备用 MFA challenge");

    const verified=await authApi(
      "/auth/v1/factors/"+encodeURIComponent(backupTotpFactorId)+"/verify",
      "POST",
      {challenge_id:challenge.id,code}
    );
    const elevatedToken=verified?.access_token||verified?.session?.access_token||"";
    if(elevatedToken){
      token=elevatedToken;
      }

    backupTotpFactorId="";
    $("backupTotpPanel").classList.add("hidden");
    $("backupTotpSecret").value="";
    $("backupTotpCode").value="";
    $("securityStatus").className="status top-gap ok";
    $("securityStatus").textContent="备用 TOTP 已验证并启用。";
    await loadSecuritySettings();
  }catch(error){
    $("securityStatus").className="status top-gap bad";
    $("securityStatus").textContent="备用 TOTP 验证失败："+error.message;
    $("backupTotpCode").select();
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function cancelBackupTotp(){
  const button=$("backupTotpCancelBtn");
  button.disabled=true;
  try{
    await cleanupBackupTotp();
    resetBackupTotpPanel();
    $("securityStatus").className="status top-gap";
    $("securityStatus").textContent="已取消；未验证的备用因子已清理。";
    await loadSecuritySettings();
  }finally{
    button.disabled=false;
  }
}

function renderAudit(events){
  const root=$("auditLog");
  root.replaceChildren();
  if(!Array.isArray(events)||events.length===0){
    root.textContent="暂无审计记录";
    return;
  }
  for(const event of events){
    const item=document.createElement("div");
    item.className="audit-item";
    const head=document.createElement("div");
    head.className="audit-item-head";
    const title=document.createElement("strong");
    title.textContent=String(event.action||"event");
    const time=document.createElement("span");
    time.textContent=event.occurred_at?new Date(event.occurred_at).toLocaleString():"";
    head.append(title,time);
    const meta=document.createElement("div");
    meta.className="audit-item-meta";
    const detail=event.detail&&typeof event.detail==="object"?event.detail:{};
    meta.textContent=[
      "结果: "+(event.outcome||"-")+" · AAL: "+(event.aal||"-"),
      "目标: "+(event.target||"-"),
      "详情: "+JSON.stringify(detail)
    ].join("\n");
    item.append(head,meta);
    root.appendChild(item);
  }
}

async function loadAudit(){
  try{
    const value=await api("audit","GET",null,{project:selectedProjectKey});
    renderAudit(value.events||[]);
  }catch(error){
    $("auditLog").textContent=error.code==="ACCESS_DENIED"
      ?"当前项目角色没有审计查看权限。"
      :"审计记录暂不可用："+error.message;
  }
}

async function loadMengzhengConfig(){
  const value=await api("config");
  const cfg=value.config;
  keyStates=cfg.api_key_states||{};

  $("provider").value=PROVIDERS[cfg.provider]?cfg.provider:"openai_compatible";
  $("api_style").value=cfg.api_style;
  syncApiStyleAvailability();
  if(cfg.api_style&&Array.from($("api_style").options).some(o=>o.value===cfg.api_style&&!o.disabled)){
    $("api_style").value=cfg.api_style;
  }
  $("base_url").value=cfg.base_url||"";
  syncBaseUrl({force:false});
  $("base_url").value=cfg.base_url||$("base_url").value;
  populateModelOptions(cfg.model||"");
  syncThinkingControl(cfg.thinking_mode||providerConfig().default_thinking);
  $("timeout_ms").value=cfg.timeout_ms;
  $("repairs").value=cfg.max_repair_attempts;
  $("enabled").value=String(cfg.enabled);
  $("api_key").value="";
  $("activeBadge").textContent=(cfg.provider||"-")+" / "+(cfg.model||"-");
  refreshDraft();
  showHealth(cfg);
  loadDecisionConfig().catch(error=>{
    $("jevHealth").className="status top-gap bad";
    $("jevHealth").textContent="Jev 配置暂不可用；主 Provider 不受影响。\n"+error.message;
  });
}

async function applyProjectSelection(){
  const project=membershipFor();
  if(!project)return;
  sessionStorage.setItem("mz_ops_project",selectedProjectKey);
  $("projectSelect").value=selectedProjectKey;
  renderProjectSelection();
  $("auditLog").textContent="正在加载 "+String(project.display_name||selectedProjectKey)+" 审计…";
  await loadAudit();
  if(selectedProjectKey==="mengzheng"){
    renderRuntimeConfig(null);
    renderRuntimeConsumerStatus(null);
    await loadMengzhengConfig();
  }else{
    await loadProjectRuntimeConfig();
    await loadRuntimeConsumerStatus().catch(error=>{
      $("runtimeConsumerStatus").className="status top-gap bad";
      $("runtimeConsumerStatus").textContent="Runtime Token 状态加载失败："+error.message;
    });
  }
}

async function enterOperationsHub(){
  setAuthStage("console");
  if(opsAuthStatus)applyOpsStatus(opsAuthStatus);
  await loadSecuritySettings().catch(error=>{
    $("securityStatus").className="status top-gap bad";
    $("securityStatus").textContent="安全状态加载失败："+error.message;
  });
  await applyProjectSelection();
}

async function bootstrapAuthenticatedSession(){
  const status=await api("auth_status");
  applyOpsStatus(status);
  if(status.needs_mfa===true||status.aal!=="aal2"&&status.mfa_exempt!==true){
    await prepareMfa();
    return;
  }
  await enterOperationsHub();
}

async function requestPasswordRecovery(){
  const email=$("email").value.trim();
  if(!email||!email.includes("@")){
    alert("请先输入要恢复的管理员邮箱。");
    $("email").focus();
    return;
  }

  const button=$("forgotPasswordBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="正在发送…";
  try{
    const redirectTo=new URL("./workspace.html",window.location.href).href;
    const response=await fetch(
      BASE+"/auth/v1/recover?redirect_to="+encodeURIComponent(redirectTo),
      {
        method:"POST",
        headers:{
          apikey:PUB,
          "Content-Type":"application/json",
          "Accept":"application/json"
        },
        body:JSON.stringify({email})
      }
    );
    if(!response.ok){
      let value={};
      try{value=await response.json()}catch(_e){}
      throw new Error(value?.msg||value?.message||"暂时无法发送密码重置邮件");
    }
    alert("如果该邮箱已注册，密码重置邮件已发送。请从邮件打开链接继续。");
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function signIn(){
  const email=$("email").value.trim();
  const password=$("password").value;
  if(!email||!password){
    alert("请输入账号和密码");
    return;
  }
  const button=$("loginBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="验证账号中…";
  try{
    const response=await fetch(BASE+"/auth/v1/token?grant_type=password",{
      method:"POST",
      headers:{apikey:PUB,"Content-Type":"application/json"},
      body:JSON.stringify({email,password})
    });
    const value=await response.json();
    $("password").value="";
    if(!response.ok||!value.access_token)throw new Error("账号或密码验证失败");
    token=value.access_token;
    await bootstrapAuthenticatedSession();
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function loadConfig(){
  if(selectedProjectKey!=="mengzheng")return;
  await loadMengzhengConfig();
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

function clearSensitiveBrowserState(){
  token="";
  runtimeConsumerRawToken="";
  for(const id of ["api_key","jev_api_key","mfaCode","mfaSecret","backupTotpSecret","backupTotpCode"]){
    const node=$(id);
    if(node&&"value" in node)node.value="";
  }
}

window.addEventListener("pagehide",()=>{
  clearSensitiveBrowserState();
});
window.addEventListener("pageshow",event=>{
  if(event.persisted){
    clearSensitiveBrowserState();
    window.location.replace(window.location.pathname+window.location.search);
  }
});

function logout(){
  clearSensitiveBrowserState();
  opsAuthStatus=null;
  opsMemberships=[];
  mfaFactorId="";
  mfaMode="";
  passwordSetupMode="";
  backupTotpFactorId="";
  setAuthStage("login");
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

$("passwordSetupBtn").addEventListener("click",()=>completePasswordSetup().catch(error=>{
  $("passwordSetupStatus").className="status top-gap bad";
  $("passwordSetupStatus").textContent=error.message;
}));
$("confirmPassword").addEventListener("keydown",event=>{
  if(event.key==="Enter")completePasswordSetup().catch(error=>{
    $("passwordSetupStatus").className="status top-gap bad";
    $("passwordSetupStatus").textContent=error.message;
  });
});
$("forgotPasswordBtn").addEventListener("click",()=>requestPasswordRecovery().catch(error=>alert(error.message)));
$("loginBtn").addEventListener("click",()=>signIn().catch(error=>alert(error.message)));
$("password").addEventListener("keydown",event=>{
  if(event.key==="Enter")signIn().catch(error=>alert(error.message));
});
$("mfaVerifyBtn").addEventListener("click",()=>verifyMfa().catch(error=>{
  $("mfaStatus").className="status top-gap bad";
  $("mfaStatus").textContent=error.message;
}));
$("mfaCode").addEventListener("keydown",event=>{
  if(event.key==="Enter")verifyMfa().catch(error=>{
    $("mfaStatus").className="status top-gap bad";
    $("mfaStatus").textContent=error.message;
  });
});
$("mfaLogoutBtn").addEventListener("click",logout);
$("mfaCopySecretBtn").addEventListener("click",async()=>{
  const secret=$("mfaSecret").value;
  if(!secret)return;
  try{
    await navigator.clipboard.writeText(secret);
    $("mfaStatus").className="status top-gap ok";
    $("mfaStatus").textContent="手工密钥已复制。";
  }catch(_e){
    $("mfaSecret").select();
    $("mfaStatus").className="status top-gap";
    $("mfaStatus").textContent="已选中密钥，请手动复制。";
  }
});
$("saveBtn").addEventListener("click",save);
$("testConnBtn").addEventListener("click",()=>testProvider("connection"));
$("testRespBtn").addEventListener("click",()=>testProvider("generation"));
$("reloadBtn").addEventListener("click",()=>loadConfig().catch(error=>alert(error.message)));
$("jevSaveBtn").addEventListener("click",saveDecision);
$("jevTestBtn").addEventListener("click",testDecision);
$("jevReloadBtn").addEventListener("click",()=>loadDecisionConfig().catch(error=>alert(error.message)));
$("projectSelect").addEventListener("change",()=>{
  const next=$("projectSelect").value;
  if(!opsMemberships.some(p=>p?.project_key===next))return;
  selectedProjectKey=next;
  applyProjectSelection().catch(error=>{
    $("projectIntegrationNote").textContent="项目切换失败："+error.message;
  });
});
$("runtimeSaveBtn").addEventListener("click",saveProjectRuntimeConfig);
$("runtimeReloadBtn").addEventListener("click",()=>loadProjectRuntimeConfig().catch(error=>{
  $("runtimeConfigStatus").className="status top-gap bad";
  $("runtimeConfigStatus").textContent="恢复草稿失败："+error.message;
}));
$("runtimeConsumerRotateBtn").addEventListener("click",rotateRuntimeConsumerToken);
$("runtimeConsumerReloadBtn").addEventListener("click",()=>loadRuntimeConsumerStatus().catch(error=>{
  $("runtimeConsumerStatus").className="status top-gap bad";
  $("runtimeConsumerStatus").textContent=error.message;
}));
$("runtimeConsumerCopyBtn").addEventListener("click",async()=>{
  if(!runtimeConsumerRawToken)return;
  try{
    await navigator.clipboard.writeText(runtimeConsumerRawToken);
    $("runtimeConsumerStatus").className="status top-gap ok";
    $("runtimeConsumerStatus").textContent+="\n一次性 Token 已复制到剪贴板。";
  }catch(_e){
    $("runtimeConsumerToken").select();
    $("runtimeConsumerStatus").className="status top-gap";
    $("runtimeConsumerStatus").textContent+="\n已选中 Token，请手动复制。";
  }
});
$("auditReloadBtn").addEventListener("click",loadAudit);
$("securityReloadBtn").addEventListener("click",()=>loadSecuritySettings().catch(error=>{
  $("securityStatus").className="status top-gap bad";
  $("securityStatus").textContent=error.message;
}));
$("backupTotpStartBtn").addEventListener("click",()=>startBackupTotpEnrollment().catch(error=>{
  $("securityStatus").className="status top-gap bad";
  $("securityStatus").textContent=error.message;
}));
$("backupTotpVerifyBtn").addEventListener("click",()=>verifyBackupTotp().catch(error=>{
  $("securityStatus").className="status top-gap bad";
  $("securityStatus").textContent=error.message;
}));
$("backupTotpCode").addEventListener("keydown",event=>{
  if(event.key==="Enter")verifyBackupTotp().catch(error=>{
    $("securityStatus").className="status top-gap bad";
    $("securityStatus").textContent=error.message;
  });
});
$("backupTotpCancelBtn").addEventListener("click",cancelBackupTotp);
$("backupTotpCopyBtn").addEventListener("click",async()=>{
  const secret=$("backupTotpSecret").value;
  if(!secret)return;
  try{
    await navigator.clipboard.writeText(secret);
    $("securityStatus").className="status top-gap ok";
    $("securityStatus").textContent="备用验证器手工密钥已复制。";
  }catch(_e){
    $("backupTotpSecret").select();
    $("securityStatus").className="status top-gap";
    $("securityStatus").textContent="已选中备用密钥，请手动复制。";
  }
});
$("logoutBtn").addEventListener("click",logout);
$("opsLogoutBtn").addEventListener("click",logout);

if(consumePasswordSetupCallback()){
  preparePasswordSetup();
}else if(token){
  bootstrapAuthenticatedSession().catch(error=>{
    alert(error.message);
    logout();
  });
}else{
  setAuthStage("login");
}
