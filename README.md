# mz-ph-ui

Public static shell for the Mengzheng account/Operations Hub and public product-distribution metadata.

Security boundary:
- no private application source;
- no service-role/provider secrets;
- Pages deploys an explicit `_site` allowlist only;
- update APKs are Release assets, never Git-tracked files;
- administrator bearer tokens are memory-only.

All rights reserved.
