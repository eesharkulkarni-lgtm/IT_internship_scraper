const isRealEmail = (e) => {
  if (!e || !e.includes('@')) return false;
  const [local, domain] = e.split('@');
  if (!domain) return false;
  if (!/\.[a-zA-Z]{2,6}$/.test(domain)) return false;
  if (/\.(css|js|woff|woff2|ttf|eot|otf|png|jpg|gif|svg|ico|webp|map|json|xml|txt|pdf|html|htm)$/i.test(e)) return false;
  if (local.length < 3) return false;
  if (/noreply|no-reply|unsubscribe|example\.com|sentry|wixpress|wordpress|googleapis|fonts\.|gstatic|cdn\.|assets\.|static\.|media\./i.test(e)) return false;
  if (/^[\d.]+$/.test(domain)) return false;
  return true;
};

const testEmails = [
  "t@asteel.css",
  "system-st@us-counter.css",
  "fonts.gst@ic.com",
  "circles_c@egories.js",
  "ultim@e-post-kit-site.css",
  "investor-rel@ions.html",
  "test@example.com",
  "valid@company.com"
];

for (const e of testEmails) {
  console.log(`${e}: ${isRealEmail(e)}`);
}
