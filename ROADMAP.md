# Upcoming Features & Roadmap

## 1. Custom Domain Setup Guide

Configuration for `amaro.dish.place` connecting to the deployed CloudFront static site:

- **Target Domain**: `amaro.dish.place`
- **ACM Certificate ARN (`us-east-1`)**: `arn:aws:acm:us-east-1:137097288135:certificate/c0a08887-7b7d-42b0-ae14-6b4793014da7`

### Step 1: Request an ACM SSL Certificate (Completed)
- Certificate created and pending/issued for `dish.place` / `*.dish.place` / `amaro.dish.place`.

### Step 2: Wire Domain & Certificate to CloudFront (Configured in CDK)
- Updated [infra/site-stack.ts](infra/site-stack.ts) and [bin/app.ts](bin/app.ts) with `domainNames: ['amaro.dish.place']` and the ACM certificate ARN.

### Step 3: Add DNS Target Record in Route 53
Once the CDK stack deploys (or using your existing CloudFront distribution domain `dxxxxxxxx.cloudfront.net`):
1. Open **Route 53 Console** $\rightarrow$ **Hosted zones** $\rightarrow$ click `dish.place`.
2. Click **Create record**.
3. Set:
   - **Record name**: `amaro`
   - **Record type**: `A`
   - Toggle **Alias**: ON
   - **Route traffic to**: Alias to CloudFront distribution
   - **Choose distribution**: Select your CloudFront distribution (or paste the CloudFront domain name)
4. Click **Create records**.

### Step 4: Update Google OAuth Authorized JavaScript Origins
1. Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Select your OAuth 2.0 Client ID.
3. Add `https://amaro.dish.place` under **Authorized JavaScript origins**.
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
