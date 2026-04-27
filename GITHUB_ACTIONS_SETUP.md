# Automatic Cloudflare Workers Deployment Setup

Your code is deployed to: **https://foogan.foogan.workers.dev/**

## Setup Instructions

GitHub Actions is now configured to automatically deploy to Cloudflare Workers every time you push to the `main` branch.

### Step 1: Add GitHub Secrets

Go to your GitHub repository settings and add these secrets:

1. **Repository** → **Settings** → **Secrets and variables** → **Actions**

Add the following secrets:

#### `CLOUDFLARE_API_TOKEN`
- Go to Cloudflare Dashboard → Account Profile → API Tokens
- Create a new token with permissions:
  - Account - Cloudflare Workers Scripts - Edit
  - Account - Account Settings - Read
- Copy and paste the token

#### `CLOUDFLARE_ACCOUNT_ID`
- Go to Cloudflare Dashboard → Account Profile → API Tokens
- Copy your **Account ID** (shown at the top)

#### `GEMINI_API_KEY` (optional)
- If your app needs the Gemini API key, add it here

### Step 2: Verify the Workflow

1. Go to your GitHub repository
2. Click **Actions** tab
3. You should see the workflow file: `Deploy to Cloudflare Workers`

### Step 3: Deploy

Simply push to GitHub:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

### Automatic Deployment Process

When you push to `main`, GitHub Actions will:
1. Checkout your code
2. Install dependencies (`npm ci`)
3. Build the project (`npm run build`)
4. Deploy to Cloudflare Workers using `wrangler deploy`

### Check Deployment Status

- **GitHub**: Go to **Actions** tab to see real-time build logs
- **Cloudflare**: Go to Cloudflare Dashboard → Workers → foogan → Deployments

### Troubleshooting

If the workflow fails:
1. Check the **Actions** tab for error logs
2. Make sure all secrets are set correctly
3. Verify your Cloudflare API token has the right permissions

---

**Your live site**: https://foogan.foogan.workers.dev/
