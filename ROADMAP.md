## Feature Backlog & Ideas

- **Make display order random and only load x number at a time**"
  - It should load only x (20? 25?) bottles at a time, with more loading when you scroll to the bottom.
  - Display order should be random.

- **"Random Opened Bottle" and "Filter By Open Status" Button**:
  - Add a button in the UI to randomly pick and highlight / open a modal for an amaro whose status is currently tagged as `opened`.
  - Add a button in the UI to filter by all bottles that are Not Opened, Opened, or Finished.

- **Remove Sweetness Level**:
  - Evaluate removing the `sweetnessLevel` field across the data model, UI filters, card badges, and forms.
  - Simplify the taxonomy since sweetness is subjective and often captured adequately within tasting notes and botanical descriptions.

- **Compact Amaro Cards with Detail Modal**:
  - Implement a more compact card grid (photo, name, producer, region, ABV, open status) to fit more bottles on screen.
  - Clicking a card opens a full-screen or popup modal showing high-res images, full tasting notes, botanical lists, description, and history.

- **Multi-User Tasting & Sample Tracking**:
  - Expand Google OAuth authentication so any visitor can log in with their Google account.
  - Maintain user-specific tasting logs / personal collection marks (e.g., "Sampled", personal tasting notes, personal star ratings) while keeping bottle inventory management restricted to the admin account.
