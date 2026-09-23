# Security

This repository contains only a public static operational frontend.

It must never contain:

- provider API keys or passwords;
- Supabase secret/service-role keys;
- database credentials;
- private application source code;
- private user data.

Authentication and authorization are enforced server-side. Saved provider keys are stored only in the backend Vault and are never returned to this frontend.

Copyright © 2026. All rights reserved. No license is granted for reuse, modification, or redistribution.
