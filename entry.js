"use strict";

(() => {
  const hash=window.location.hash||"";
  if(!hash.startsWith("#"))return;

  const params=new URLSearchParams(hash.slice(1));
  const type=String(params.get("type")||"").toLowerCase();
  const accessToken=params.get("access_token")||"";
  if(!accessToken||!(type==="invite"||type==="recovery"))return;

  // Keep the credential entirely in the browser URL fragment. Fragments are not
  // sent in HTTP requests; workspace.html consumes and clears it after password setup.
  window.location.replace("./workspace.html"+hash);
})();
