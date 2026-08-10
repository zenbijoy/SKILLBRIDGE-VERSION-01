# Supabase Setup Guide

SkillBridge requires a Supabase PostgreSQL instance to function. You can choose to use either Supabase Cloud (hosted) or a Self-Hosted deployment.

## Mode A: Supabase Cloud

1. Go to [Supabase](https://supabase.com) and create a new project.
2. Note your **Project URL** and **API Keys** (`anon` and `service_role`).
3. Under **Database**, note your **Connection string** (URI).
4. Update your `.env` files with these values.

## Mode B: Self-Hosted Supabase (e.g. VPS or Oracle Cloud)

If you are running Supabase via Docker Compose on a VPS:
1. Ensure your API gateway exposes the REST API securely (usually port 8000).
2. Use your public domain or IP for the API URL: `http://<your-vps-ip>:8000`
3. The PostgreSQL direct connection is typically exposed on port 5432.
4. Update the `.env` files.

### Configuration Considerations (Both Modes)

- **Authentication Redirects**: Go to Authentication -> URL Configuration. Add your frontend URIs (e.g., `exp://...` for Expo Go, `http://localhost:8081` for local web).
- **Storage Buckets**: Ensure `resources`, `avatars` exist if auto-creation fails.
- **JWT Secret**: If self-hosting, ensure your `JWT_SECRET` matches across all services to validate tokens correctly.
