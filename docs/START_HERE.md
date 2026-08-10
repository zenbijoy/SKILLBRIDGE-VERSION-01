# SkillBridge Quick Start Guide (Windows)

Welcome to SkillBridge! Follow these steps to get the application running locally on a Windows machine.

## Prerequisites
- Node.js 22 LTS or newer
- A Supabase account (or local Supabase setup)

## 1. Setup Dependencies
From the repository root, run the setup script to install all frontend and backend dependencies:
```cmd
.\SETUP_WINDOWS.cmd
```

## 2. Configure Environment Variables
The setup script automatically creates `.env` files if they didn't exist. You must configure them before starting the app.

### A. Supabase Configuration
Create a new project at [supabase.com](https://supabase.com). Go to Project Settings -> API.

### B. Backend Configuration (`backend/.env`)
Edit `backend/.env` and provide your credentials:
```env
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```
*(Never share the service role key!)*

### C. Frontend Configuration (`frontend/.env`)
Edit `frontend/.env`:
```env
EXPO_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
EXPO_PUBLIC_API_URL="http://localhost:4000/api/v1"
```
*(If testing on a physical Android device, replace `localhost` with your PC's local IP address).*

## 3. Apply Database Migrations
You need to apply the database schema. If you are using the Supabase Cloud, you can use the Supabase CLI, or simply run the provided PowerShell script which uses `psql`:

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
$env:DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-ID].supabase.co:5432/postgres"

.\scripts\setup-database.ps1
```
*(If deploying to production, add `$env:ALLOW_PRODUCTION_MIGRATION="true"`)*

## 4. (Optional) Seed Demo Data
To populate the app with initial skills (JavaScript, Python, React Native, etc.):
```cmd
npm run seed:demo
```

## 5. Start the Application
Run the unified start script from the repository root:
```cmd
.\START_DEV_WINDOWS.cmd
```
This will open two new command prompt windows:
1. **Backend** running on `http://localhost:4000`
2. **Frontend** running the Expo bundler

## 6. Access the App
Open your browser and navigate to the Expo Web URL:
```
http://localhost:8081
```

## 7. Test the App
1. Click **Sign Up** to create a new account.
2. Complete the onboarding process (add skills you know and want to learn).
3. Browse the **Discover** tab to see matches.
4. Explore **Rooms** to join or create study rooms.
