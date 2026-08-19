# Above & Beyond — Clinical Assessment Tools

React apps for structured clinical assessments (VB-MAPP Milestones, ANB/OT
Assessment), built to run in the browser and export scored results as
`.txt` reports, `.xlsx` workbooks, and (optionally) submit to a Google
Sheets webhook.

## Local development

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Build for production

```bash
npm run build
npm run preview   # sanity-check the built output locally
```

Output goes to `dist/`.

## Deploying to GitHub Pages

This repo includes `.github/workflows/deploy.yml`, which automatically
builds and deploys to GitHub Pages on every push to `main`. One-time setup:

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push (or re-run the workflow from the **Actions** tab). The site will be
   live at `https://<your-username>.github.io/<repo-name>/`.

## Google Sheets webhook

Each assessment file has a `SHEET_WEBHOOK` constant near the top of the
`.jsx` file. Replace the placeholder with your deployed Google Apps Script
Web App URL to enable "Simpan ke Google Sheets".

## Adding another assessment tool

1. Drop the new `.jsx` file into `src/assessments/`.
2. Import it in `src/App.jsx` and add an entry to the `TOOLS` array.
