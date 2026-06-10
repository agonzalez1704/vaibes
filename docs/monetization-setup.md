# Vaibes Monetization Setup Guide

End-to-end checklist for getting $1.99/mo (or $14.99/yr) Pro subscriptions live via App Store Connect + RevenueCat. Run through it in order. Each step is gated by the previous one. Allow ~60–90 min total spread across a couple sessions (some Apple steps require waiting for paperwork to clear).

Once done, paste the values from **Section 9 — What to send me** into a chat message and I'll wire the code.

---

## 1. Apple Small Business Program (5 min, ~24h to take effect)

Cuts Apple's commission from **30% → 15%** on the first $1M/year. Free to enroll.

1. https://developer.apple.com/app-store/small-business-program/enroll/
2. Sign in with the Apple ID that owns the Developer Program (`agonzalez.nrn02@gmail.com`)
3. Read terms → Agree
4. Submit. You'll get a confirmation email within ~24h.

**Why now:** if you publish a subscription before this is approved, you'll pay 30% on the first day's purchases. Costs you nothing to enroll first.

---

## 2. App Store Connect prerequisites (10 min, then 1-3 days for tax/banking)

You probably already did most of this when creating the Vaibes app on ASC, but verify each.

1. https://appstoreconnect.apple.com → **Business** (top nav, may be hidden under **More**)
2. Verify all four are **complete + green**:
   - **Paid Apps Agreement** — accepted
   - **Banking Information** — fill once, no edits possible without a fresh review
   - **Tax Forms** — US: W-9; non-US: W-8BEN. Whatever applies to your tax residency
   - **Contacts** — financial, legal, technical contacts named
3. **Paid Apps** requires all four. If anything's red, fix before continuing. Tax forms can take 1–3 business days to verify.

You **cannot** sell subscriptions until this whole section is green.

---

## 3. Create the subscription products in App Store Connect (15 min)

1. ASC → **Apps → Vaibes → Monetization → Subscriptions** (left nav)
2. Click **+** next to "Subscription Groups" → **Create Subscription Group**
   - **Reference Name:** `Vaibes Pro` (visible only to you)
   - **Localization → English (U.S.)** — Display Name: `Vaibes Pro`

3. Inside the group, click **+** next to "Subscriptions" → **Create Subscription**

   **Monthly product:**
   - **Reference Name:** `Vaibes Pro Monthly`
   - **Product ID:** `vaibes_pro_monthly` ← copy this exactly, no edits later
   - **Duration:** 1 Month
   - **Price (USD):** $1.99 — Apple will auto-fill all other currencies. Spot-check Mexico, EU, UK.
   - **Localization → English (U.S.):**
     - Subscription Display Name: `Pro Monthly`
     - Description: `Unlimited daily vibes, voice playback, full history, all voices. Renews monthly until cancelled.`
   - Save

4. Click **+** again to create the **yearly product:**
   - **Reference Name:** `Vaibes Pro Yearly`
   - **Product ID:** `vaibes_pro_yearly`
   - **Duration:** 1 Year
   - **Price:** $14.99
   - Localization same shape: Display Name `Pro Yearly`, Description with `Save 37% vs monthly.`
   - Save

5. **Subscription Group level — Review Screenshot:**
   ASC requires one screenshot of your paywall to review. Take any screenshot for now (e.g. a mockup) and upload. You can replace later before launch.

6. Status for both will show **"Missing Metadata"** → click each, fill any red field, status flips to **"Ready to Submit"**.

   You do NOT submit them now — they auto-enter review when you submit your first build that references them.

---

## 4. Sandbox tester (5 min)

For testing IAP without real charges.

1. ASC → **Users and Access** → **Sandbox** (left side, under Test) → **Testers**
2. **+** → fill:
   - **Email:** something@yourdomain that is NOT a real Apple ID (e.g. `vaibes-sandbox@yourdomain.com`)
   - Other fields: any plausible values
   - Apple just needs a unique email; doesn't need to be real
3. Save

On the test iPhone:
- Settings → App Store → Sandbox Account → Sign in with the test email above
- DO NOT log out of your real Apple ID for the main App Store
- TestFlight purchases will use this sandbox account automatically

---

## 5. RevenueCat account + project (10 min)

1. https://app.revenuecat.com/signup → use `agonzalez.nrn02@gmail.com`
2. New Project: **Vaibes**
3. Inside the project: **+ Add App** → **iOS**
   - **App Name:** `Vaibes iOS`
   - **Bundle ID:** `com.vaibes.app`
   - Save

---

## 6. Connect RevenueCat to App Store Connect (15 min, requires ASC API key)

We already have an ASC API key at `~/.eas-keys/AuthKey_523F68P2N8.p8` used for EAS submits. You can either:

**Option A — reuse the existing key (simpler):**
- Just give RevenueCat the same Key ID, Issuer ID, and the `.p8` file.

**Option B — create a separate key dedicated to RC (cleaner separation):**
- ASC → **Users and Access → Integrations → App Store Connect API → Team Keys → +**
- Name: `RevenueCat`
- Access: **App Manager**
- Download `.p8`, note Key ID

Then in RevenueCat:

1. RevenueCat dashboard → **Project Settings → Apps → Vaibes iOS**
2. Scroll to **App Store Connect API**
3. Fill:
   - **Issuer ID:** `c5b16b09-90e2-49fc-9889-710811ff7431` (same as eas.json) — or new one for Option B
   - **Key ID:** `523F68P2N8` (or new one) 
   - **Vendor Number:** look up on ASC → Payments and Financial Reports → top of page
   - **Bundle ID:** `com.vaibes.app`
   - **In-App Purchase Key Type:** Team-scoped (default)
   - **Private Key:** paste the contents of the .p8 file (the full `-----BEGIN PRIVATE KEY-----` block)
4. **Save**

RevenueCat will now auto-sync your subscription products from ASC. Within a minute, you should see `vaibes_pro_monthly` and `vaibes_pro_yearly` appear under **Products**.

---

## 7. Define Entitlement + Offering (5 min)

This is the conceptual layer the app code reads.

1. RC → **Entitlements** → **+ New**
   - **Identifier:** `pro`
   - **Display Name:** `Pro`
   - Save
2. Click the entitlement → **Attach Products** → check both `vaibes_pro_monthly` and `vaibes_pro_yearly` → Save

3. RC → **Offerings** → **+ New**
   - **Identifier:** `default`
   - **Display Name:** `Default Offering`
   - Save
4. Inside the offering → **+ Add Package**:
   - Package: **Annual** → Product: `vaibes_pro_yearly`
   - Package: **Monthly** → Product: `vaibes_pro_monthly`
5. Mark this offering as the **Current Offering** (toggle at the top)

---

## 8. Grab the iOS public SDK key (1 min)

1. RC → **Project Settings → API Keys**
2. Copy the **iOS — Public API Key** (starts with `appl_`)

---

## 9. What to send me

Paste this in a chat message and I scaffold the integration:

```
RC_IOS_PUBLIC_KEY=appl_xxxxxxxxxxxxxxxxxxxx
ASC_VENDOR_NUMBER=12345678          (from RC step 6, also visible on ASC Payments page)
SBP_ENROLLED=yes|pending|no
ASC_PAID_APPS_AGREEMENT=signed|pending
PRODUCT_MONTHLY_STATUS=Ready to Submit|other
PRODUCT_YEARLY_STATUS=Ready to Submit|other
```

The two product IDs are already known and hardcoded in code (`vaibes_pro_monthly`, `vaibes_pro_yearly`) so I don't need them from you.

---

## 10. What I'll do once I have those values

1. Migration: `users.subscription_tier` (`free`|`pro`) + `subscription_expires_at`
2. Install `react-native-purchases` + Expo config plugin
3. Hardcode the public key as `EXPO_PUBLIC_RC_IOS_KEY` env var (registered on EAS for prod/preview/dev)
4. Build the paywall component:
   - Toggle between Monthly / Yearly (default Yearly)
   - "Save 37%" badge on Yearly
   - Big purchase button
   - "Restore purchases" + Terms / Privacy links
5. Wire 4 paywall entry points (handle, voice, history scroll, freq modal)
6. Replace hardcoded `IS_PRO = false` with `useCustomerInfo().entitlements.active.pro`
7. RC webhook → InsForge edge function `revenuecat-webhook` updates `users.subscription_tier`
8. Tighten generate-phrase + synthesize-phrase caps to read `tier`
9. Add **Restore Purchases** button in Settings
10. End-to-end sandbox test instructions

---

## 11. Timeline expectation

| Block | Time |
|---|---|
| You do Sections 1–8 | 60–90 min |
| Apple tax/banking processing | up to 3 business days |
| I write the code | ~7 hrs of focused work |
| You sandbox-test | 30 min |
| **Total from now to launching subscriptions** | 4–10 days depending on Apple |

Don't wait on Apple steps to do RC steps — they're independent. You can have RC fully configured while ASC tax forms are still under review.
