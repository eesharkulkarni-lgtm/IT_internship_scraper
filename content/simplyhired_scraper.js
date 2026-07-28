/* ============================================================
   IT Internship Scraper – content/simplyhired_scraper.js
   Scrapes internship listings from SimplyHired.com.
   Extracts: title, company, location, country, apply link,
             date posted. Handles pagination.
   ============================================================ */

if (!window.__internshipSimplyHired) {
  window.__internshipSimplyHired = true;

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

  console.log('[InternshipScraper] SimplyHired scraper ready on', location.href);

  // ─── Main loop ──────────────────────────────────────────────
  async function scrapePages() {
    const maxJobs = cfg.maxLeads || 100;
    let total = 0;
    let pageNum = 0;
    const seenIds = new Set();

    while (running && total < maxJobs) {
      pageNum++;
      notify('statusUpdate', { message: `📄 SimplyHired — scanning page ${pageNum}…` });

      await pause(2000);

      const jobs = extractJobs(seenIds);

      if (jobs.length === 0 && pageNum === 1) {
        await pause(3000);
        const retry = extractJobs(seenIds);
        if (retry.length === 0) {
          notify('statusUpdate', { message: '⚠️ SimplyHired: No jobs found.' });
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
        notify('statusUpdate', { message: '📄 SimplyHired: Reached last page.' });
        break;
      }

      notify('statusUpdate', { message: '🔄 SimplyHired: Loading next page…' });
      window.location.href = nextUrl;
      await pause(30000);
      break;
    }

    running = false;
    notify('scrapingDone', { source: 'simplyhired' });
  }

  // ─── Extract job cards ───────────────────────────────────────
  function extractJobs(seen) {
    const jobs = [];

    // SimplyHired uses article.SerpJob, div[data-jobkey], OR mirrors Indeed's DOM [data-jk]
    const cards = document.querySelectorAll(
      'article.SerpJob, [data-jobkey], [data-jk], .jobposting-snippet, .chakra-linkbox, li.css-5lfssm, .job_seen_beacon, li[class*="Result"]'
    );

    for (const card of cards) {
      try {
        // Job key for deduplication
        const jobKey = card.getAttribute('data-jobkey') ||
                       card.getAttribute('data-jk') ||
                       card.querySelector('[data-jobkey]')?.getAttribute('data-jobkey') ||
                       card.querySelector('[data-jk]')?.getAttribute('data-jk') ||
                       generateId(card);

        if (seen.has(jobKey)) continue;

        // Title
        const titleEl = card.querySelector(
          'h2[data-testid="searchSerpJobTitle"] a, .jobposting-title, h3.title a, a[data-testid="job-title"], h2.jobTitle span[title], h2.jobTitle span, h2 a span'
        );
        const title = clean(titleEl?.textContent || '');
        if (!title || title.length < 3) continue;

        // Only internship listings
        if (!isInternship(title)) continue;

        // Company
        const companyEl = card.querySelector(
          'span[data-testid="companyName"], .company, .jobposting-company, [data-testid="company-name"], .companyName'
        );
        const company = clean(companyEl?.textContent || '');

        // Location
        const locationEl = card.querySelector(
          'span[data-testid="searchSerpJobLocation"], .jobposting-location, .location, [data-testid="text-location"], .companyLocation'
        );
        const rawLocation = clean(locationEl?.textContent || '');
        const country = parseCountry(rawLocation);

        // Apply link — SimplyHired job detail pages
        const linkEl = card.querySelector(
          'h2[data-testid="searchSerpJobTitle"] a, a[data-testid="job-title"], a.jobposting-title, a[data-jk], h2 a'
        );
        let applyLink = '';
        if (linkEl?.href) {
          applyLink = linkEl.href.startsWith('http')
            ? linkEl.href
            : 'https://www.simplyhired.com' + linkEl.getAttribute('href');
        } else if (card.getAttribute('data-jobkey')) {
          applyLink = `https://www.simplyhired.com/job/${card.getAttribute('data-jobkey')}`;
        }

        // Date posted
        const dateEl = card.querySelector(
          'time, [data-testid="jobAge"], .jobAge, span[datetime]'
        );
        const datePosted = clean(dateEl?.textContent || dateEl?.getAttribute('datetime') || '');

        seen.add(jobKey);
        jobs.push({
          source:      'SimplyHired',
          title,
          company:     company || '—',
          location:    rawLocation || '—',
          country:     country || 'Unknown',
          applyLink,
          datePosted:  datePosted || '—',
          dateScraped: today()
        });
      } catch (_) { /* skip */ }
    }

    return jobs;
  }

  // ─── Internship check ────────────────────────────────────────
  function isInternship(title) {
    return /intern(ship)?|co-?op|placement|trainee|graduate\s+program/i.test(title);
  }

  // ─── Fallback ID ─────────────────────────────────────────────
  function generateId(card) {
    return btoa(unescape(encodeURIComponent(card.textContent.slice(0, 80)))).slice(0, 20);
  }

  // ─── Parse country ────────────────────────────────────────────
  function parseCountry(loc) {
    if (!loc) return 'Unknown';
    const l = loc.toLowerCase();
    if (/remote/i.test(l)) return 'Remote';
    if (/\b(uk|united kingdom|england|scotland|wales|london|manchester)\b/.test(l)) return 'United Kingdom';
    if (/\b(canada|toronto|vancouver|montreal|calgary)\b/.test(l)) return 'Canada';
    if (/\b(australia|sydney|melbourne|brisbane|perth)\b/.test(l)) return 'Australia';
    if (/\b(india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune)\b/.test(l)) return 'India';
    if (/\b(germany|berlin|munich|hamburg|frankfurt)\b/.test(l)) return 'Germany';
    if (/\b(singapore)\b/.test(l)) return 'Singapore';
    if (/\b(netherlands|amsterdam)\b/.test(l)) return 'Netherlands';
    if (/\b(france|paris)\b/.test(l)) return 'France';
    if (/\b(ireland|dublin)\b/.test(l)) return 'Ireland';
    const usStateAbbr = /,\s*([A-Z]{2})\s*$/.exec(loc);
    if (usStateAbbr) return 'United States';
    const usStates = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|United States)\b/i.exec(loc);
    if (usStates) return 'United States';
    return loc.split(',').pop().trim() || 'Unknown';
  }

  // ─── Next page URL ───────────────────────────────────────────
  function getNextPageUrl() {
    // Method 1: direct next link
    const nextEl = document.querySelector('a[data-testid="pagination-next"], a[rel="next"], button[data-testid="pagination-next"]');
    if (nextEl?.href) return nextEl.href;

    // Method 2: build from URL
    const url = new URL(window.location.href);
    const currentPage = parseInt(url.searchParams.get('pn') || '1');
    if (currentPage < 50) {
      url.searchParams.set('pn', String(currentPage + 1));
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
