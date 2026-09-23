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
const CUSTOM_MODEL="__custom__";

const PROVIDERS={
  zhipuai:{
    default_style:"chat_completions",
    supported_styles:["chat_completions"],
    base_urls:{
      chat_completions:"https://open.bigmodel.cn/api/paas/v4/chat/completions"
    },
    default_model:"glm-4.7",
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
    models:[]
  }
};

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
    base_url:"",
    model:"",
    timeout_ms:40000,
    max_repair_attempts:1
  }
};

function providerConfig(){
  return PROVIDERS[$("provider").value]||PROVIDERS.openai_compatible;
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
  $("api_key").value="";
  refreshDraft();
}

function payload(){
  return{
    provider:$("provider").value,
    api_style:$("api_style").value,
    base_url:$("base_url").value.trim(),
    model:selectedModel(),
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

function effectiveThinking(){
  const provider=$("provider").value;
  const model=selectedModel().toLowerCase();
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
        ?"当前系统策略关闭 Thinking，适合结构化规划任务控制 token 与延迟。"
        :"Thinking 由目标 Provider 与后端适配策略决定。";
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
    const value=validatePayload(payload());
    await api("save","POST",value);
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
    const value=validatePayload(payload());
    const result=await api("test","POST",{...value,mode});
    $("api_key").value="";
    const node=$("health");
    node.className="status "+(result.result.ok?"ok":"bad");
    node.textContent=JSON.stringify(result.result,null,2);
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

$("provider").addEventListener("change",applyProviderDefaults);
$("api_style").addEventListener("change",()=>{
  syncBaseUrl({force:$("provider").value!=="openai_compatible"});
  refreshDraft();
});
$("model_select").addEventListener("change",()=>{
  const custom=$("model_select").value===CUSTOM_MODEL;
  $("model_custom").classList.toggle("hidden",!custom);
  if(custom)$("model_custom").focus();
  refreshDraft();
});
$("model_custom").addEventListener("input",refreshDraft);
$("base_url").addEventListener("input",refreshDraft);

$("loginBtn").addEventListener("click",()=>signIn().catch(error=>alert(error.message)));
$("password").addEventListener("keydown",event=>{
  if(event.key==="Enter")signIn().catch(error=>alert(error.message));
});
$("saveBtn").addEventListener("click",save);
$("testConnBtn").addEventListener("click",()=>testProvider("connection"));
$("testRespBtn").addEventListener("click",()=>testProvider("generation"));
$("reloadBtn").addEventListener("click",()=>loadConfig().catch(error=>alert(error.message)));
$("logoutBtn").addEventListener("click",logout);

if(token){
  loadConfig().catch(()=>logout());
}
