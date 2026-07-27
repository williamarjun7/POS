# Highlands Cafe & Motel Inn POS — Release Process

## Overview

The release process is automated through GitHub Actions. After pushing a version tag,
both Android and Windows builds are produced automatically and attached to a GitHub Release.

## Prerequisites

- [ ] You have push access to the repository
- [ ] GitHub Secrets are configured (see below)
- [ ] You are on the `main` branch with all desired changes committed

## Required GitHub Secrets

| Secret | Required For | Where to Get |
|---|---|---|
| `KEYSTORE_BASE64` | Android APK/AAB signing | Base64 of `highlands-pos-release.keystore` |
| `KEYSTORE_PASSWORD` | Android APK/AAB signing | Keystore password |
| `KEY_ALIAS` | Android APK/AAB signing | Key alias (default: `highlands-pos`) |
| `KEY_PASSWORD` | Android APK/AAB signing | Key password |
| `CAPGO_TOKEN` | Android OTA updates | Capgo dashboard → Settings → API Tokens |
| `VITE_INSFORGE_URL` | Frontend build | InsForge project settings |
| `VITE_INSFORGE_ANON_KEY` | Frontend build | InsForge project settings |
| `VITE_INSFORGE_FUNCTIONS_URL` | Frontend build | InsForge project settings |
| `VITE_FONEPAY_MERCHANT_CODE` | Frontend build | FonePay merchant dashboard |
| `VITE_FONEPAY_API_BASE_URL` | Frontend build | FonePay API docs |
| `WIN_CSC_BASE64` (optional) | Windows code signing | Code signing certificate (`.pfx`/`.p12`) |
| `WIN_CSC_KEY_PASSWORD` (optional) | Windows code signing | Certificate password |

---

## Release Steps

### 1. Prepare the Release

```bash
# Make sure you're on main with latest changes
git checkout main
git pull origin main

# Verify the app builds locally
npm run build
```

### 2. Create the Release

**Option A — One-command release (recommended):**

```bash
# This bumps version, creates tag, pushes everything
npm run release:patch   # 1.0.1 → 1.0.2
# or
npm run release:minor   # 1.0.1 → 1.1.0
# or
npm run release:major   # 1.0.1 → 2.0.0
```

**Option B — Manual step-by-step:**

```bash
# 1. Bump version
npm version patch --no-git-tag-version   # updates package.json only

# 2. Sync Android
node scripts/sync-android-version.mjs

# 3. Commit, tag, push
git add package.json package-lock.json
git commit -m "chore: bump version to $(node -p 'require(\"./package.json\").version')"
git tag v$(node -p 'require(\"./package.json\").version')
git push origin main --tags
```

### 3. Monitor Builds

GitHub Actions will trigger automatically:

1. Go to: https://github.com/williamarjun7/POS/actions
2. Two workflows should start:
   - **Android Release Build** — produces APK + AAB
   - **Windows Desktop Release Build** — produces EXE installer
3. Wait for both to complete (≈10–15 minutes each)

### 4. Publish the Release

1. Go to: https://github.com/williamarjun7/POS/releases
2. Find the draft release (tagged `vX.X.X`)
3. Click **Edit**
4. Add release notes describing changes since last version
5. Remove the `<!-- Add release notes here -->` placeholder
6. Click **Publish release**

---

## Release Checklist

### Before Release

- [ ] All features for this version are complete
- [ ] No known critical bugs
- [ ] Web app builds without errors (`npm run build`)
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Android builds locally (`npm run cap:release`)
- [ ] Windows builds locally (`npm run electron:build`)
- [ ] Version is correct in `package.json`

### Release

- [ ] Version tag created (`vX.X.X`)
- [ ] Tag pushed to GitHub
- [ ] Android Release Build workflow started
- [ ] Windows Desktop Release Build workflow started
- [ ] Both workflows complete successfully

### After Release

- [ ] **APK** — attached to GitHub Release
- [ ] **AAB** — attached to GitHub Release
- [ ] **EXE** — attached to GitHub Release
- [ ] **Capgo** — OTA bundle uploaded for Android
- [ ] Release published (not draft)

### Manual Verification

- [ ] Install Android APK on test device — app opens, login works
- [ ] Install Windows EXE on test machine — app opens, login works
- [ ] Android detects and downloads OTA update (if applicable)
- [ ] Windows detects and downloads EXE update (if applicable)

---

## Version Numbering

```
MAJOR.MINOR.PATCH

MAJOR = breaking changes (2.0.0, 3.0.0)
MINOR = new features   (1.1.0, 1.2.0)
PATCH = bug fixes      (1.0.1, 1.0.2)
```

The Android `versionCode` is derived automatically:

```
MAJOR * 10000 + MINOR * 100 + PATCH
Example: 1.0.1 → 10001
Example: 2.3.4 → 20304
```

---

## Rollback

If a release has a critical bug:

```bash
# 1. Revert the version commit
git revert HEAD --no-edit

# 2. Push the fix
git push origin main

# 3. Delete the bad tag (locally and remote)
git tag -d v1.0.2
git push origin :refs/tags/v1.0.2

# 4. Create a fixed release
npm run release:patch
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm run release:patch` fails with "git not clean" | Commit or stash your changes first |
| Android build fails in CI | Verify `KEYSTORE_BASE64` secret is correct |
| Windows build fails in CI | Check `windows-latest` runner logs — often a missing native dependency |
| Capgo upload fails | Verify `CAPGO_TOKEN` is set in GitHub Secrets |
| Release not created | Check that the tag was pushed: `git push origin --tags` |
