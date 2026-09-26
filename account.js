"use strict";

// Transitional base-gate compatibility markers: ????????????????????? ???????????????????????????

if(window.top!==window.self){
  document.documentElement.innerHTML="";
  throw new Error("Framed execution blocked");
}
if(window.opener!==null){
  document.documentElement.innerHTML="";
  throw new Error("Opened-window execution blocked");
}
window.name="";

const BASE="https://ftcyyvyoowkctbupzkct.supabase.co";
const PUB="sb_publishable_vsp2sdBNKkqGh97lTvJRFg_Bmk7fNdO";
const $=id=>document.getElementById(id);

let accessToken="";
let callbackType="";
let currentMfaFactors=[];

function clearAccountSessionMemory(){
  accessToken="";
  callbackType="";
  for(const id of ["password","newPassword","confirmPassword","accountMfaCode"]){
    const node=$(id);
    if(node&&"value" in node)node.value="";
  }
}

window.addEventListener("pagehide",()=>{
  clearAccountSessionMemory();
});
window.addEventListener("pageshow",event=>{
  if(event.persisted){
    clearAccountSessionMemory();
    window.location.replace(window.location.pathname+window.location.search);
  }
});

function accountUrl(){
  return new URL("./account.html",window.location.href).href;
}

function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim());
}

function validPassword(value){
  const text=String(value||"");
  return text.length>=8&&/[A-Za-z]/.test(text)&&/\d/.test(text);
}

function safeAuthError(value,fallback){
  const code=String(value?.error_code||value?.code||"").toLowerCase();
  if(code==="email_not_confirmed")return "邮箱尚未确认，请先完成邮箱验证。";
  if(code==="invalid_credentials")return "账号或密码错误。";
  if(code==="over_request_rate_limit"||code==="over_email_send_rate_limit")return "请求过于频繁，请稍后再试。";
  if(code==="weak_password")return "密码强度不足，请更换更强的密码。";
  if(code==="same_password")return "新密码不能与当前密码相同，请换一个新密码。";
  return fallback;
}

async function request(path,{method="GET",body=null,bearer=""}={}){
  const headers={
    apikey:PUB,
    Accept:"application/json"
  };
  if(body!==null)headers["Content-Type"]="application/json";
  if(bearer)headers.Authorization="Bearer "+bearer;

  const response=await fetch(BASE+path,{
    method,
    headers,
    body:body===null?null:JSON.stringify(body)
  });
  let value={};
  try{value=await response.json()}catch(_e){}
  if(!response.ok){
    const error=new Error(safeAuthError(value,"认证服务暂时无法完成此操作。"));
    error.status=response.status;
    error.code=value?.error_code||value?.code||"";
    throw error;
  }
  return value;
}

function setStatus(id,message,kind=""){
  const node=$(id);
  node.className="status top-gap"+(kind?" "+kind:"");
  node.textContent=message;
}

function setStage(stage){
  const ids=["loginStage","registerStage","recoveryStage","resetStage","successStage","signedInStage"];
  ids.forEach(id=>$(id).classList.toggle("hidden",id!==stage+"Stage"));
  const navVisible=stage==="login"||stage==="register";
  $("accountNav").classList.toggle("hidden",!navVisible);
  $("navLogin").classList.toggle("active",stage==="login");
  $("navRegister").classList.toggle("active",stage==="register");
}

function resetEphemeralAuth(){
  accessToken="";
  callbackType="";
  currentMfaFactors=[];
  history.replaceState(null,"",window.location.pathname+window.location.search);
}

function showSuccess(title,message){
  resetEphemeralAuth();
  $("successTitle").textContent=title;
  $("successMessage").textContent=message;
  setStage("success");
}

async function loadCurrentUser(token){
  return await request("/auth/v1/user",{bearer:token});
}

function renderMfaSecurity(user){
  const factors=Array.isArray(user?.factors)?user.factors:[];
  currentMfaFactors=factors.filter(
    factor=>factor?.factor_type==="totp"&&factor?.status==="verified"&&factor?.id
  );

  $("accountMfaFactor").replaceChildren();
  currentMfaFactors.forEach((factor,index)=>{
    const option=document.createElement("option");
    option.value=String(factor.id);
    const name=String(factor.friendly_name||"验证器");
    option.textContent=(index+1)+". "+name;
    $("accountMfaFactor").appendChild(option);
  });

  const hasFactors=currentMfaFactors.length>0;
  $("accountMfaPanel").classList.toggle("hidden",!hasFactors);
  $("accountMfaEmpty").classList.toggle("hidden",hasFactors);
  $("accountMfaBadge").textContent=hasFactors
    ?currentMfaFactors.length+" 个 TOTP"
    :"无 MFA";
  $("accountMfaCode").value="";
  setStatus(
    "accountMfaStatus",
    hasFactors
      ?"检测到 "+currentMfaFactors.length+" 个已验证 TOTP。删除前需要输入当前动态验证码。"
      :"当前普通账户没有已验证 MFA；后续登录只需常规账号认证。",
    hasFactors?"":"ok"
  );
}

async function reloadMfaSecurity(){
  if(!accessToken)throw new Error("登录会话已失效，请重新登录。");
  const user=await loadCurrentUser(accessToken);
  renderMfaSecurity(user);
}

async function removeSelectedMfa(){
  if(!accessToken)throw new Error("登录会话已失效，请重新登录。");
  const factorId=$("accountMfaFactor").value;
  const code=$("accountMfaCode").value.replace(/\s+/g,"").trim();
  if(!factorId)throw new Error("当前没有可删除的 MFA 因子。");
  if(!/^\d{6,8}$/.test(code))throw new Error("请输入验证器当前显示的 6–8 位动态验证码。");

  const button=$("accountMfaRemoveBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="验证中…";
  setStatus("accountMfaStatus","正在验证第二因素…");

  try{
    const challenge=await request(
      "/auth/v1/factors/"+encodeURIComponent(factorId)+"/challenge",
      {
        method:"POST",
        bearer:accessToken,
        body:{factorId}
      }
    );
    if(!challenge?.id)throw new Error("无法创建 MFA 验证 challenge。");

    const verified=await request(
      "/auth/v1/factors/"+encodeURIComponent(factorId)+"/verify",
      {
        method:"POST",
        bearer:accessToken,
        body:{challenge_id:challenge.id,code}
      }
    );
    const elevatedToken=verified?.access_token||verified?.session?.access_token||"";
    if(!elevatedToken)throw new Error("MFA 验证成功，但没有取得安全会话。");

    accessToken=elevatedToken;
    button.textContent="正在删除…";
    await request(
      "/auth/v1/factors/"+encodeURIComponent(factorId),
      {method:"DELETE",bearer:accessToken}
    );

    const user=await loadCurrentUser(accessToken);
    renderMfaSecurity(user);
    setStatus(
      "accountMfaStatus",
      currentMfaFactors.length===0
        ?"MFA 已删除。新登录会话将恢复为普通 aal1 认证。"
        :"所选 MFA 已删除；账号仍有 "+currentMfaFactors.length+" 个验证器。",
      "ok"
    );
  }catch(error){
    setStatus("accountMfaStatus",error.message,"bad");
    throw error;
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function signIn(){
  const email=$("loginEmail").value.trim();
  const password=$("loginPassword").value;
  if(!validEmail(email))throw new Error("请输入有效邮箱地址。");
  if(!password)throw new Error("请输入密码。");

  const button=$("loginBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="登录中…";
  setStatus("loginStatus","正在验证账号…");
  try{
    const value=await request("/auth/v1/token?grant_type=password",{
      method:"POST",
      body:{email,password}
    });
    $("loginPassword").value="";
    if(!value?.access_token)throw new Error("登录成功但未取得有效会话。");
    accessToken=value.access_token;
    const user=value.user||await loadCurrentUser(accessToken);
    $("signedInEmail").value=String(user?.email||email);
    renderMfaSecurity(user);
    setStage("signedIn");
  }catch(error){
    setStatus("loginStatus",error.message,"bad");
    throw error;
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function register(){
  const email=$("registerEmail").value.trim();
  const password=$("registerPassword").value;
  const confirm=$("registerPasswordConfirm").value;
  if(!validEmail(email))throw new Error("请输入有效邮箱地址。");
  if(!validPassword(password))throw new Error("密码至少 8 位，并同时包含字母和数字。");
  if(password!==confirm)throw new Error("两次输入的密码不一致。");

  const button=$("registerBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="创建中…";
  setStatus("registerStatus","正在创建账号…");
  try{
    const value=await request("/auth/v1/signup?redirect_to="+encodeURIComponent(accountUrl()),{
      method:"POST",
      body:{email,password}
    });
    $("registerPassword").value="";
    $("registerPasswordConfirm").value="";
    if(value?.access_token){
      accessToken=value.access_token;
      showSuccess("账户已创建","账号已创建并登录。你现在可以使用同一邮箱和密码登录蒙正规划 App。");
      return;
    }
    setStatus(
      "registerStatus",
      "注册请求已提交。请检查邮箱并点击确认链接；完成后会返回本账号中心。",
      "ok"
    );
  }catch(error){
    setStatus("registerStatus",error.message,"bad");
    throw error;
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function resendConfirmation(){
  const email=$("registerEmail").value.trim();
  if(!validEmail(email))throw new Error("请先填写要确认的邮箱地址。");

  const button=$("resendBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="发送中…";
  try{
    await request("/auth/v1/resend?redirect_to="+encodeURIComponent(accountUrl()),{
      method:"POST",
      body:{type:"signup",email}
    });
    setStatus(
      "registerStatus",
      "如果该邮箱存在待确认注册，确认邮件已重新发送。请检查收件箱和垃圾邮件。",
      "ok"
    );
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function requestRecovery(){
  const email=$("recoveryEmail").value.trim();
  if(!validEmail(email))throw new Error("请输入有效邮箱地址。");

  const button=$("recoveryBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="发送中…";
  try{
    await request("/auth/v1/recover?redirect_to="+encodeURIComponent(accountUrl()),{
      method:"POST",
      body:{email}
    });
    setStatus(
      "recoveryStatus",
      "如果该邮箱已注册，密码重置邮件已发送。请检查收件箱和垃圾邮件。",
      "ok"
    );
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function completeReset(){
  const password=$("resetPassword").value;
  const confirm=$("resetPasswordConfirm").value;
  if(!accessToken)throw new Error("安全链接已失效，请重新申请密码重置邮件。");
  if(!validPassword(password))throw new Error("密码至少 8 位，并同时包含字母和数字。");
  if(password!==confirm)throw new Error("两次输入的密码不一致。");

  const button=$("resetBtn");
  button.disabled=true;
  const original=button.textContent;
  button.textContent="保存中…";
  setStatus("resetStatus","正在安全更新密码…");
  try{
    await request("/auth/v1/user",{
      method:"PUT",
      bearer:accessToken,
      body:{password}
    });
    $("resetPassword").value="";
    $("resetPasswordConfirm").value="";
    const isInvite=callbackType==="invite";
    showSuccess(
      isInvite?"密码设置完成":"密码已更新",
      isInvite
        ?"账户密码已经设置。请使用对应产品入口重新登录。"
        :"新密码已经生效。请使用新密码重新登录蒙正规划。"
    );
  }catch(error){
    setStatus("resetStatus",error.message,"bad");
    throw error;
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

async function consumeCallback(){
  const raw=window.location.hash||"";
  if(!raw.startsWith("#"))return false;

  const params=new URLSearchParams(raw.slice(1));
  const errorDescription=params.get("error_description")||params.get("error");
  const errorCode=String(params.get("error_code")||"").toLowerCase();
  if(errorDescription){
    resetEphemeralAuth();
    setStage("login");
    setStatus(
      "loginStatus",
      errorCode==="otp_expired"
        ?"密码重置链接已被使用或已过期，请重新申请密码重置邮件。"
        :"认证链接无效或已过期，请重新发起操作。",
      "bad"
    );
    return true;
  }

  const token=params.get("access_token")||"";
  const type=String(params.get("type")||"").toLowerCase();
  if(!token)return false;

  accessToken=token;
  callbackType=type;
  history.replaceState(null,"",window.location.pathname+window.location.search);

  if(type==="recovery"||type==="invite"){
    try{
      const user=await loadCurrentUser(accessToken);
      $("resetIntro").textContent=type==="invite"
        ?"邀请链接已验证。请为这个账号设置登录密码。"
        :"密码恢复链接已验证。请设置新的登录密码。";
      $("resetTitle").textContent=type==="invite"?"设置账户密码":"设置新密码";
      setStatus("resetStatus","已验证："+String(user?.email||"该账号"),"ok");
      setStage("reset");
      $("resetPassword").focus();
    }catch(_e){
      resetEphemeralAuth();
      setStage("login");
      setStatus("loginStatus","认证链接无效或已过期，请重新发起操作。","bad");
    }
    return true;
  }

  try{
    const user=await loadCurrentUser(accessToken);
    showSuccess(
      "邮箱确认成功",
      "邮箱 "+String(user?.email||"")+" 已确认。现在可以使用该账号登录蒙正规划。"
    );
  }catch(_e){
    resetEphemeralAuth();
    setStage("login");
    setStatus("loginStatus","邮箱确认链接无效或已过期，请重新发送确认邮件。","bad");
  }
  return true;
}

function goLogin(){
  resetEphemeralAuth();
  setStage("login");
  $("loginPassword").value="";
  $("loginEmail").focus();
}

$("navLogin").addEventListener("click",()=>setStage("login"));
$("navRegister").addEventListener("click",()=>setStage("register"));
$("forgotBtn").addEventListener("click",()=>{
  $("recoveryEmail").value=$("loginEmail").value.trim();
  setStage("recovery");
  $("recoveryEmail").focus();
});
$("recoveryBackBtn").addEventListener("click",goLogin);
$("successLoginBtn").addEventListener("click",goLogin);
$("signedOutBtn").addEventListener("click",goLogin);
$("accountMfaReloadBtn").addEventListener("click",()=>reloadMfaSecurity().catch(error=>{
  setStatus("accountMfaStatus",error.message,"bad");
}));
$("accountMfaRemoveBtn").addEventListener("click",()=>removeSelectedMfa().catch(()=>{}));
$("accountMfaCode").addEventListener("keydown",event=>{
  if(event.key==="Enter")removeSelectedMfa().catch(()=>{});
});

$("loginBtn").addEventListener("click",()=>signIn().catch(()=>{}));
$("registerBtn").addEventListener("click",()=>register().catch(error=>setStatus("registerStatus",error.message,"bad")));
$("resendBtn").addEventListener("click",()=>resendConfirmation().catch(error=>setStatus("registerStatus",error.message,"bad")));
$("recoveryBtn").addEventListener("click",()=>requestRecovery().catch(error=>setStatus("recoveryStatus",error.message,"bad")));
$("resetBtn").addEventListener("click",()=>completeReset().catch(()=>{}));

$("loginPassword").addEventListener("keydown",event=>{
  if(event.key==="Enter")signIn().catch(()=>{});
});
$("registerPasswordConfirm").addEventListener("keydown",event=>{
  if(event.key==="Enter")register().catch(error=>setStatus("registerStatus",error.message,"bad"));
});
$("recoveryEmail").addEventListener("keydown",event=>{
  if(event.key==="Enter")requestRecovery().catch(error=>setStatus("recoveryStatus",error.message,"bad"));
});
$("resetPasswordConfirm").addEventListener("keydown",event=>{
  if(event.key==="Enter")completeReset().catch(()=>{});
});

consumeCallback().then(consumed=>{
  if(!consumed)setStage("login");
});
