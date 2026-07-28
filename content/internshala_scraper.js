/* ============================================================
   IT Internship Scraper – content/internshala_scraper.js
   Scrapes internship listings from Internshala.com.
   Extracts: title, company, location, country, apply link,
             stipend, duration, date posted.
   ============================================================ */

if (!window.__internshipInternshala) {
  window.__internshipInternshala = true;

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

  console.log('[InternshipScraper] Internshala scraper ready on', location.href);

  // ─── Main loop ──────────────────────────────────────────────
  async function scrapePages() {
    const maxJobs = cfg.maxLeads || 100;
    let total = 0;
    let pageNum = 0;
    const seenIds = new Set();

    while (running && total < maxJobs) {
      pageNum++;
      notify('statusUpdate', { message: `📄 Internshala — scanning page ${pageNum}…` });

      await pause(2500);

      const jobs = extractJobs(seenIds);

      if (jobs.length === 0 && pageNum === 1) {
        await pause(3000);
        const retry = extractJobs(seenIds);
        if (retry.length === 0) {
          notify('statusUpdate', { message: '⚠️ Internshala: No internships found.' });
          break;
        }
        jobs.push(...retry);
      }

      for (const job of jobs) {
        if (!running || total >= maxJobs) break;
        notify('newLead', { lead: job });
        total++;
        await pause(60);
      }

      notify('pageScraped', { page: pageNum });

      if (!running || total >= maxJobs) break;

      const nextUrl = getNextPageUrl(pageNum);
      if (!nextUrl) {
        notify('statusUpdate', { message: '📄 Internshala: Reached last page.' });
        break;
      }

      notify('statusUpdate', { message: '🔄 Internshala: Loading next page…' });
      window.location.href = nextUrl;
      await pause(30000);
      break;
    }

    running = false;
    notify('scrapingDone', { source: 'internshala' });
  }

  // ─── Extract internship cards ────────────────────────────────
  function extractJobs(seen) {
    const jobs = [];

    // Internshala uses .individual_internship or .internship_meta containers
    const cards = document.querySelectorAll(
      '.individual_internship, [id^="internship_id_"], .internship-list-container .internship_meta'
    );

    for (const card of cards) {
      try {
        // ID for dedup — Internshala puts it on the container element
        const idAttr = card.id || card.getAttribute('internship_id') ||
                       card.closest('[id^="internship_id_"]')?.id || '';
        const jobId = idAttr.replace(/\D/g, '') || generateId(card);

        if (seen.has(jobId)) continue;

        // Title
        const titleEl = card.querySelector('.job-internship-name, h3.job-internship-name, .profile a, h3 a');
        const title = clean(titleEl?.textContent || '');
        if (!title || title.length < 3) continue;

        // Company
        const companyEl = card.querySelector('.company-name, h4.company-name, p.company_name');
        const company = clean(companyEl?.textContent || '');

        // Location
        const locationEl = card.querySelector('.location_link, span.location, .locations a, .location span');
        let rawLocation = '';
        if (locationEl) {
          rawLocation = clean(locationEl.textContent);
        } else {
          // Try data-city attributes
          const cityEls = card.querySelectorAll('[data-city]');
          rawLocation = [...cityEls].map(e => e.getAttribute('data-city')).join(', ');
        }

        // Work from home / Remote check
        const isRemote = /work from home|wfh|remote/i.test(card.textContent);
        if (isRemote && !rawLocation) rawLocation = 'Remote';

        const country = parseCountry(rawLocation, isRemote);

        // Apply link
        const linkEl = card.querySelector('a.job-title-href, h3 a, .job-internship-name a, a[href*="/internship/detail"]');
        let applyLink = '';
        if (linkEl?.href) {
          applyLink = linkEl.href.startsWith('http')
            ? linkEl.href
            : 'https://internshala.com' + linkEl.getAttribute('href');
        }

        // Stipend
        const stipendEl = card.querySelector('.stipend, .stipend_container .stipend, span.stipend');
        const stipend = clean(stipendEl?.textContent || '');

        // Date posted
        const dateEl = card.querySelector('.status-container .date, .posted_by_container, span.posted_on');
        const datePosted = clean(dateEl?.textContent || '');

        seen.add(jobId);
        jobs.push({
          source:      'Internshala',
          title,
          company:     company || '—',
          location:    rawLocation || (isRemote ? 'Remote' : '—'),
          country,
          applyLink,
          stipend:     stipend || '—',
          datePosted:  datePosted || '—',
          dateScraped: today()
        });
      } catch (_) { /* skip */ }
    }

    return jobs;
  }

  // ─── Generate a fallback ID from card text ───────────────────
  function generateId(card) {
    return btoa(unescape(encodeURIComponent(card.textContent.slice(0, 80)))).slice(0, 20);
  }

  // ─── Parse country ────────────────────────────────────────────
  function parseCountry(loc, isRemote) {
    if (isRemote) return 'Remote';
    if (!loc) return 'Unknown';
    const l = loc.toLowerCase();
    if (/\b(bangalore|bengaluru|mumbai|delhi|hyderabad|chennai|pune|india|kolkata|ahmedabad|jaipur|noida|gurgaon|gurugram)\b/.test(l)) return 'India';
    if (/\b(uk|united kingdom|london|manchester|birmingham|edinburgh)\b/.test(l)) return 'United Kingdom';
    if (/\b(us|usa|united states|new york|san francisco|seattle|austin|boston|chicago)\b/.test(l)) return 'United States';
    if (/\b(canada|toronto|vancouver|montreal|calgary)\b/.test(l)) return 'Canada';
    if (/\b(australia|sydney|melbourne|brisbane)\b/.test(l)) return 'Australia';
    if (/\b(germany|berlin|munich|hamburg)\b/.test(l)) return 'Germany';
    if (/\b(singapore)\b/.test(l)) return 'Singapore';
    if (/remote|work from home|wfh/.test(l)) return 'Remote';
    return loc.split(',').pop().trim() || 'Unknown';
  }

  // ─── Next page URL ───────────────────────────────────────────
  function getNextPageUrl(currentPage) {
    // Internshala uses URL structure: /internships/page-N/
    const url = new URL(window.location.href);
    const nextPage = currentPage + 1;

    // Pattern: /internships/computer-science-internship/page-2/
    if (url.pathname.includes('/page-')) {
      return url.href.replace(/\/page-\d+\//, `/page-${nextPage}/`);
    }

    // First page to second
    const path = url.pathname.replace(/\/$/, '');
    return `https://internshala.com${path}/page-${nextPage}/`;
  }

  // ─── Utils ──────────────────────────────────────────────────
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function pause(ms) { return new Promise(r => setTimeout(r, ms)); }
  function today() { return new Date().toLocaleDateString('en-GB'); }
  function notify(type, payload) {
    try { chrome.runtime.sendMessage({ type, ...payload }); } catch (_) {}
  }
}
