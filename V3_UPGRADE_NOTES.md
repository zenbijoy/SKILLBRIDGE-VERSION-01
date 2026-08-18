# SkillBridge V3 Advanced Upgrade Notes

This build upgrades the supplied SkillBridge recovery project while preserving its frontend/backend/admin/Supabase architecture. It intentionally avoids replacing project secrets or `.env` files.

## Recommended branch workflow

Use the companion V3 upgrade package. Its installer checks that the target is a clean Git repository, detects changed base files before overwriting them, creates a dedicated upgrade branch, applies the overlay and runs the offline project audit.

Default branch name: `upgrade/skillbridge-v3-advanced-20260817` (a numeric suffix is added if that name already exists).

After applying the overlay, install dependencies and run the full validation pipeline before merging into `main`.

See `docs/V3_ADVANCED_AUDIT.md` for corrected defects, features and verification limitations.
