# mz-ph-ui

Public static shell for the Mengzheng account/Operations Hub and public product-distribution metadata.

Security boundary:
- no private application source;
- no service-role/provider secrets;
- Pages deploys an explicit `_site` allowlist only;
- update APKs are Release assets, never Git-tracked files;
- administrator bearer tokens are memory-only.

All rights reserved.
## Singapore cutover

Operations Hub runtime moved from the retired Ohio endpoint `https://ibshmenzooxndneqwqht.supabase.co` to the Singapore endpoint `https://ftcyyvyoowkctbupzkct.supabase.co` on 2026-09-26. The Ohio URL is retained here only as migration history; runtime code and CSP must use Singapore.

