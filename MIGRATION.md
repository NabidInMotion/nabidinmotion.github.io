# Brand migration checklist

Move the Study Hub from `NabidAlam/nabidinmotion` to `NabidInMotion/nabidinmotion.github.io` without breaking curriculum auto-sync.

## Architecture after migration

```text
NabidAlam/road-to-machine-learning     ← you still push markdown here (unchanged)
         │ notify-study-hub.yml
         ▼
NabidInMotion/nabidinmotion.github.io  ← sync + deploy → nabidinmotion.github.io
```

## Step 1 — Brand repo on GitHub (you)

1. Log into **NabidInMotion** GitHub account.
2. Repo must exist: **nabidinmotion.github.io** (public).
3. **Settings → Actions → General → Workflow permissions:** **Read and write permissions** (required so deploy can push `gh-pages`).
4. **Settings → Pages → Source:** **GitHub Actions** (after first successful deploy, site live at https://nabidinmotion.github.io).

## Step 2 — Push code from this IDE (automated below)

```powershell
git remote rename origin personal
git remote add origin https://github.com/NabidInMotion/nabidinmotion.github.io.git
git push -u origin main
```

Sign in as **NabidInMotion** when prompted (Windows Credential Manager if needed).

Keep `personal` remote as backup until the brand site is verified.

## Step 3 — Update curriculum dispatch target (critical)

In **NabidAlam/road-to-machine-learning** → Settings → Actions:

| Setting | New value |
|---------|-----------|
| **Variable** `STUDY_HUB_REPO` | `NabidInMotion/nabidinmotion.github.io` |
| **Secret** `STUDY_HUB_DISPATCH_TOKEN` | Fine-grained PAT with **Contents read/write** on the **brand** repo |

Create the PAT on either account; it must trigger workflows on `NabidInMotion/nabidinmotion.github.io`.

CLI (if `gh` is logged in as NabidAlam):

```powershell
gh variable set STUDY_HUB_REPO --repo NabidAlam/road-to-machine-learning --body "NabidInMotion/nabidinmotion.github.io"
```

## Step 4 — Verify Actions on brand repo

1. **Actions → Deploy Study Hub → Run workflow** → site live at https://nabidinmotion.github.io
2. **Actions → Sync curriculum → Run workflow** → content rebuilds and redeploys
3. Push a small `.md` change to `road-to-machine-learning` → notify → sync → deploy (end-to-end)

## Step 5 — Archive old personal Study Hub (optional)

After brand site works:

- Archive **NabidAlam/nabidinmotion** (Settings → Archive) to avoid editing the wrong repo.

Do **not** fork. Do **not** delete `road-to-machine-learning` on personal account.

## Local remotes after migration

```text
origin   → NabidInMotion/nabidinmotion.github.io   (default push)
personal → NabidAlam/nabidinmotion                 (backup / archive)
```

Curriculum submodule URL stays `NabidAlam/road-to-machine-learning` — no change needed.
