# Running SkillBridge V2.0.1 Locally (Windows)

SkillBridge V2.0.1 is configured for a reproducible, one-step local development experience on Windows.

## Prerequisites
- Node.js v18+ 
- Local Supabase instance running (or a cloud project configured via `.env`).
- Redis (optional, backend will boot without it).
- LiveKit (optional).

## Getting Started

1. **Setup Dependencies**
   Run the following from the root directory to perform a clean install of both frontend and backend dependencies using the exact pinned versions:
   ```cmd
   npm run setup
   ```

2. **Start the Platform**
   To start both the Node.js backend and the Expo Web frontend simultaneously:
   ```cmd
   npm run dev
   ```
   This command will open a new terminal window for the backend, while keeping the Expo bundler running in your current terminal.

3. **Validate Codebase**
   Before committing code, ensure you run the validation suite which executes TypeScript checking, Linting, and Integration tests across both projects:
   ```cmd
   npm run validate
   ```

## Running Individual Environments

- **Frontend Only (Web)**: `npm run web`
- **Frontend Only (Native Bundler)**: `npm run frontend`
- **Backend Only**: `npm run backend`

## Environment Variables
Ensure you have `.env` files located in both the `frontend/` and `backend/` directories. At a minimum, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (backend only) must be present.
