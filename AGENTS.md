# AGENTS.md — mz-ph-ui agent rules

## Repository boundary

This is a public static shell for the Mengzheng account/Operations Hub and public distribution metadata.

Security invariants:
- no private application source;
- no service-role/provider secrets;
- no committed API keys, bearer tokens, signing material, or private credentials;
- Pages deploys only the explicit public allowlist;
- APK binaries belong in Release assets, not Git-tracked source;
- administrator bearer tokens remain memory-only.

These constraints outrank convenience.

## Continuous goal execution

For an explicitly authorized objective, continue:
inspect -> implement -> verify -> commit/push working branch -> CI/Pages validation -> inspect failure -> fix -> rerun -> acceptance.

A partial step or failed build/CI/deploy validation is not completion. Do not ask the owner to type "continue" after each reversible iteration.

Focused reversible edits, commits, pushes to the authorized working branch, existing CI runs, and failure-driven fixes may proceed without repeated approval.

## Stop conditions

Request owner input before destructive Git-history operations, credential/permission changes, authentication trust-boundary changes, public deployment not already included in the objective, or changes to the public/private data boundary.

Do not print or persist administrator bearer tokens in logs, artifacts, screenshots, or committed files.

## Verification

Use existing GitHub Actions/Pages workflows as the formal repository gate when present. Inspect actual workflow/job evidence before modifying CI.

Distinguish SOURCE_REVIEW, BUILD_PASS, CI_PASS, PAGES_DEPLOY_PASS, and END_TO_END_PASS. Do not claim a layer that was not actually run.

The objective is complete only when its mandatory acceptance criteria pass or an owner-approved limitation is recorded.
