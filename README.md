# Needle Craft Manager

A web-based database manager for Needle Craft wholesale garments business.

---

## One-time Setup

### 1. Install Node.js
Download and install from https://nodejs.org (choose the LTS version)

### 2. Install dependencies
Open a terminal in this folder and run:
```
npm install
```

### 3. Run the schema in Supabase
- Go to https://supabase.com and open your project
- Click **SQL Editor** in the left sidebar
- Open the file `schema.sql` from this folder
- Paste the entire contents into the SQL editor
- Click **Run**

### 4. Place your CSV files
Create a folder called `csvs` inside this project folder.
Place these 4 files inside it:
- `Firm_Name.csv`
- `Bills.csv`
- `Bill_Det.csv`
- `Bill_Balance.csv`

### 5. Run the migration
```
npm run migrate
```
Follow the prompts in the terminal. You will be asked to confirm product mappings for any ambiguous items. This runs once only.

### 6. Deploy to Vercel
- Push this folder to a GitHub repository
- Go to https://vercel.com and import the repository
- In the Vercel project settings, add these Environment Variables:
  - `SUPABASE_URL` = your Supabase project URL
  - `SUPABASE_SERVICE_KEY` = your Supabase service role key
- Click Deploy

### 7. Set up keep-alive ping (prevents Supabase free tier from pausing)
- Go to https://cron-job.org and create a free account
- Create a new cron job that pings your Supabase URL every 3 days
- URL to ping: `https://YOUR_PROJECT_REF.supabase.co/rest/v1/firms?select=id&limit=1`
- Add header: `apikey: YOUR_SUPABASE_SERVICE_KEY`

---

## Daily Use
Open your Vercel app URL in any browser. No installation needed on other devices.

---

## Backup
Click the **Backup Data** button in the sidebar at any time. A JSON file will download to your device.
