# Upcoming Features & Roadmap

## 1. Custom Domain Setup Guide

Steps to connect a custom domain (e.g., `amaro.yourdomain.com` or `yourdomain.com`) to the deployed CloudFront static site:

### Step 1: Request an ACM SSL Certificate
1. Open the **AWS Certificate Manager (ACM)** console in region **US East (N. Virginia) `us-east-1`** (required by CloudFront).
2. Click **Request Certificate** $\rightarrow$ **Public Certificate**.
3. Add your domain name(s) (e.g., `amaro.yourdomain.com` or `yourdomain.com` + `*.yourdomain.com`).
4. Select **DNS Validation** and request.
5. Add the generated CNAME records into your domain registrar's DNS settings to validate domain ownership.

### Step 2: Wire Domain & Certificate to CloudFront
Update `SiteStack` in `infra/site-stack.ts` to attach the domain and certificate:
```ts
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

const certificate = acm.Certificate.fromCertificateArn(
  this,
  'SiteCert',
  'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID'
);

const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
  domainNames: ['amaro.yourdomain.com'],
  certificate,
  // ... rest of distribution configuration ...
});
```

### Step 3: Add DNS Target Record at Registrar
- **Subdomain (`amaro.yourdomain.com`)**: Create a **CNAME** pointing to your CloudFront distribution domain (`dxxxxxxxx.cloudfront.net`).
- **Apex / Root Domain (`yourdomain.com`)**: If using Route 53, create an **A (Alias)** record pointing to CloudFront. If using another DNS provider (Cloudflare, Namecheap, etc.), use **CNAME Flattening / ALIAS / ANAME**.

### Step 4: Update Google OAuth Authorized JavaScript Origins
1. Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Select the OAuth 2.0 Client ID.
3. Add `https://amaro.yourdomain.com` (or `https://yourdomain.com`) under **Authorized JavaScript origins**.
4. Save changes.

---

## 2. Feature Backlog & Ideas

- **"Random Opened Bottle" Button**:
  - Add a button in the UI to randomly pick and highlight / open a modal for an amaro whose status is currently tagged as `opened`.
  - Useful for making a quick after-dinner digestif choice.

- **Batch Bottle Addition (Up to 5 Bottles at Once)**:
  - Allow selecting and uploading photos for up to 5 separate bottles at once.
  - Process the images through Gemini analysis in sequence and present a multi-bottle review/edit workflow so they can be saved to the inventory back-to-back.

- **Remove Sweetness Level**:
  - Evaluate removing the `sweetnessLevel` field across the data model, UI filters, card badges, and forms.
  - Simplify the taxonomy since sweetness is subjective and often captured adequately within tasting notes and botanical descriptions.

- **Compact Amaro Cards with Detail Modal**:
  - Implement a more compact card grid (photo, name, producer, region, ABV, open status) to fit more bottles on screen.
  - Clicking a card opens a full-screen or popup modal showing high-res images, full tasting notes, botanical lists, description, and history.

- **Multi-User Tasting & Sample Tracking**:
  - Expand Google OAuth authentication so any visitor can log in with their Google account.
  - Maintain user-specific tasting logs / personal collection marks (e.g., "Sampled", personal tasting notes, personal star ratings) while keeping bottle inventory management restricted to the admin account.
