# Automatic Deployment Setup Guide

Your code is now on GitHub at: **https://github.com/barbaarapp/Foogan**

## Step 1: Connect GitHub to Cloudflare Pages

1. Go to **Cloudflare Dashboard** → **Pages**
2. Click on your **foogan** project
3. Go to **Settings** → **Git Integration**
4. Click **Connect Git**
5. Authorize Cloudflare to access your GitHub account
6. Select repository: **barbaarapp/Foogan**
7. Select branch: **main**

## Step 2: Configure Build Settings

In Cloudflare Pages settings, configure:

- **Framework preset**: React
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/` (leave default)

## Step 3: Environment Variables (if needed)

If you have environment variables, add them in:
- **Pages Settings** → **Environment Variables**
- Add any required env vars (e.g., `GEMINI_API_KEY`)

## Step 4: Automatic Deployments

Once connected, every time you push to the `main` branch on GitHub:
```bash
git add .
git commit -m "Your message"
git push origin main
```

Cloudflare will automatically:
1. Build your React app
2. Run `npm run build`
3. Deploy to **https://foogan.pages.dev/**

## Verification

After pushing to GitHub, check:
- **Cloudflare Pages Dashboard** for deployment status
- **GitHub Actions** tab for build logs

Your site is already live at: **https://foogan.pages.dev/**
