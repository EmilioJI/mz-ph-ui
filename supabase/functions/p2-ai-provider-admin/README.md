# p2-ai-provider-admin

Source-controlled snapshot of the shared Operations Hub control-plane Edge Function.

Current deployed baseline when this file was added:

- Supabase project: `ibshmenzooxndneqwqht`
- Function: `p2-ai-provider-admin`
- Version: `18`
- Deployment SHA-256: `5f0b8b2161b4cf025e20138a2a8acb62a639f700f47db6c909f6b4e4782e3b42`
- `verify_jwt=false` is intentional because the function implements its own Supabase Auth session validation, MFA policy, project-scoped RBAC and audit before privileged actions.

## Xiaoshutong boundary

The Xiaoshutong runtime path is project-scoped and staged by default. It supports only controlled runtime profiles:

- `ZHIPU_GLM47`
- `ZHIPU_GLM53_FLASH`
- `DEEPSEEK_FLASH`

The server validates exact endpoint/model/thinking alignment for real model profiles. Runtime secrets are stored through Vault-backed RPCs and are never returned by the browser admin endpoint.

This source file does **not** imply that the Xiaoshutong runtime consumer is active. Activation is a separate controlled operation and must remain fail-closed until the Core runtime adapter and provider qualification gates are satisfied.
