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
let opsAuthStatus=null;
let mfaFactorId="";
let mfaMode="";
let backupTotpFactorId="";
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
  const login=stage==="login",mfa=stage==="mfa",consoleOpen=stage==="console";
  $("workspaceHero")?.classList.toggle("hidden",!login);
  $("login").classList.toggle("hidden",!login);
  $("mfa").classList.toggle("hidden",!mfa);
  $("console").classList.toggle("hidden",!consoleOpen);
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

function applyOpsStatus(status){
  opsAuthStatus=status||{};
  const memberships=Array.isArray(status?.memberships)?status.memberships:[];
  const membership=memberships.find(x=>x?.project_key==="mengzheng")||memberships[0]||{};
  $("roleBadge").textContent=membership.role?("角色 · "+membership.role):"已授权";
  $("mfaSessionState").value=status?.aal==="aal2"
    ?"aal2 · MFA 已验证"
    :"aal1 · 需要二次验证";
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
  let value={};
  try{value=await response.json()}catch(_e){}
  if(response.status===401){
    sessionStorage.removeItem("mz_ai_admin_token");
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
    sessionStorage.setItem("mz_ai_admin_token",token);
    const status=await api("auth_status");
    if(status.aal!=="aal2")throw new Error("安全会话未提升到 aal2");

    applyOpsStatus(status);
    $("mfaStatus").className="status top-gap ok";
    $("mfaStatus").textContent=mfaMode==="enroll"?"TOTP 已绑定并验证。":"二次验证通过。";
    await loadConfig();
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
      sessionStorage.setItem("mz_ai_admin_token",token);
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
    const value=await api("audit");
    renderAudit(value.events||[]);
  }catch(error){
    $("auditLog").textContent=error.code==="ACCESS_DENIED"
      ?"当前项目角色没有审计查看权限。"
      :"审计记录暂不可用："+error.message;
  }
}

async function bootstrapAuthenticatedSession(){
  const status=await api("auth_status");
  applyOpsStatus(status);
  if(status.aal!=="aal2"){
    await prepareMfa();
    return;
  }
  await loadConfig();
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
    sessionStorage.setItem("mz_ai_admin_token",token);
    await bootstrapAuthenticatedSession();
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function loadConfig(){
  const value=await api("config");
  const cfg=value.config;
  keyStates=cfg.api_key_states||{};
  setAuthStage("console");
  if(opsAuthStatus)applyOpsStatus(opsAuthStatus);

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
  loadAudit();
  loadSecuritySettings().catch(error=>{
    $("securityStatus").className="status top-gap bad";
    $("securityStatus").textContent="安全状态加载失败："+error.message;
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
  opsAuthStatus=null;
  mfaFactorId="";
  mfaMode="";
  backupTotpFactorId="";
  $("api_key").value="";
  $("jev_api_key").value="";
  $("mfaCode").value="";
  $("mfaSecret").value="";
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

if(token){
  bootstrapAuthenticatedSession().catch(error=>{
    alert(error.message);
    logout();
  });
}else{
  setAuthStage("login");
}
