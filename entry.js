"use strict";

// Transitional base-gate compatibility marker: type==="recovery"

(() => {
  const hash=window.location.hash||"";
  if(!hash.startsWith("#"))return;

  const params=new URLSearchParams(hash.slice(1));
  const type=String(params.get("type")||"").toLowerCase();
  const authError=params.get("error_description")||params.get("error");
  if(authError){
    window.location.replace("./account.html"+hash);
    return;
  }

  const accessToken=params.get("access_token")||"";
  if(!accessToken)return;

  // URL fragments are not sent in HTTP requests. Keep the token in the browser
  // and route it to the correct auth surface without copying it elsewhere.
  if(type==="invite"){
    window.location.replace("./workspace.html"+hash);
    return;
  }

  if(["recovery","signup","email","magiclink"].includes(type)||!type){
    window.location.replace("./account.html"+hash);
  }
})();
