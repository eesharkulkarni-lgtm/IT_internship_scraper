/* ============================================================
   IT Internship Scraper – content/indeed_scraper.js
   Scrapes internship job listings from Indeed search results.
   Extracts: title, company, location, country, apply link,
             date posted. Handles multi-page pagination.
   ============================================================ */

if (!window.__internshipIndeed) {
  window.__internshipIndeed = true;

  let running = false;
  let cfg = {};

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'startScraping') {
      if (running) { sendResponse({ status: 'already_running' }); return true; }
      cfg = msg.config || {};
      running = true;
      sendResponse({ status: 'started' });
      scrapePages();
    } else if (msg.action === 'stopScraping') {
      running = false;
      sendResponse({ status: 'stopped' });
    } else if (msg.action === 'ping') {
      sendResponse({ status: 'ready' });
    }
    return true;
  });

  console.log('[InternshipScraper] Indeed scraper ready on', location.href);

  // ─── Main loop ──────────────────────────────────────────────
  async function scrapePages() {
    const maxJobs = cfg.maxLeads || 100;
    let total = 0;
    let pageNum = 0;
    const seenIds = new Set();

    while (running && total < maxJobs) {
      pageNum++;
      notify('statusUpdate', { message: `📄 Indeed — scanning page ${pageNum}…` });

      await pause(2000); // let the page fully render

      const jobs = extractJobs(seenIds);

      if (jobs.length === 0 && pageNum === 1) {
        await pause(3000); // retry once
        const retry = extractJobs(seenIds);
        if (retry.length === 0) {
          notify('statusUpdate', { message: '⚠️ Indeed: No jobs found on this page.' });
          break;
        }
        jobs.push(...retry);
      }

      for (const job of jobs) {
        if (!running || total >= maxJobs) break;
        notify('newLead', { lead: job });
        total++;
        await pause(80);
      }

      notify('pageScraped', { page: pageNum });

      if (!running || total >= maxJobs) break;

      const nextUrl = getNextPageUrl();
      if (!nextUrl) {
        notify('statusUpdate', { message: '📄 Indeed: Reached last page.' });
        break;
      }

      notify('statusUpdate', { message: '🔄 Indeed: Loading next page…' });
      window.location.href = nextUrl;
      await pause(30000); // navigation will interrupt this
      break;
    }

    running = false;
    notify('scrapingDone', { source: 'indeed' });
  }

  // ─── Extract job cards from current page ────────────────────
  function extractJobs(seen) {
    const jobs = [];

    // Strategy 1: cards with data-jk (most reliable Indeed identifier)
    // Strategy 2: any li that contains a link with /rc/clk or /viewjob
    // Strategy 3: broad sweep for job title h2 elements
    let cards = [...document.querySelectorAll('[data-jk]')];

    // Fallback: grab all job result list items
    if (cards.length === 0) {
      cards = [...document.querySelectorAll(
        'li.css-5lfssm, li.job_seen_beacon, .resultWithShelf, .jobCard_mainContent, div[class*="job_seen"], li[class*="Result"]'
      )];
    }

    // Last resort: find all job title h2 links and walk up to the card
    if (cards.length === 0) {
      const titleLinks = document.querySelectorAll('h2 a[href*="/rc/clk"], h2 a[href*="viewjob"]');
      cards = [...titleLinks].map(a => {
        let el = a;
        for (let i = 0; i < 8; i++) {
          el = el.parentElement;
          if (!el) break;
          if (el.tagName === 'LI') return el;
        }
        return a.closest('li') || a.parentElement;
      }).filter(Boolean);
    }

    for (const card of cards) {
      try {
        // --- Job ID ---
        const jobId =
          card.getAttribute('data-jk') ||
          card.querySelector('[data-jk]')?.getAttribute('data-jk') ||
          (() => {
            const link = card.querySelector('a[href*="jk="], a[href*="/rc/clk"]');
            if (!link) return null;
            try {
              const u = new URL(link.href, location.origin);
              return u.searchParams.get('jk') || u.pathname.split('/').pop();
            } catch { return null; }
          })();

        if (!jobId || seen.has(jobId)) continue;

        // --- Title: try multiple selectors ---
        const titleEl =
          card.querySelector('h2.jobTitle span[title]') ||
          card.querySelector('h2.jobTitle span') ||
          card.querySelector('.jobTitle a span') ||
          card.querySelector('h2 a span') ||
          card.querySelector('h2 span[id^="jobTitle"]') ||
          card.querySelector('[class*="jobTitle"] span') ||
          card.querySelector('h2');

        const title = clean(
          titleEl?.getAttribute('title') ||
          titleEl?.textContent ||
          ''
        );
        if (!title || title.length < 3) continue;

        // Only internships
        if (!isInternship(title)) continue;

        // --- Company ---
        const companyEl =
          card.querySelector('[data-testid="company-name"]') ||
          card.querySelector('.companyName') ||
          card.querySelector('span.companyName') ||
          card.querySelector('[class*="companyName"]') ||
          card.querySelector('a[data-tn-element="companyName"]');

        const company = clean(companyEl?.textContent || '');

        // --- Location ---
        const locationEl =
          card.querySelector('[data-testid="text-location"]') ||
          card.querySelector('.companyLocation') ||
          card.querySelector('[class*="companyLocation"]') ||
          card.querySelector('[class*="location"]');

        const rawLocation = clean(locationEl?.textContent || '');
        const country = parseCountry(rawLocation);

        // --- Apply link ---
        const linkEl =
          card.querySelector('a[data-jk]') ||
          card.querySelector('h2 a') ||
          card.querySelector('a[href*="/rc/clk"]') ||
          card.querySelector('a[href*="viewjob"]') ||
          card.querySelector('a[href*="jk="]');

        let applyLink = '';
        if (linkEl?.href) {
          try {
            const u = new URL(linkEl.href, location.origin);
            const jk = u.searchParams.get('jk') || jobId;
            applyLink = `https://www.indeed.com/viewjob?jk=${jk}`;
          } catch { applyLink = linkEl.href; }
        } else {
          applyLink = `https://www.indeed.com/viewjob?jk=${jobId}`;
        }

        // --- Date posted ---
        const dateEl =
          card.querySelector('[data-testid="myJobsStateDate"]') ||
          card.querySelector('span.date') ||
          card.querySelector('[class*="date"]');

        const datePosted = clean(dateEl?.textContent || '');

        seen.add(jobId);
        jobs.push({
          source:      'Indeed',
          title,
          company:     company || '—',
          location:    rawLocation || '—',
          country:     country || 'Unknown',
          applyLink,
          datePosted:  datePosted || '—',
          dateScraped: today()
        });
      } catch (_) { /* skip malformed card */ }
    }

    return jobs;
  }

  // ─── Check if title is an internship ────────────────────────
  function isInternship(title) {
    return /intern(ship)?|co-?op|placement|trainee|graduate\s+program/i.test(title);
  }

  // ─── Parse country from location string ─────────────────────
  function parseCountry(loc) {
    if (!loc) return 'Unknown';
    const l = loc.toLowerCase();
    if (/remote/i.test(l)) return 'Remote';
    if (/\b(uk|united kingdom|england|scotland|wales|london)\b/i.test(l)) return 'United Kingdom';
    if (/\b(canada|ontario|british columbia|alberta|toronto|vancouver)\b/i.test(l)) return 'Canada';
    if (/\b(australia|sydney|melbourne|brisbane|perth)\b/i.test(l)) return 'Australia';
    if (/\b(india|bangalore|bengaluru|mumbai|delhi|hyderabad|chennai|pune)\b/i.test(l)) return 'India';
    if (/\b(germany|berlin|munich|hamburg|frankfurt)\b/i.test(l)) return 'Germany';
    if (/\b(singapore)\b/i.test(l)) return 'Singapore';
    if (/\b(netherlands|amsterdam)\b/i.test(l)) return 'Netherlands';
    if (/\b(france|paris)\b/i.test(l)) return 'France';
    if (/\b(ireland|dublin)\b/i.test(l)) return 'Ireland';
    // US: state abbreviation like ", CA" or full state name
    const usStateAbbr = /,\s*([A-Z]{2})\s*$/.exec(loc);
    if (usStateAbbr) return 'United States';
    const usStates = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|United States)\b/i.exec(loc);
    if (usStates) return 'United States';
    return loc.split(',').pop().trim() || 'Unknown';
  }

  // ─── Next page URL ───────────────────────────────────────────
  function getNextPageUrl() {
    const next = document.querySelector('a[data-testid="pagination-page-next"], a[aria-label="Next Page"]');
    if (next?.href) return next.href;

    // Build manually from current URL
    const url = new URL(window.location.href);
    const currentStart = parseInt(url.searchParams.get('start') || '0');
    if (currentStart < 990) {
      url.searchParams.set('start', String(currentStart + 10));
      return url.toString();
    }
    return null;
  }

  // ─── Utils ──────────────────────────────────────────────────
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function pause(ms) { return new Promise(r => setTimeout(r, ms)); }
  function today() { return new Date().toLocaleDateString('en-GB'); }
  function notify(type, payload) {
    try { chrome.runtime.sendMessage({ type, ...payload }); } catch (_) {}
  }
}
