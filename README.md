# FreightLeads – LinkedIn Lead Scraper
### Chrome Extension · No external server · Excel export built-in

---

## What it does

FreightLeads is a Chrome Extension that scrapes **LinkedIn People Search** for freight-broker leads across four pre-configured roles:

| Role | Example match |
|------|---------------|
| Logistics Manager | "Senior Logistics Manager – ABC Freight" |
| Sales Manager | "National Sales Manager – 3PL Corp" |
| Shipping Manager | "Shipping & Receiving Manager" |
| Logistics Director | "Director of Logistics Operations" |

Results are exported as a **native Excel file** (`.xls`) — no libraries, no internet required — with the following columns:

> `Niche` · `Person Name` · `Job Title` · `Company Name` · `Location` · `Contact (Email)` · `Contact (Phone)` · `Website` · `LinkedIn URL` · `Date Scraped`

---

## Installation

### Step 1 – Open Chrome Extensions
```
chrome://extensions
```
Enable **Developer Mode** (toggle in the top-right corner).

### Step 2 – Load the Extension
1. Click **"Load unpacked"**
2. Select this folder: `Scrapper_broker_frieght/`
3. The FreightLeads icon will appear in your Chrome toolbar

---

## How to Use

### 1. Search LinkedIn
Open LinkedIn and go to **People Search**. Use the URL format:
```
https://www.linkedin.com/search/results/people/?keywords=logistics+manager&origin=GLOBAL_SEARCH_HEADER
```

You can also use LinkedIn's built-in filters (1st/2nd connections, location, industry, etc.) before scraping.

### 2. Open the Extension Popup
Click the FreightLeads icon in your Chrome toolbar.

### 3. Configure & Start
- ✅ Select target roles (all 4 checked by default)
- Enter your **Niche** (e.g. `Freight Brokerage`, `3PL`, `Drayage`)
- Set **Max Leads** (default: 100)
- Click **▶ Start Scraping**

The extension will:
- Read all visible results on the current search page
- Filter by your selected roles
- Automatically click **Next** to advance through pages
- Show a live counter of leads found

### 4. Export
Click **📥 Export to Excel (.xls)** — the file downloads instantly to your `Downloads` folder.

---

## Contact Info Notes

LinkedIn's contact info (email, phone) is **only visible if**:
- The person has made it public in their profile settings, OR
- You are a 1st-degree connection

The scraper will read whatever LinkedIn exposes publicly. For maximum contact data:
- Use LinkedIn's **connection filters** to search 1st-degree contacts only
- Open a profile and click **"Contact info"** — the scraper reads the modal automatically when you're on a profile page

---

## Tips for Best Results

| Tip | Details |
|-----|---------|
| **Filter by industry** | Use LinkedIn's "Industry" filter before scraping to narrow to logistics/transportation |
| **Filter by location** | Add geography filters to target specific markets |
| **Use Sales Navigator** | Works with Sales Navigator search pages too (same extension) |
| **Slow connection** | Increase page wait time by using `Max Leads: 10` for a first test |
| **LinkedIn rate limits** | If LinkedIn shows a CAPTCHA, pause and try again after 15 minutes |

---

## File Structure

```
Scrapper_broker_frieght/
├── manifest.json            ← Chrome Extension config (Manifest V3)
├── popup.html               ← Extension popup UI
├── popup.css                ← Dark premium styles
├── popup.js                 ← UI logic + Excel export
├── background.js            ← Service worker (storage + badge)
├── content/
│   └── linkedin_scraper.js  ← LinkedIn DOM scraper
└── README.md                ← This file
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot inject script" | Reload the LinkedIn tab and try again |
| No results found | Scroll down on the search page first, then click Start |
| Extension not responding | Go to `chrome://extensions`, click the refresh icon on FreightLeads |
| Empty company column | LinkedIn often shows "Title at Company" combined — check the raw title column |

---

## Legal Notice

This extension operates within your own authenticated LinkedIn session and mimics normal browsing behaviour. LinkedIn's Terms of Service restrict automated scraping. Use responsibly and in compliance with applicable terms and laws. This tool is intended for personal, manual-session use only.
