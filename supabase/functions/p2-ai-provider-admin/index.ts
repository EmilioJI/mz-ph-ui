const DEFAULT_THINKING_MODE="disabled";
const MAX_BODY=32768;
const ALLOWED_WEB_ORIGIN="https://emilioji.github.io";
const OPS_PROJECT_KEY="mengzheng";
const CORS_HEADERS={
  "Access-Control-Allow-Origin":ALLOWED_WEB_ORIGIN,
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Vary":"Origin"
};

function isGlm53Flash(model){
  const value=String(model||"").trim().toLowerCase();
  return value==="glm-5.3-flash"||value==="glm-5.3-flashx";
}
function normalizeThinkingMode(value,fallback=DEFAULT_THINKING_MODE){
  const mode=String(value||fallback).trim().toLowerCase();
  return ["disabled","enabled","provider_default"].includes(mode)?mode:fallback;
}
function effectiveThinking(provider,model,configured){
  if(provider==="zhipuai"&&isGlm53Flash(model))return "enabled";
  if(provider==="openai_compatible")return "provider_default";
  return normalizeThinkingMode(configured);
}
function thinkingLocked(provider,model){
  return (provider==="zhipuai"&&isGlm53Flash(model))||provider==="openai_compatible";
}
function providerSecretName(provider){
  if(provider==="zhipuai")return "ZHIPUAI_API_KEY";
  if(provider==="deepseek")return "DEEPSEEK_API_KEY";
  if(provider==="openai")return "OPENAI_API_KEY";
  return "AI_API_KEY";
}

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    ...CORS_HEADERS,
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store"
  }});
}
function namedKey(dictionary,legacy){
  const raw=Deno.env.get(dictionary);
  if(raw){try{const p=JSON.parse(raw);if(typeof p?.default==="string"&&p.default)return p.default}catch(_e){}}
  return Deno.env.get(legacy)||null;
}
function publishable(){
  return namedKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
}
function secret(){
  return namedKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
}
async function rpc(name,args){
  const base=Deno.env.get("SUPABASE_URL"),key=secret();
  if(!base||!key)throw Error("admin environment unavailable");
  const headers={apikey:key,"Content-Type":"application/json","Accept":"application/json"};
  if(!key.startsWith("sb_secret_"))headers.Authorization="Bearer "+key;
  const r=await fetch(base+"/rest/v1/rpc/"+name,{method:"POST",headers,body:JSON.stringify(args||{})});
  const raw=await r.text();
  if(!r.ok)throw Error("rpc "+name+" failed "+r.status);
  return raw?JSON.parse(raw):{};
}
function bearerToken(req){
  const auth=req.headers.get("Authorization")||"";
  return auth.startsWith("Bearer ")?auth.slice(7).trim():"";
}
function decodeJwtPayload(token){
  try{
    const parts=String(token||"").split(".");
    if(parts.length!==3)return {};
    let encoded=parts[1].replace(/-/g,"+").replace(/_/g,"/");
    while(encoded.length%4)encoded+="=";
    const binary=atob(encoded);
    const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
    const value=JSON.parse(new TextDecoder().decode(bytes));
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  }catch(_e){return {}}
}
async function userFor(req){
  const token=bearerToken(req);
  if(!token)return null;
  const base=Deno.env.get("SUPABASE_URL"),key=publishable();
  if(!base||!key)return null;
  const r=await fetch(base+"/auth/v1/user",{headers:{Authorization:"Bearer "+token,apikey:key}});
  if(!r.ok)return null;
  const u=await r.json();
  return typeof u?.id==="string"?u:null;
}
async function authContext(req){
  const token=bearerToken(req);
  if(!token)return null;
  const user=await userFor(req);
  if(!user)return null;
  const claims=decodeJwtPayload(token);
  if(String(claims.sub||"")!==user.id)return null;
  const aal=claims.aal==="aal2"?"aal2":"aal1";
  const sessionId=typeof claims.session_id==="string"&&/^[0-9a-f-]{36}$/i.test(claims.session_id)
    ?claims.session_id
    :null;
  if(!sessionId)return null;

  const sessionState=await rpc("p2_ops_session_state_server",{
    p_user_id:user.id,
    p_session_id:sessionId
  });
  if(sessionState?.active!==true)return null;
  const sessionAal=sessionState?.aal==="aal2"?"aal2":"aal1";
  if(aal==="aal2"&&sessionAal!=="aal2")return null;

  return {
    user,
    claims,
    aal,
    session_id:sessionId,
    session_aal:sessionAal,
    session_not_after:sessionState?.not_after||null
  };
}
async function securityPolicy(){
  const value=await rpc("p2_ops_security_policy_server",{});
  return {
    mfa_required:value?.mfa_required===true,
    updated_at:value?.updated_at||null
  };
}
function normalizeProjectKey(value,fallback=OPS_PROJECT_KEY){
  const key=String(value||fallback).trim().toLowerCase();
  if(!/^[a-z][a-z0-9_-]{1,63}$/.test(key))throw Error("invalid project key");
  return key;
}
async function hasPermission(ctx,permission,projectKey=OPS_PROJECT_KEY){
  if(!ctx?.user?.id)return false;
  const ok=await rpc("p2_ops_authorize_server",{
    p_user_id:ctx.user.id,
    p_project_key:normalizeProjectKey(projectKey),
    p_permission:permission
  });
  return ok===true;
}
async function authorize(req,permission,{allowAal1=false,projectKey=OPS_PROJECT_KEY}={}){
  const ctx=await authContext(req);
  if(!ctx)return {ok:false,status:401,code:"AUTH_REQUIRED",error:"authentication required",ctx:null};
  const project=normalizeProjectKey(projectKey);
  if(!await hasPermission(ctx,permission,project)){
    return {ok:false,status:403,code:"ACCESS_DENIED",error:"project authorization required",ctx,project_key:project};
  }
  const policy=await securityPolicy();
  let mfaExempt=false;
  if(policy.mfa_required&&ctx.aal!=="aal2"){
    const exempt=await rpc("p2_ops_mfa_exempt_server",{
      p_user_id:ctx.user.id,
      p_project_key:project
    });
    mfaExempt=exempt===true;
  }
  if(policy.mfa_required&&!allowAal1&&ctx.aal!=="aal2"&&!mfaExempt){
    return {ok:false,status:403,code:"MFA_REQUIRED",error:"multi-factor verification required",ctx,policy,mfa_exempt:false,project_key:project};
  }
  return {ok:true,ctx,policy,mfa_exempt:mfaExempt,project_key:project};
}
function runtimeSecretSlots(projectKey){
  if(projectKey==="xiaoshutong")return new Set([
    "model_api_key","homework_ocr_api_key","homework_multimodal_api_key","asr_api_key","tts_api_key"
  ]);
  if(projectKey==="jev-chat-jarvis")return new Set([
    "judge_api_key","reply_api_key","vision_api_key"
  ]);
  return new Set();
}
function cleanHttpsOrBlank(value,label){
  const text=String(value??"").trim();
  if(!text)return "";
  if(text.length>512||!validHttps(text))throw Error(label+" must be blank or HTTPS");
  return text;
}
function cleanText(value,label,max=160){
  const text=String(value??"").trim();
  if(text.length>max)throw Error(label+" is too long");
  return text;
}
function normalizedProjectRuntimeConfig(projectKey,raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("project config must be an object");

  if(projectKey==="xiaoshutong"){
    const provider=String(raw.model_provider??"FAKE").trim().toUpperCase();
    const profile=String(raw.model_runtime_profile??"ZHIPU_GLM47").trim().toUpperCase();
    const ocr=String(raw.homework_ocr_provider??"FAKE").trim().toUpperCase();
    const multimodal=String(raw.homework_multimodal_provider??"DISABLED").trim().toUpperCase();
    const multimodalMode=String(raw.homework_multimodal_response_mode??"JSON_SCHEMA").trim().toUpperCase();
    const asr=String(raw.asr_provider??"FAKE").trim().toUpperCase();
    const tts=String(raw.tts_provider??"FAKE").trim().toUpperCase();

    if(!["FAKE","OPENAI_COMPATIBLE"].includes(provider))throw Error("unsupported XST cloud model provider");
    if(!["ZHIPU_GLM47","ZHIPU_GLM53_FLASH","DEEPSEEK_FLASH"].includes(profile))throw Error("unsupported XST runtime profile");
    if(!["FAKE","HTTP_JSON"].includes(ocr))throw Error("unsupported XST OCR provider");
    if(!["DISABLED","OPENAI_COMPATIBLE"].includes(multimodal))throw Error("unsupported XST multimodal provider");
    if(!["JSON_SCHEMA","JSON_OBJECT"].includes(multimodalMode))throw Error("unsupported XST multimodal response mode");
    if(!["FAKE","HTTP","LOCAL_FUNASR"].includes(asr))throw Error("unsupported XST ASR provider");
    if(!["FAKE","HTTP","LOCAL_HTTP","LOCAL_QWEN3_TTS"].includes(tts))throw Error("unsupported XST TTS provider");

    const timeout=Number(raw.model_timeout_seconds??60);
    const maxTokens=Number(raw.model_max_tokens??512);
    const ocrTimeout=Number(raw.homework_ocr_timeout_seconds??30);
    const multimodalTimeout=Number(raw.homework_multimodal_timeout_seconds??20);
    const asrTimeout=Number(raw.asr_timeout_seconds??30);
    const ttsTimeout=Number(raw.tts_timeout_seconds??30);
    let thinking=null;
    if(raw.model_thinking_enabled!==null&&raw.model_thinking_enabled!==undefined&&raw.model_thinking_enabled!==""){
      if(typeof raw.model_thinking_enabled!=="boolean")throw Error("XST model thinking must be boolean or null");
      thinking=raw.model_thinking_enabled;
    }

    if(!Number.isFinite(timeout)||timeout<=0||timeout>120)throw Error("XST model timeout must be 1-120 seconds");
    if(!Number.isInteger(maxTokens)||maxTokens<1||maxTokens>8192)throw Error("XST max tokens must be 1-8192");
    for(const [label,value] of [
      ["OCR",ocrTimeout],
      ["multimodal",multimodalTimeout],
      ["ASR",asrTimeout],
      ["TTS",ttsTimeout]
    ]){
      if(!Number.isFinite(value)||value<=0||value>120)throw Error("XST "+label+" timeout must be 1-120 seconds");
    }

    const modelBase=cleanHttpsOrBlank(raw.model_base_url,"XST model base URL").replace(/\/+$/,"");
    const modelName=cleanText(raw.model_name,"XST model name",128);
    if(provider==="OPENAI_COMPATIBLE"){
      const profiles={
        ZHIPU_GLM47:{
          base_url:"https://open.bigmodel.cn/api/paas/v4",
          model:"glm-4.7",
          thinking:false
        },
        ZHIPU_GLM53_FLASH:{
          base_url:"https://open.bigmodel.cn/api/paas/v4",
          model:"glm-5.3-flash",
          thinking:true
        },
        DEEPSEEK_FLASH:{
          base_url:"https://api.deepseek.com",
          model:"deepseek-flash",
          thinking:false
        }
      };
      const rule=profiles[profile];
      if(
        !rule
        ||modelBase!==rule.base_url
        ||modelName!==rule.model
        ||thinking!==rule.thinking
      ){
        throw Error("XST runtime profile must exactly match approved endpoint/model/thinking");
      }
    }

    return {
      model_provider:provider,
      model_runtime_profile:profile,
      model_base_url:modelBase,
      model_name:modelName,
      model_timeout_seconds:timeout,
      model_max_tokens:maxTokens,
      model_thinking_enabled:thinking,
      homework_ocr_provider:ocr,
      homework_ocr_base_url:cleanHttpsOrBlank(raw.homework_ocr_base_url,"XST OCR base URL"),
      homework_ocr_timeout_seconds:ocrTimeout,
      homework_multimodal_provider:multimodal,
      homework_multimodal_response_mode:multimodalMode,
      homework_multimodal_endpoint:cleanHttpsOrBlank(raw.homework_multimodal_endpoint,"XST multimodal endpoint"),
      homework_multimodal_model:cleanText(raw.homework_multimodal_model,"XST multimodal model",128),
      homework_multimodal_timeout_seconds:multimodalTimeout,
      asr_provider:asr,
      asr_base_url:cleanHttpsOrBlank(raw.asr_base_url,"XST ASR base URL"),
      asr_model:cleanText(raw.asr_model,"XST ASR model",128),
      asr_timeout_seconds:asrTimeout,
      tts_provider:tts,
      tts_base_url:cleanHttpsOrBlank(raw.tts_base_url,"XST TTS base URL"),
      tts_model:cleanText(raw.tts_model,"XST TTS model",128),
      tts_voice:cleanText(raw.tts_voice??"xiaoshutong-default","XST TTS voice",80)||"xiaoshutong-default",
      tts_timeout_seconds:ttsTimeout
    };
  }

  if(projectKey==="jev-chat-jarvis"){
    const judgeProvider=String(raw.judge_provider??"openrouter").trim().toLowerCase();
    if(!["openrouter","typesafe","custom"].includes(judgeProvider))throw Error("unsupported JEV judge provider");

    const judgeBase=cleanHttpsOrBlank(raw.judge_base_url,"JEV judge base URL");
    const replyBase=cleanHttpsOrBlank(raw.reply_base_url,"JEV reply base URL");
    const visionBase=cleanHttpsOrBlank(raw.vision_base_url,"JEV vision base URL");
    if(!judgeBase||!replyBase||!visionBase)throw Error("JEV provider URLs cannot be blank");

    return {
      judge_provider:judgeProvider,
      judge_base_url:judgeBase,
      judge_model:cleanText(raw.judge_model,"JEV judge model",128),
      reply_base_url:replyBase,
      reply_model:cleanText(raw.reply_model,"JEV reply model",128),
      vision_base_url:visionBase,
      vision_model:cleanText(raw.vision_model,"JEV vision model",128)
    };
  }

  throw Error("project runtime config is not supported yet");
}

function auditSafeConfig(value){
  return {
    provider:String(value?.provider||""),
    api_style:String(value?.api_style||""),
    base_url:String(value?.base_url||""),
    model:String(value?.model||""),
    timeout_ms:Number(value?.timeout_ms||0),
    max_repair_attempts:Number(value?.max_repair_attempts||0),
    thinking_mode:String(value?.thinking_mode||""),
    enabled:value?.enabled===true
  };
}
async function audit(ctx,action,target,outcome,detail={},projectKey=OPS_PROJECT_KEY){
  if(!ctx?.user?.id)return;
  try{
    await rpc("p2_ops_audit_record_server",{
      p_user_id:ctx.user.id,
      p_project_key:normalizeProjectKey(projectKey),
      p_action:action,
      p_target:target||"",
      p_outcome:outcome,
      p_aal:ctx.aal,
      p_session_id:ctx.session_id,
      p_detail:detail&&typeof detail==="object"?detail:{}
    });
  }catch(_e){}
}
function validHttps(url){
  try{const u=new URL(url);return u.protocol==="https:"}catch(_e){return false}
}
function normalizedConfig(raw,base){
  const provider=String(raw?.provider??base?.provider??"zhipuai").trim().toLowerCase();
  const apiStyle=String(raw?.api_style??base?.api_style??"chat_completions").trim().toLowerCase();
  const baseUrl=String(raw?.base_url??base?.base_url??"").trim();
  const model=String(raw?.model??base?.model??"").trim();
  const timeoutMs=Number(raw?.timeout_ms??base?.timeout_ms??40000);
  const repairs=Number(raw?.max_repair_attempts??base?.max_repair_attempts??1);
  let thinkingMode=String(raw?.thinking_mode??base?.thinking_mode??DEFAULT_THINKING_MODE).trim().toLowerCase();
  const enabled=raw?.enabled===undefined?Boolean(base?.enabled??true):Boolean(raw.enabled);
  if(!["zhipuai","deepseek","openai","openai_compatible"].includes(provider))throw Error("unsupported provider");
  if(!["chat_completions","responses"].includes(apiStyle))throw Error("unsupported api style");
  if(["zhipuai","openai_compatible"].includes(provider)&&apiStyle!=="chat_completions")throw Error("selected provider requires chat_completions");
  if(!validHttps(baseUrl)||baseUrl.length>512)throw Error("base URL must be HTTPS");
  const host=new URL(baseUrl).hostname.toLowerCase();
  if(provider==="zhipuai"&&host!=="open.bigmodel.cn")throw Error("ZhipuAI must use the official open.bigmodel.cn endpoint");
  if(provider==="deepseek"&&host!=="api.deepseek.com")throw Error("DeepSeek must use the official api.deepseek.com endpoint");
  if(!model||model.length>128)throw Error("model is invalid");
  if(!Number.isInteger(timeoutMs)||timeoutMs<5000||timeoutMs>60000)throw Error("timeout must be 5000-60000 ms");
  if(!Number.isInteger(repairs)||repairs<0||repairs>2)throw Error("repair attempts must be 0-2");
  if(!["disabled","enabled","provider_default"].includes(thinkingMode))throw Error("unsupported thinking mode");
  if(provider==="zhipuai"&&isGlm53Flash(model))thinkingMode="enabled";
  else if(provider==="openai_compatible")thinkingMode="provider_default";
  return {provider,api_style:apiStyle,base_url:baseUrl,model,timeout_ms:timeoutMs,max_repair_attempts:repairs,thinking_mode:thinkingMode,enabled};
}
function publicSettings(raw){
  const value=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const provider=String(value.provider||"");
  const model=String(value.model||"");
  return {
    ...value,
    thinking_mode:effectiveThinking(provider,model,value.thinking_mode),
    thinking_locked:thinkingLocked(provider,model)
  };
}
async function loadRuntime(){
  const raw=await rpc("p2_ai_provider_config_server",{});
  return {
    provider:String(raw.ai_provider||""),
    api_style:String(raw.ai_api_style||""),
    base_url:String(raw.ai_base_url||""),
    model:String(raw.ai_model||""),
    api_key:String(raw.ai_api_key||""),
    timeout_ms:Number(raw.ai_timeout_ms||40000),
    max_repair_attempts:Number(raw.ai_max_repair_attempts||1),
    thinking_mode:effectiveThinking(String(raw.ai_provider||""),String(raw.ai_model||""),raw.ai_thinking_mode),
    enabled:raw.ai_enabled!==false
  };
}
async function loadKey(provider){
  const value=await rpc("p2_ai_provider_key_server",{p_provider:provider});
  return typeof value==="string"?value:"";
}

async function loadDecisionKey(){
  const value=await rpc("p2_ai_decision_provider_key_server",{});
  return typeof value==="string"?value:"";
}
function normalizedDecisionConfig(raw,base){
  const baseUrl=String(raw?.base_url??base?.base_url??"https://jev.bocha.cn/v1/systemone").trim();
  const model=String(raw?.model??base?.model??"bocha-jev-v1").trim();
  const timeoutMs=Number(raw?.timeout_ms??base?.timeout_ms??15000);
  const enabled=raw?.enabled===undefined?Boolean(base?.enabled??false):Boolean(raw.enabled);
  if(baseUrl!=="https://jev.bocha.cn/v1/systemone")throw Error("Bocha Jev must use the approved jev.bocha.cn/v1/systemone endpoint");
  if(!model||model.length>128)throw Error("Jev model is invalid");
  if(!Number.isInteger(timeoutMs)||timeoutMs<3000||timeoutMs>60000)throw Error("Jev timeout must be 3000-60000 ms");
  return {
    provider:"bocha_jev",
    base_url:baseUrl,
    model,
    timeout_ms:timeoutMs,
    enabled,
    failure_policy:"fail_open"
  };
}
async function testDecisionProvider(cfg,key){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),cfg.timeout_ms);
  const started=Date.now();
  try{
    const body={
      state:{
        task:"安装空调挡风被",
        preference:"明天白天完成，最好早上"
      },
      model:cfg.model,
      questions:{
        prefers_morning:{
          type:"noul",
          instructions:"Does this state express a preference for completing the task in the morning?"
        }
      }
    };
    const r=await fetch(cfg.base_url,{
      method:"POST",
      signal:controller.signal,
      headers:{
        Authorization:"Bearer "+key,
        "Content-Type":"application/json",
        "Accept":"application/json"
      },
      body:JSON.stringify(body)
    });
    const latency=Date.now()-started;
    const raw=await r.text();
    let value={};try{value=raw?JSON.parse(raw):{}}catch(_e){}
    const answers=value&&typeof value==="object"&&value.answers&&typeof value.answers==="object"?value.answers:null;
    const ok=Boolean(r.ok&&answers&&answers.prefers_morning);
    const usage=value&&typeof value.usage==="object"?value.usage:{};
    return {
      ok,
      http_status:r.status,
      latency_ms:latency,
      model:String(value?.model||cfg.model),
      answer:answers?.prefers_morning||null,
      usage:{
        input_tokens:Number.isFinite(Number(usage.input_tokens))?Number(usage.input_tokens):null,
        output_tokens:Number.isFinite(Number(usage.output_tokens))?Number(usage.output_tokens):null
      },
      failure_policy:"fail_open",
      error_code:ok?"":r.ok?"INVALID_RESPONSE":"HTTP_"+r.status,
      message:ok?"Jev decision endpoint responded":"Jev decision endpoint test failed"
    };
  }catch(e){
    const timeout=e?.name==="AbortError";
    return {
      ok:false,
      http_status:0,
      latency_ms:Date.now()-started,
      model:cfg.model,
      answer:null,
      usage:{input_tokens:null,output_tokens:null},
      failure_policy:"fail_open",
      error_code:timeout?"TIMEOUT":"TRANSPORT",
      message:timeout?"Jev timed out; main planner remains available":"Jev transport failed; main planner remains available"
    };
  }finally{clearTimeout(timer)}
}
function responseText(value,style){
  if(style==="responses"){
    if(typeof value?.output_text==="string")return value.output_text;
    for(const item of Array.isArray(value?.output)?value.output:[]){
      for(const c of Array.isArray(item?.content)?item.content:[]){
        if(c?.type==="output_text"&&typeof c.text==="string")return c.text;
      }
    }
    return "";
  }
  return String(value?.choices?.[0]?.message?.content||"");
}
async function testProvider(cfg,key,mode){
  const thinking=effectiveThinking(cfg.provider,cfg.model,cfg.thinking_mode);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),cfg.timeout_ms);
  const started=Date.now();
  try{
    const headers={Authorization:"Bearer "+key,"Content-Type":"application/json","Accept":"application/json"};
    let body;
    if(cfg.api_style==="responses"){
      body={model:cfg.model,instructions:"Answer briefly and exactly as requested.",input:mode==="generation"?"Return exactly: provider test ok":"Return exactly: OK"};
      if(thinking==="disabled")body.reasoning={effort:"none"};
      else if(thinking==="enabled")body.reasoning={effort:"low"};
    }else{
      body={model:cfg.model,messages:[
        {role:"system",content:"Answer briefly and exactly as requested."},
        {role:"user",content:mode==="generation"?"Return exactly: provider test ok":"Return exactly: OK"}
      ],max_tokens:32,temperature:0,stream:false};
      if(cfg.provider==="zhipuai"&&isGlm53Flash(cfg.model)){
        body.thinking={type:"enabled",clear_thinking:false};
        body.reasoning_effort="max";
        body.temperature=1;
        body.top_p=0.95;
      }else if(cfg.provider==="zhipuai"||cfg.provider==="deepseek"){
        if(thinking!=="provider_default")body.thinking={type:thinking};
        if(thinking==="enabled"&&cfg.provider==="deepseek")body.reasoning_effort="low";
      }else if(cfg.provider==="openai"&&thinking!=="provider_default"){
        body.reasoning_effort=thinking==="disabled"?"none":"low";
      }
    }
    const r=await fetch(cfg.base_url,{method:"POST",signal:controller.signal,headers,body:JSON.stringify(body)});
    const latency=Date.now()-started;
    const raw=await r.text();
    let value={};try{value=raw?JSON.parse(raw):{}}catch(_e){}
    const preview=responseText(value,cfg.api_style).trim().slice(0,120);
    return {ok:r.ok,http_status:r.status,latency_ms:latency,preview,thinking_mode:thinking,error_code:r.ok?"":"HTTP_"+r.status,message:r.ok?"Provider responded":"Provider HTTP "+r.status};
  }catch(e){
    const timeout=e?.name==="AbortError";
    return {ok:false,http_status:0,latency_ms:Date.now()-started,preview:"",thinking_mode:thinking,error_code:timeout?"TIMEOUT":"TRANSPORT",message:timeout?"Provider timed out":"Provider transport failed"};
  }finally{clearTimeout(timer)}
}
const html=(base,pub)=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Provider Hub</title><style>
:root{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#241b16;background:#f5f0e8}*{box-sizing:border-box}
body{margin:0}.wrap{max-width:980px;margin:36px auto;padding:0 18px}.card{background:#fffdf9;border:1px solid #ded3c4;border-radius:16px;padding:22px;margin:14px 0;box-shadow:0 8px 24px #3a2a1a0d}
h1{margin:0 0 6px;font-size:28px}h2{font-size:18px;margin:0 0 14px}.muted{color:#76675b;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.full{grid-column:1/-1}
label{display:block;font-size:13px;font-weight:650;margin-bottom:6px}input,select{width:100%;padding:11px 12px;border:1px solid #cfc0ad;border-radius:10px;background:#fff;font-size:14px}
button{padding:10px 15px;border:0;border-radius:10px;background:#6e4c34;color:white;font-weight:700;cursor:pointer}button.alt{background:#ede3d7;color:#4c3526}button:disabled{opacity:.5}
.row{display:flex;gap:10px;flex-wrap:wrap}.status{padding:10px 12px;border-radius:10px;background:#f3eee8;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap}.ok{background:#edf6ee}.bad{background:#faece8}
@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style></head><body><div class="wrap"><h1>AI Provider Hub</h1><div class="muted">云端切换模型与 Provider。每家 Provider 的 API Key 独立保存在 Vault，页面不会回显明文；先测试，再保存启用。</div>
<div id="login" class="card"><h2>管理员登录</h2><div class="grid"><div><label>邮箱</label><input id="email" type="email"></div><div><label>密码</label><input id="password" type="password"></div></div><div class="row" style="margin-top:14px"><button onclick="signIn()">登录</button></div></div>
<div id="console" style="display:none">
<div class="card"><h2>模型预设</h2><div class="row">
<button class="alt" onclick="preset('glm47')">GLM-4.7 · 非思考</button>
<button class="alt" onclick="preset('glm53flash')">GLM-5.3-Flash · 强制思考</button>
<button class="alt" onclick="preset('deepseek')">DeepSeek Flash · 非思考</button>
<button class="alt" onclick="preset('custom')">Custom OpenAI-compatible</button>
</div><div id="policy_note" class="muted" style="margin-top:10px"></div></div>
<div class="card"><h2>当前配置</h2><div class="grid">
<div><label>Provider</label><select id="provider" onchange="draftChanged()"><option value="zhipuai">ZhipuAI</option><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="openai_compatible">OpenAI-compatible</option></select></div>
<div><label>API 协议</label><select id="api_style"><option value="chat_completions">Chat Completions</option><option value="responses">Responses</option></select></div>
<div class="full"><label>Base URL（完整请求地址）</label><input id="base_url" oninput="draftChanged()"></div>
<div><label>模型</label><input id="model" oninput="draftChanged()"></div><div><label>当前 Provider API Key（留空=保持该 Provider 已保存的 Key）</label><input id="api_key" type="password" autocomplete="new-password"></div>
<div><label>单次 Provider Timeout (ms)</label><input id="timeout_ms" type="number" min="5000" max="60000"></div>
<div><label>格式修复重试次数</label><input id="repairs" type="number" min="0" max="2"></div><div><label>Thinking</label><input id="thinking_mode" readonly value="disabled"></div>
<div><label>启用</label><select id="enabled"><option value="true">启用</option><option value="false">停用</option></select></div>
<div><label>Key 状态</label><input id="key_state" disabled></div></div>
<div class="row" style="margin-top:16px"><button onclick="save()">保存并启用此配置</button><button class="alt" onclick="testProvider('connection')">测试连接</button><button class="alt" onclick="testProvider('generation')">测试响应</button><button class="alt" onclick="loadConfig()">恢复线上配置</button></div></div>
<div class="card"><h2>健康状态</h2><div id="health" class="status">尚未加载</div></div></div></div>
<script>
const BASE=${JSON.stringify(base)},PUB=${JSON.stringify(pub)},FN=BASE+"/functions/v1/p2-ai-provider-admin";
let token=sessionStorage.getItem("ai_admin_token")||"";
let keyStates={};
const $=id=>document.getElementById(id);
const PRESETS={
  glm47:{provider:"zhipuai",api_style:"chat_completions",base_url:"https://open.bigmodel.cn/api/paas/v4/chat/completions",model:"glm-4.7",timeout_ms:40000,max_repair_attempts:1},
  glm53flash:{provider:"zhipuai",api_style:"chat_completions",base_url:"https://open.bigmodel.cn/api/paas/v4/chat/completions",model:"glm-5.3-flash",timeout_ms:60000,max_repair_attempts:1},
  deepseek:{provider:"deepseek",api_style:"chat_completions",base_url:"https://api.deepseek.com/chat/completions",model:"deepseek-flash",timeout_ms:40000,max_repair_attempts:1},
  custom:{provider:"openai_compatible",api_style:"chat_completions",base_url:"https://",model:"",timeout_ms:40000,max_repair_attempts:1}
};
function effectiveThinkingUi(){
  const p=$("provider").value,m=$("model").value.trim().toLowerCase();
  if(p==="zhipuai"&&(m==="glm-5.3-flash"||m==="glm-5.3-flashx"))return"enabled_required";
  if(p==="zhipuai"||p==="deepseek")return"disabled";
  return"provider_default";
}
function draftChanged(){
  const mode=effectiveThinkingUi();
  $("thinking_mode").value=mode;
  $("key_state").value=keyStates[$("provider").value]?"已配置（不回显）":"未配置";
  $("policy_note").textContent=mode==="enabled_required"
    ?"GLM-5.3-Flash 官方不支持关闭 Thinking；适合高能力模式，不适合作为省 reasoning token 的默认线路。"
    :mode==="disabled"
      ?"当前预设强制关闭 Thinking，适合规划类 JSON 任务控制 token 与延迟。"
      :"Thinking 由目标 Provider 协议决定。";
}
function preset(name){
  const p=PRESETS[name];if(!p)return;
  $("provider").value=p.provider;$("api_style").value=p.api_style;$("base_url").value=p.base_url;$("model").value=p.model;
  $("timeout_ms").value=p.timeout_ms;$("repairs").value=p.max_repair_attempts;$("enabled").value="true";$("api_key").value="";
  draftChanged();
}
async function signIn(){const r=await fetch(BASE+"/auth/v1/token?grant_type=password",{method:"POST",headers:{apikey:PUB,"Content-Type":"application/json"},body:JSON.stringify({email:$("email").value,password:$("password").value})});const j=await r.json();if(!r.ok||!j.access_token){alert("登录失败");return}token=j.access_token;sessionStorage.setItem("ai_admin_token",token);await loadConfig()}
async function api(action,method="GET",body=null){const r=await fetch(FN+"?action="+action,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:body?JSON.stringify(body):null});const j=await r.json();if(r.status===401||r.status===403){sessionStorage.removeItem("ai_admin_token");token="";$("login").style.display="block";$("console").style.display="none";throw Error("无管理员权限")}if(!r.ok)throw Error(j.error||"请求失败");return j}
function payload(){return{provider:$("provider").value,api_style:$("api_style").value,base_url:$("base_url").value,model:$("model").value,api_key:$("api_key").value,timeout_ms:Number($("timeout_ms").value),max_repair_attempts:Number($("repairs").value),enabled:$("enabled").value==="true"}}
function showHealth(x){$("health").className="status "+(x.last_test_ok===true?"ok":x.last_test_ok===false?"bad":"");$("health").textContent=[
"最后测试: "+(x.last_test_at||"无"),"结果: "+(x.last_test_ok===null||x.last_test_ok===undefined?"未测试":x.last_test_ok?"PASS":"FAIL"),
"延迟: "+(x.last_test_latency_ms??"-")+" ms","HTTP: "+(x.last_test_http_status??"-"),"错误: "+(x.last_test_error_code||"-"),"信息: "+(x.last_test_message||"-")
].join("\n")}
async function loadConfig(){try{const j=await api("config");const c=j.config;keyStates=c.api_key_states||{};$("login").style.display="none";$("console").style.display="block";$("provider").value=c.provider;$("api_style").value=c.api_style;$("base_url").value=c.base_url;$("model").value=c.model;$("timeout_ms").value=c.timeout_ms;$("repairs").value=c.max_repair_attempts;$("enabled").value=String(c.enabled);$("api_key").value="";draftChanged();showHealth(c)}catch(e){if(token)alert(e.message)}}
async function save(){try{await api("save","POST",payload());await loadConfig();alert("已保存") }catch(e){alert(e.message)}}
async function testProvider(mode){try{const j=await api("test","POST",{...payload(),mode});$("health").className="status "+(j.result.ok?"ok":"bad");$("health").textContent=JSON.stringify(j.result,null,2)}catch(e){alert(e.message)}}
if(token)loadConfig();
</script></body></html>`;

Deno.serve(async(req)=>{
  const url=new URL(req.url),action=url.searchParams.get("action")||"";
  if(req.method==="OPTIONS"){
    const origin=req.headers.get("Origin")||"";
    if(origin&&origin!==ALLOWED_WEB_ORIGIN){
      return new Response("forbidden",{status:403,headers:{"Vary":"Origin"}});
    }
    return new Response("ok",{headers:CORS_HEADERS});
  }
  if(req.method==="GET"&&!action)return json({
    ok:true,
    service:"MZ Operations Hub API",
    message:"Secure operations control plane backend.",
    web_ui:"https://emilioji.github.io/mz-ph-ui/"
  });

  if(req.method==="GET"&&action==="auth_status"){
    let ctx,policy,memberships;
    try{
      ctx=await authContext(req);
      if(!ctx)return json({ok:false,error:"authentication required",code:"AUTH_REQUIRED"},401);
      memberships=await rpc("p2_ops_memberships_server",{p_user_id:ctx.user.id});
      if(!Array.isArray(memberships)||memberships.length===0){
        return json({ok:false,error:"Operations Hub membership required",code:"ACCESS_DENIED"},403);
      }
      policy=await securityPolicy();
    }catch(_e){
      return json({ok:false,error:"authorization service unavailable",code:"AUTHZ_UNAVAILABLE"},503);
    }

    const mfaExempt=memberships.some(m=>
      m?.principal_type==="service"&&m?.mfa_exempt===true&&["operator","readonly"].includes(String(m?.role||""))
    );
    return json({
      ok:true,
      aal:ctx.aal,
      mfa_required:policy.mfa_required,
      mfa_exempt:mfaExempt,
      needs_mfa:policy.mfa_required&&ctx.aal!=="aal2"&&!mfaExempt,
      memberships
    });
  }

  const selectedProject=normalizeProjectKey(url.searchParams.get("project")||OPS_PROJECT_KEY);
  const isMengzhengProviderAction=[
    "config","decision_config","test","decision_test","save","decision_save"
  ].includes(action);
  const authorizationProject=isMengzhengProviderAction?OPS_PROJECT_KEY:selectedProject;
  const permission=
    action==="config"||action==="decision_config"?"provider.read":
    action==="test"||action==="decision_test"?"provider.test":
    action==="save"||action==="decision_save"?"provider.write":
    action==="runtime_config"||action==="runtime_consumer_status"?"provider.read":
    action==="runtime_save"?"provider.write":
    action==="runtime_consumer_rotate"?"project.manage":
    action==="audit"?"audit.read":
    null;

  if(!permission)return json({ok:false,error:"not found"},404);

  let authz;
  try{authz=await authorize(req,permission,{projectKey:authorizationProject})}
  catch(_e){return json({ok:false,error:"authorization service unavailable",code:"AUTHZ_UNAVAILABLE"},503)}
  if(!authz.ok){
    if(authz.ctx)await audit(
      authz.ctx,"access.denied",action,"denied",
      {code:authz.code,permission},authorizationProject
    );
    return json({ok:false,error:authz.error,code:authz.code},authz.status);
  }
  const admin=authz.ctx;

  if(req.method==="GET"&&action==="config"){
    const cfg=await rpc("p2_ai_provider_settings_server",{});
    return json({ok:true,config:publicSettings(cfg)});
  }

  if(req.method==="GET"&&action==="decision_config"){
    const cfg=await rpc("p2_ai_decision_provider_settings_server",{});
    return json({ok:true,config:{...cfg,failure_policy:"fail_open"}});
  }

  if(req.method==="GET"&&action==="audit"){
    try{
      const rows=await rpc("p2_ops_audit_list_server",{
        p_user_id:admin.user.id,
        p_project_key:selectedProject,
        p_limit:50
      });
      return json({ok:true,project_key:selectedProject,events:rows});
    }catch(_e){
      return json({ok:false,error:"audit history unavailable"},503);
    }
  }

  if(req.method==="GET"&&action==="runtime_config"){
    if(!["xiaoshutong","jev-chat-jarvis"].includes(selectedProject)){
      return json({ok:false,error:"runtime config is not available for this project",code:"NOT_APPLICABLE"},404);
    }
    const cfg=await rpc("p2_ops_runtime_config_server",{p_project_key:selectedProject});
    return json({ok:true,config:cfg});
  }

  if(req.method==="POST"&&action==="runtime_save"){
    if(!["xiaoshutong","jev-chat-jarvis"].includes(selectedProject)){
      return json({ok:false,error:"runtime config is not available for this project",code:"NOT_APPLICABLE"},404);
    }
    let body={};
    try{
      const raw=await req.text();
      if(new TextEncoder().encode(raw).length>MAX_BODY)throw Error("too large");
      body=raw?JSON.parse(raw):{};
    }catch(_e){return json({ok:false,error:"invalid JSON"},400)}

    let normalized;
    try{normalized=normalizedProjectRuntimeConfig(selectedProject,body.config||{})}
    catch(e){return json({ok:false,error:e instanceof Error?e.message:"invalid project config"},400)}

    const current=await rpc("p2_ops_runtime_config_server",{p_project_key:selectedProject});
    const currentStatus=String(current?.runtime_adapter_status||"staged");
    const enabled=body.enabled===true;
    if(enabled&&currentStatus!=="active"){
      return json({
        ok:false,
        error:"This project runtime adapter is not active yet; staged configuration cannot take over runtime.",
        code:"RUNTIME_ADAPTER_NOT_ACTIVE"
      },409);
    }

    const suppliedSecrets=body.secrets&&typeof body.secrets==="object"&&!Array.isArray(body.secrets)
      ?body.secrets:{};
    const allowedSlots=runtimeSecretSlots(selectedProject);
    const changedSlots=[];
    for(const [slot,value] of Object.entries(suppliedSecrets)){
      const secretValue=typeof value==="string"?value.trim():"";
      if(!secretValue)continue;
      if(!allowedSlots.has(slot)){
        return json({ok:false,error:"unsupported project secret slot"},400);
      }
      if(!await hasPermission(admin,"provider.secret.write",selectedProject)){
        await audit(admin,"runtime.secret.denied",slot,"denied",{reason:"insufficient_permission"},selectedProject);
        return json({ok:false,error:"API key changes require admin permission",code:"SECRET_PERMISSION_REQUIRED"},403);
      }
      if(secretValue.length<8||secretValue.length>8192){
        return json({ok:false,error:"project secret length is invalid"},400);
      }
      await rpc("p2_ops_runtime_secret_set_server",{
        p_project_key:selectedProject,
        p_slot:slot,
        p_value:secretValue
      });
      changedSlots.push(slot);
    }

    const saved=await rpc("p2_ops_runtime_config_set_server",{
      p_project_key:selectedProject,
      p_config:normalized,
      p_enabled:enabled,
      p_runtime_adapter_status:currentStatus
    });
    await audit(admin,"runtime.config.save",selectedProject,"success",{
      revision_before:Number(current?.revision||0),
      revision_after:Number(saved?.revision||0),
      runtime_adapter_status:String(saved?.runtime_adapter_status||""),
      enabled:saved?.enabled===true,
      secret_slots_changed:changedSlots
    },selectedProject);
    return json({ok:true,config:saved});
  }

  if(req.method==="GET"&&action==="runtime_consumer_status"){
    if(selectedProject!=="xiaoshutong"){
      return json({ok:false,error:"runtime consumer is not available for this project",code:"NOT_APPLICABLE"},404);
    }
    const status=await rpc("p2_ops_runtime_consumer_status_server",{p_project_key:selectedProject});
    return json({ok:true,status});
  }

  if(req.method==="POST"&&action==="runtime_consumer_rotate"){
    if(selectedProject!=="xiaoshutong"){
      return json({ok:false,error:"runtime consumer is not available for this project",code:"NOT_APPLICABLE"},404);
    }
    if(!await hasPermission(admin,"provider.secret.write",selectedProject)){
      await audit(admin,"runtime.consumer.rotate.denied",selectedProject,"denied",{
        reason:"insufficient_permission"
      },selectedProject);
      return json({ok:false,error:"Runtime token rotation requires owner/admin secret permission",code:"SECRET_PERMISSION_REQUIRED"},403);
    }

    let body={};
    try{
      const raw=await req.text();
      if(new TextEncoder().encode(raw).length>4096)throw Error("too large");
      body=raw?JSON.parse(raw):{};
    }catch(_e){return json({ok:false,error:"invalid JSON"},400)}

    const digest=String(body.token_sha256||"").trim().toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(digest)){
      return json({ok:false,error:"runtime token digest is invalid"},400);
    }

    const status=await rpc("p2_ops_runtime_consumer_set_server",{
      p_project_key:selectedProject,
      p_token_sha256:digest,
      p_enabled:false
    });
    await audit(admin,"runtime.consumer.rotate",selectedProject,"success",{
      enabled:false,
      raw_token_received:false,
      token_digest_only:true
    },selectedProject);
    return json({ok:true,status});
  }

  if(req.method==="POST"&&(action==="decision_save"||action==="decision_test")){
    let body={};
    try{
      const raw=await req.text();
      if(new TextEncoder().encode(raw).length>MAX_BODY)throw Error("too large");
      body=raw?JSON.parse(raw):{};
    }catch(_e){return json({ok:false,error:"invalid JSON"},400)}

    const current=await rpc("p2_ai_decision_provider_settings_server",{});
    let cfg;
    try{cfg=normalizedDecisionConfig(body,current)}
    catch(e){return json({ok:false,error:e instanceof Error?e.message:"invalid Jev config"},400)}

    const suppliedKey=typeof body.api_key==="string"?body.api_key.trim():"";
    if(suppliedKey&&(suppliedKey.length<8||suppliedKey.length>8192)){
      return json({ok:false,error:"Jev API key length is invalid"},400);
    }
    if(suppliedKey&&!await hasPermission(admin,"provider.secret.write")){
      await audit(admin,"jev.secret.denied","bocha_jev","denied",{reason:"insufficient_permission"});
      return json({ok:false,error:"API key changes require admin permission",code:"SECRET_PERMISSION_REQUIRED"},403);
    }

    if(action==="decision_save"){
      const existingKey=suppliedKey||await loadDecisionKey();
      if(cfg.enabled&&!existingKey){
        return json({ok:false,error:"Enable Jev only after configuring its API key"},400);
      }
      if(suppliedKey){
        await rpc("p2_ai_decision_provider_secret_set_server",{p_value:suppliedKey});
      }
      await rpc("p2_ai_decision_provider_settings_set_server",{
        p_base_url:cfg.base_url,
        p_model:cfg.model,
        p_timeout_ms:cfg.timeout_ms,
        p_enabled:cfg.enabled
      });
      const saved=await rpc("p2_ai_decision_provider_settings_server",{});
      await audit(admin,"jev.config.save","bocha_jev","success",{
        before:{model:current.model,base_url:current.base_url,timeout_ms:current.timeout_ms,enabled:current.enabled===true},
        after:{model:saved.model,base_url:saved.base_url,timeout_ms:saved.timeout_ms,enabled:saved.enabled===true},
        api_key_changed:Boolean(suppliedKey)
      });
      return json({ok:true,config:{...saved,failure_policy:"fail_open"}});
    }

    const key=suppliedKey||await loadDecisionKey();
    if(!key)return json({ok:false,error:"Jev API key is not configured"},400);
    const result=await testDecisionProvider(cfg,key);
    const sameAsActive=(
      cfg.base_url===String(current.base_url||"")
      && cfg.model===String(current.model||"")
    );
    if(sameAsActive){
      await rpc("p2_ai_decision_provider_test_record_server",{
        p_ok:result.ok,
        p_latency_ms:result.latency_ms,
        p_http_status:result.http_status,
        p_error_code:result.error_code,
        p_message:result.message
      });
    }
    await audit(admin,"jev.provider.test","bocha_jev",result.ok?"success":"failure",{
      model:cfg.model,http_status:result.http_status,latency_ms:result.latency_ms,
      error_code:result.error_code||"",used_unsaved_key:Boolean(suppliedKey)
    });
    return json({ok:true,result,config:{...(await rpc("p2_ai_decision_provider_settings_server",{})),failure_policy:"fail_open"}});
  }

  if(req.method==="POST"&&(action==="save"||action==="test")){
    let body={};
    try{
      const raw=await req.text();
      if(new TextEncoder().encode(raw).length>MAX_BODY)throw Error("too large");
      body=raw?JSON.parse(raw):{};
    }catch(_e){return json({ok:false,error:"invalid JSON"},400)}

    const current=await rpc("p2_ai_provider_settings_server",{});
    let cfg;
    try{cfg=normalizedConfig(body,current)}
    catch(e){return json({ok:false,error:e instanceof Error?e.message:"invalid config"},400)}
    const suppliedKey=typeof body.api_key==="string"?body.api_key.trim():"";

    if(suppliedKey&&(suppliedKey.length<8||suppliedKey.length>8192)){
      return json({ok:false,error:"API key length is invalid"},400);
    }
    if(suppliedKey&&!await hasPermission(admin,"provider.secret.write")){
      await audit(admin,"provider.secret.denied",cfg.provider,"denied",{reason:"insufficient_permission"});
      return json({ok:false,error:"API key changes require admin permission",code:"SECRET_PERMISSION_REQUIRED"},403);
    }

    if(action==="save"){
      const existingKey=suppliedKey||await loadKey(cfg.provider);
      if(!existingKey)return json({ok:false,error:"Selected provider has no saved API key. Configure or test a key before activation."},400);
      if(suppliedKey){
        await rpc("p2_ai_provider_secret_set_server",{p_name:providerSecretName(cfg.provider),p_value:suppliedKey});
      }
      await rpc("p2_ai_provider_settings_set_server",{
        p_provider:cfg.provider,
        p_api_style:cfg.api_style,
        p_base_url:cfg.base_url,
        p_model:cfg.model,
        p_timeout_ms:cfg.timeout_ms,
        p_max_repair_attempts:cfg.max_repair_attempts,
        p_thinking_mode:cfg.thinking_mode,
        p_enabled:cfg.enabled
      });
      const saved=publicSettings(await rpc("p2_ai_provider_settings_server",{}));
      await audit(admin,"provider.config.save",cfg.provider,"success",{
        before:auditSafeConfig(current),
        after:auditSafeConfig(saved),
        api_key_changed:Boolean(suppliedKey)
      });
      return json({ok:true,config:saved});
    }

    const key=suppliedKey||await loadKey(cfg.provider);
    if(!key)return json({ok:false,error:"API key is not configured for this provider"},400);
    const result=await testProvider(cfg,key,body.mode==="generation"?"generation":"connection");
    const sameAsActive=(
      cfg.provider===String(current.provider||"")
      && cfg.api_style===String(current.api_style||"")
      && cfg.base_url===String(current.base_url||"")
      && cfg.model===String(current.model||"")
      && cfg.thinking_mode===effectiveThinking(String(current.provider||""),String(current.model||""),current.thinking_mode)
    );
    if(sameAsActive){
      await rpc("p2_ai_provider_test_record_server",{
        p_ok:result.ok,
        p_latency_ms:result.latency_ms,
        p_http_status:result.http_status,
        p_error_code:result.error_code,
        p_message:result.message
      });
    }
    await audit(admin,"provider.test",cfg.provider,result.ok?"success":"failure",{
      model:cfg.model,mode:body.mode==="generation"?"generation":"connection",
      http_status:result.http_status,latency_ms:result.latency_ms,
      error_code:result.error_code||"",used_unsaved_key:Boolean(suppliedKey)
    });
    return json({ok:true,result,config:publicSettings(await rpc("p2_ai_provider_settings_server",{}))});
  }

  return json({ok:false,error:"method not allowed"},405);
});
