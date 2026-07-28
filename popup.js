/* ============================================================
   IT Internship Scraper – popup.js
   Handles UI, messaging, storage, and Excel export.
   Scrapes Indeed, Internshala, and SimplyHired for IT/AI
   internship listings. Exports sorted by Country to CSV.
   ============================================================ */

'use strict';

// ─── State ────────────────────────────────────────────────────
let jobs    = [];
let stats   = { jobs: 0, pages: 0 };
let running = false;

// Active site tabs being tracked
const activeTabs = {};

// ─── DOM ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const startBtn          = $('startBtn');
const stopBtn           = $('stopBtn');
const exportBtn         = $('exportBtn');
const clearBtn          = $('clearBtn');
const statusDot         = $('statusDot');
const statusText        = $('statusText');
const statusMessage     = $('statusMessage');
const jobsCount         = $('jobsCount');
const pagesCount        = $('pagesCount');
const countriesCount    = $('countriesCount');
const progressBar       = $('progressBar');
const jobsTableBody     = $('jobsTableBody');
const jobsBadge         = $('jobsBadge');
const autoPaginateToggle = $('autoPaginateToggle');

// ─── Site config (URL builders for reference only) ──────────────────────────
const SITE_CONFIG = {
  indeed:      { label: 'Indeed' },
  internshala: { label: 'Internshala' },
  simplyhired: { label: 'SimplyHired' }
};

// ─── Restore saved state ──────────────────────────────────────
chrome.storage.local.get(['jobs', 'stats', 'running'], (r) => {
  jobs    = r.jobs   || [];
  stats   = r.stats  || { jobs: 0, pages: 0 };
  running = r.running || false;

  refreshStats();
  refreshTable();
  if (running)      setRunning(true);
  if (jobs.length)  exportBtn.disabled = false;
});

// ─── Incoming messages from content scripts ───────────────────
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {

    case 'newLead': {
      const job = msg.lead;
      // Deduplicate by apply link
      const isDupe = jobs.some(j =>
        j.applyLink && job.applyLink && j.applyLink === job.applyLink
      );
      if (!isDupe) {
        jobs.push(job);
        stats.jobs = jobs.length;
        refreshStats(true);
        refreshTable();
        exportBtn.disabled = false;
        chrome.storage.local.set({ jobs, stats });
      }
      break;
    }

    case 'pageScraped':
      stats.pages++;
      refreshStats();
      chrome.storage.local.set({ stats });
      break;

    case 'statusUpdate':
      setMsg(msg.message);
      break;

    case 'scrapingDone': {
      // Check if all active sites are done
      const site = msg.source;
      if (site && activeTabs[site]) {
        activeTabs[site].done = true;
      }
      const allDone = Object.values(activeTabs).every(t => t.done);
      if (allDone) {
        setRunning(false);
        setMsg(`✅ Complete — ${jobs.length} internships found.`);
        chrome.storage.local.set({ running: false });
      } else {
        setMsg(`✅ ${site} done — waiting for other sites…`);
      }
      break;
    }
  }
});

// ─── Start ────────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  // Get selected keywords
  const keywords = [...document.querySelectorAll('.role-chip input:checked')]
    .map(c => c.value);
  if (!keywords.length) {
    setMsg('⚠️ Select at least one keyword.');
    return;
  }

  // Get selected sites
  const selectedSites = ['indeed', 'internshala', 'simplyhired']
    .filter(s => document.getElementById('site' + s.charAt(0).toUpperCase() + s.slice(1))?.checked);
  if (!selectedSites.length) {
    setMsg('⚠️ Select at least one site to scrape.');
    return;
  }

  const country      = $('countryFilter').value;
  const maxLeads     = parseInt($('maxLeads').value) || 100;
  const autoPaginate = autoPaginateToggle.checked;
  const perSiteMax   = Math.ceil(maxLeads / selectedSites.length);
  const keywordStr   = keywords.slice(0, 2).join(' OR ');

  const config = {
    keywords:    keywordStr,
    country,
    maxLeads:    perSiteMax,
    autoPaginate
  };

  setRunning(true);
  setMsg(`🚀 Opening ${selectedSites.length} site(s) — scraping will begin shortly…`);
  chrome.storage.local.set({ running: true });

  // ✅ Delegate everything to the background service worker
  // Background handles tab creation, injection, and pagination — works even if popup closes
  chrome.runtime.sendMessage({ type: 'bgStartScraping', sites: selectedSites, config });
});

// ─── Wait for tab to fully load, then inject ─────────────────
function injectWhenReady(tabId, site, cfg, config) {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 40; // 40 × 500ms = 20s

    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) { resolve(); return; }
        if (tab.status === 'complete') {
          injectScraper(tabId, site, cfg, config);
          resolve();
        } else if (attempts++ < maxAttempts) {
          setTimeout(check, 500);
        } else {
          resolve(); // gave up
        }
      });
    };
    setTimeout(check, 2000); // initial delay for page load
  });
}

// ─── Inject scraper into tab ──────────────────────────────────
function injectScraper(tabId, site, cfg, config) {
  // Clear guard so the script can re-run
  chrome.scripting.executeScript({
    target: { tabId },
    func: (guard) => { window[guard] = false; },
    args: [cfg.guard]
  }, () => {
    chrome.scripting.executeScript(
      { target: { tabId }, files: [cfg.script] },
      () => {
        if (chrome.runtime.lastError) {
          setMsg(`⚠️ ${site}: Could not inject script.`);
          return;
        }
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: 'startScraping', config }, (res) => {
            if (chrome.runtime.lastError) {
              setMsg(`⚠️ ${site}: Script not responding — page may still be loading.`);
            } else {
              setMsg(`🔍 Scraping ${site}…`);
            }
          });
        }, 800);
      }
    );
  });
}

// ─── Stop ─────────────────────────────────────────────────────
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'bgStopScraping' });
  setRunning(false);
  setMsg(`⏹ Stopped — ${jobs.length} internships saved.`);
  chrome.storage.local.set({ running: false });
});

// ─── Export ───────────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  if (!jobs.length) { setMsg('No jobs to export yet.'); return; }
  exportToExcel(jobs);
  setMsg(`📥 Exported ${jobs.length} internships — check your Downloads folder.`);
});

// ─── Clear ────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  if (!confirm('Clear all scraped jobs?')) return;
  jobs = []; stats = { jobs: 0, pages: 0 };
  chrome.storage.local.set({ jobs, stats, running: false });
  refreshStats(); refreshTable();
  exportBtn.disabled = true;
  setMsg('Data cleared.');
});

// ─── UI helpers ───────────────────────────────────────────────
function setRunning(active) {
  running = active;
  startBtn.disabled = active;
  stopBtn.disabled  = !active;
  statusDot.classList.toggle('active', active);
  statusText.textContent = active ? 'Scanning' : 'Idle';
}

function setMsg(txt) { statusMessage.textContent = txt; }

function refreshStats(bump = false) {
  const max = parseInt($('maxLeads')?.value) || 100;

  function set(el, val) {
    if (!el) return;
    if (el.textContent !== String(val)) {
      el.textContent = val;
      if (bump) { el.classList.remove('bumping'); void el.offsetWidth; el.classList.add('bumping'); }
    }
  }

  set(jobsCount,  stats.jobs  || 0);
  set(pagesCount, stats.pages || 0);

  // Count unique countries
  const uniqueCountries = new Set(jobs.map(j => j.country).filter(Boolean));
  set(countriesCount, uniqueCountries.size);

  if (jobsBadge) jobsBadge.textContent = stats.jobs || 0;

  const pct = Math.min(((stats.jobs || 0) / max) * 100, 100);
  if (progressBar) progressBar.style.width = pct + '%';
}

function refreshTable() {
  if (!jobs.length) {
    jobsTableBody.innerHTML =
      '<tr><td colspan="4" class="empty-cell">No jobs yet — start scraping above.</td></tr>';
    return;
  }

  // Show most recent 15, newest first
  const recent = jobs.slice(-15).reverse();
  jobsTableBody.innerHTML = recent.map(j => `
    <tr>
      <td title="${x(j.country)}">${x(j.country) || '—'}</td>
      <td title="${x(j.title)}">${x(j.title) || '—'}</td>
      <td title="${x(j.company)}">${x(j.company) || '—'}</td>
      <td title="${x(j.source)}">
        <span style="color:${sourceColor(j.source)};font-weight:600">${x(j.source) || '—'}</span>
      </td>
    </tr>
  `).join('');
}

function sourceColor(source) {
  if (!source) return '#94a3b8';
  const s = source.toLowerCase();
  if (s === 'indeed')      return '#60a5fa';
  if (s === 'internshala') return '#34d399';
  if (s === 'simplyhired') return '#fb923c';
  return '#94a3b8';
}

function x(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Excel Export — CSV format, sorted by Country ─────────────
function exportToExcel(jobsArr) {
  const date = new Date().toISOString().split('T')[0];

  // Sort by Country (A→Z), then by Source, then by Title
  const sorted = [...jobsArr].sort((a, b) => {
    const cA = (a.country || 'Unknown').toLowerCase();
    const cB = (b.country || 'Unknown').toLowerCase();
    if (cA !== cB) return cA < cB ? -1 : 1;
    const sA = (a.source || '').toLowerCase();
    const sB = (b.source || '').toLowerCase();
    if (sA !== sB) return sA < sB ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '');
  });

  // Column definitions
  const COLS = [
    { key: 'country',     label: 'Country' },
    { key: 'location',    label: 'Location (Full)' },
    { key: 'title',       label: 'Job Title' },
    { key: 'company',     label: 'Company' },
    { key: 'source',      label: 'Source Site' },
    { key: 'applyLink',   label: 'Apply Link' },
    { key: 'stipend',     label: 'Stipend / Salary' },
    { key: 'datePosted',  label: 'Date Posted' },
    { key: 'dateScraped', label: 'Date Scraped' }
  ];

  // BOM for Excel UTF-8 compatibility
  let csv = String.fromCharCode(0xFEFF);

  // Header row
  csv += COLS.map(c => `"${c.label}"`).join(',') + '\n';

  // Data rows
  sorted.forEach(job => {
    const row = COLS.map(c => {
      const val = String(job[c.key] || '').replace(/"/g, '""');
      return `"${val}"`;
    });
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  chrome.downloads.download(
    { url, filename: `IT_internships_${date}.csv`, saveAs: false },
    () => URL.revokeObjectURL(url)
  );
}
