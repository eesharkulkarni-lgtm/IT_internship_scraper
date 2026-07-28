const testStrings = [
  "p 35.714285714285715",
  "Contact: 1000000000",
  "Phone: +31 (0) 251 499111",
  "Call 01254264522",
  "Toll Free (800) 247-6455"
];

const r1 = /(?:Phone|Tel|Call|Mobile|Contact|Toll Free|Ph|P)[:\s.-]*(\+?\(?\d[\d\s\-().]{7,18}\d)/i;
const r2 = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;

for (const s of testStrings) {
  let p = '';
  const m1 = s.match(r1);
  if (m1) {
    p = m1[1].trim();
  } else {
    const m2 = s.match(r2);
    if (m2) p = m2[0].trim();
  }
  
  if (p) {
    const stripped = p.replace(/\D/g, '');
    if (stripped.length < 8 || stripped.length > 15) p = '';
    else if (/^(\d)\1+$/.test(stripped)) p = '';
    else if (/^10+$/.test(stripped)) p = '';
    else if (/^1[67]\d{8}$/.test(stripped)) p = ''; // Reject Unix timestamps
    else if (p.includes('.') && p.split('.').length > 3) p = '';
    else if (/\.\d{3,}/.test(p)) p = '';
  }
  
  console.log(`"${s}" -> extracted: "${p}"`);
}
