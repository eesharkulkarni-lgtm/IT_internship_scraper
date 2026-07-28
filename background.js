/* ============================================================
   IT Internship Scraper – background.js  (Service Worker, MV3)
   Handles ALL tab management and script injection so scraping
   continues even when the popup is closed.
   ============================================================ */

'use strict';

// ─── On install / startup ─────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({ jobs: [], stats: { jobs: 0, pages: 0 }, running: false });
    console.log('[InternshipScraper] Installed.');
  }
});



// ─── Badge counter ────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.jobs) {
    const count = (changes.jobs.newValue || []).length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  }
});

// ─── Site configuration ───────────────────────────────────────
const SITE_SCRIPTS = {
  indeed:      'content/indeed_scraper.js',
  internshala: 'content/internshala_scraper.js',
  simplyhired: 'content/simplyhired_scraper.js'
};

const SITE_GUARDS = {
  indeed:      '__internshipIndeed',
  internshala: '__internshipInternshala',
  simplyhired: '__internshipSimplyHired'
};

const SITE_URL_PATTERNS = {
  indeed:      'indeed.com',
  internshala: 'internshala.com',
  simplyhired: 'simplyhired.com'
};

// Track active scraping tabs: { [tabId]: { site, config, injected } }
const scrapingTabs = {};

// Always reset running state when the extension background wakes up/reloads
// in case it was terminated while "running: true" was stuck in storage
chrome.storage.local.set({ running: false });
Object.keys(scrapingTabs).forEach(k => delete scrapingTabs[k]);

// ─── Main message listener ────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Popup asks background to start scraping ────────────────
  if (msg.type === 'bgStartScraping') {
    const { sites, config } = msg;
    startScraping(sites, config);
    sendResponse({ ok: true });
    return true;
  }

  // ── Popup asks background to stop all ─────────────────────
  if (msg.type === 'bgStopScraping') {
    stopAll();
    sendResponse({ ok: true });
    return true;
  }

  // ── Content script: scraping done on this site ────────────
  if (msg.type === 'scrapingDone' && sender.tab) {
    delete scrapingTabs[sender.tab.id];
    // Check if all sites are done
    if (Object.keys(scrapingTabs).length === 0) {
      chrome.storage.local.set({ running: false });
    }
  }

  // ── Badge update ──────────────────────────────────────────
  if (msg.type === 'updateBadge') {
    chrome.action.setBadgeText({ text: String(msg.count) });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  }

  // Forward messages from content scripts to popup
  // (newLead, statusUpdate, pageScraped, scrapingDone)
  const FORWARD = ['newLead', 'statusUpdate', 'pageScraped', 'scrapingDone'];
  if (FORWARD.includes(msg.type)) {
    chrome.runtime.sendMessage(msg).catch(() => {}); // popup may be closed — ignore
  }
});

// ─── Start scraping: open a tab per site ──────────────────────
async function startScraping(sites, config) {
  chrome.storage.local.set({ running: true });

  for (const site of sites) {
    const url = buildUrl(site, config);
    if (!url) continue;

    try {
      const tab = await chrome.tabs.create({ url, active: false });
      scrapingTabs[tab.id] = { site, config, injected: false };
      console.log(`[InternshipScraper] Opened tab ${tab.id} for ${site}: ${url}`);
    } catch (err) {
      console.error(`[InternshipScraper] Failed to open tab for ${site}:`, err);
    }
  }
}

// ─── Build search URL per site ────────────────────────────────
function buildUrl(site, config) {
  const kws     = Array.isArray(config.keywords) ? config.keywords : ['software engineer'];
  const country = config.country  || '';

  // Clean up " intern" or " internship" from our base keywords
  const cleanKws = kws.map(k => k.replace(/\s+intern(ship)?$/i, '').trim());

  if (site === 'indeed') {
    // Indeed supports (A or B)
    const qStr = cleanKws.length > 1 ? `(${cleanKws.slice(0, 3).join(' or ')}) internship` : `${cleanKws[0]} internship`;
    const q    = encodeURIComponent(qStr);
    const loc  = (country && country !== 'Remote') ? encodeURIComponent(country) : '';
    return `https://www.indeed.com/jobs?q=${q}&l=${loc}&sort=date`;
  }
  
  if (site === 'internshala') {
    // Internshala uses strict category slugs. We'll map our keywords to their exact slugs
    const slugMap = {
      'software engineer': 'software-development',
      'ai ml': 'machine-learning',
      'ai / ml': 'machine-learning',
      'data science': 'data-science',
      'frontend': 'front-end-development',
      'backend': 'backend-development',
      'cybersecurity': 'cyber-security',
      'cloud devops': 'cloud-computing',
      'cloud / devops': 'cloud-computing',
      'mobile app': 'mobile-app-development'
    };
    
    const slugs = cleanKws.map(k => slugMap[k.toLowerCase()] || k.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 3);
    const slugStr = slugs.join(',');
    return `https://internshala.com/internships/${slugStr}-internship/`;
  }
  
  if (site === 'simplyhired') {
    // SimplyHired is similar to Indeed
    const qStr = cleanKws.length > 1 ? `(${cleanKws.slice(0, 3).join(' or ')}) intern` : `${cleanKws[0]} intern`;
    const q    = encodeURIComponent(qStr);
    const loc  = (country && country !== 'Remote') ? encodeURIComponent(country) : '';
    return `https://www.simplyhired.com/search?q=${q}&l=${loc}&t=0`;
  }
  
  return null;
}

// ─── Stop all active tabs ─────────────────────────────────────
function stopAll() {
  for (const tabId of Object.keys(scrapingTabs)) {
    chrome.tabs.sendMessage(parseInt(tabId), { action: 'stopScraping' }).catch(() => {});
  }
  Object.keys(scrapingTabs).forEach(k => delete scrapingTabs[k]);
  chrome.storage.local.set({ running: false });
}

// ─── Inject scraper when tab finishes loading ─────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const info = scrapingTabs[tabId];
  if (!info) return;
  if (info.injected) return; // already injected on this load

  const site = info.site;

  // Verify we're on the right site
  if (!tab.url.includes(SITE_URL_PATTERNS[site])) return;

  info.injected = true;
  console.log(`[InternshipScraper] Tab ${tabId} (${site}) loaded — injecting scraper…`);

  const script = SITE_SCRIPTS[site];
  const guard  = SITE_GUARDS[site];
  const config = info.config;

  // Allow re-injection on next page navigation
  setTimeout(() => {
    // Reset guard so script can re-init
    chrome.scripting.executeScript({
      target: { tabId },
      func: (g) => { window[g] = false; },
      args:  [guard]
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn(`[InternshipScraper] Guard reset failed for ${site}:`, chrome.runtime.lastError.message);
        return;
      }

      // Inject the scraper script
      chrome.scripting.executeScript(
        { target: { tabId }, files: [script] },
        () => {
          if (chrome.runtime.lastError) {
            console.warn(`[InternshipScraper] Inject failed for ${site}:`, chrome.runtime.lastError.message);
            return;
          }

          // Send start command after a short delay for the script to initialise
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'startScraping', config }, (res) => {
              if (chrome.runtime.lastError) {
                console.warn(`[InternshipScraper] sendMessage failed for ${site}:`, chrome.runtime.lastError.message);
                // Retry once after 1 more second
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, { action: 'startScraping', config }).catch(() => {});
                }, 1000);
              } else {
                console.log(`[InternshipScraper] ${site} scraping started:`, res);
              }
            });
          }, 1500);
        }
      );
    });
  }, 800);
});

// ─── Re-enable injection on page navigation (pagination) ──────
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  const info = scrapingTabs[tabId];
  if (info) info.injected = false; // reset so we re-inject on next 'complete'
});
