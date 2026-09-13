'use strict';

/**
 * Rule-based classification for scanned documents. Everything here works on the
 * OCR text of a single file: no model, no network, no per-file cost.
 */

const TAG_RULES = [
  { tag: 'Hardware', color: 'amber', words: ['hardware', 'screws', 'drill', 'lumber', 'timber', 'paint', 'toolbox', 'home depot', 'lowes', 'ace hardware', 'bauhaus', 'obi', 'leroy merlin', 'plumbing', 'sandpaper', 'nails', 'hammer'] },
  { tag: 'Food', color: 'lime', words: ['grocery', 'groceries', 'supermarket', 'restaurant', 'cafe', 'coffee', 'bakery', 'pizza', 'burger', 'milk', 'bread', 'produce', 'deli', 'lidl', 'aldi', 'tesco', 'rewe', 'kaufland', 'carrefour', 'walmart', 'whole foods', 'trader joe', 'starbucks', 'mcdonald'] },
  { tag: 'Exams', color: 'violet', words: ['exam', 'examination', 'quiz', 'midterm', 'final grade', 'transcript', 'semester', 'syllabus', 'homework', 'assignment', 'gpa', 'diploma', 'certificate of completion', 'university', 'faculty', 'student id', 'course code'] },
  { tag: 'School', color: 'violet', words: ['school', 'teacher', 'parent', 'classroom', 'tuition', 'enrolment', 'enrollment', 'academic year', 'report card', 'timetable'] },
  { tag: 'Medical', color: 'rose', words: ['clinic', 'patient', 'prescription', 'pharmacy', 'diagnosis', 'dental', 'dentist', 'doctor', 'physician', 'lab result', 'blood test', 'vaccination', 'medical'] },
  { tag: 'Utilities', color: 'cyan', words: ['electricity', 'kwh', 'water bill', 'gas bill', 'utility', 'broadband', 'internet service', 'meter reading', 'energy', 'sewage'] },
  { tag: 'Transport', color: 'sky', words: ['uber', 'lyft', 'taxi', 'fuel', 'petrol', 'gasoline', 'diesel', 'parking', 'toll', 'train ticket', 'railway', 'metro', 'bus ticket', 'car wash', 'tire', 'garage'] },
  { tag: 'Travel', color: 'sky', words: ['hotel', 'check-in', 'check out', 'reservation', 'booking', 'flight', 'airline', 'boarding pass', 'itinerary', 'airbnb', 'baggage', 'departure'] },
  { tag: 'Electronics', color: 'blue', words: ['laptop', 'monitor', 'ssd', 'nvme', 'gpu', 'cpu', 'motherboard', 'keyboard', 'mouse', 'headphones', 'smartphone', 'charger', 'newegg', 'best buy', 'ram module'] },
  { tag: 'Software', color: 'indigo', words: ['subscription', 'license key', 'saas', 'renewal', 'monthly plan', 'annual plan', 'github', 'jetbrains', 'adobe', 'microsoft 365', 'netflix', 'spotify', 'domain registration', 'hosting', 'cloud credits'] },
  { tag: 'Finance', color: 'emerald', words: ['bank statement', 'iban', 'swift', 'account balance', 'interest rate', 'loan', 'mortgage', 'transfer', 'credit card statement', 'overdraft'] },
  { tag: 'Taxes', color: 'orange', words: ['tax return', 'income tax', 'vat return', 'irs', 'hmrc', 'w-2', '1099', 'tax year', 'deduction', 'taxable'] },
  { tag: 'Insurance', color: 'teal', words: ['insurance', 'policy number', 'premium', 'coverage', 'insured', 'claim number', 'deductible'] },
  { tag: 'Housing', color: 'amber', words: ['lease', 'rent', 'landlord', 'tenant', 'tenancy', 'security deposit', 'apartment', 'property management'] },
  { tag: 'Warranty', color: 'yellow', words: ['warranty', 'guarantee', 'user manual', 'serial number', 'rma', 'return policy'] },
  { tag: 'Legal', color: 'slate', words: ['agreement', 'contract', 'hereby', 'signature', 'notary', 'terms and conditions', 'party of the first', 'jurisdiction'] },
  { tag: 'Identity', color: 'slate', words: ['passport', 'id card', 'driver license', 'driving licence', 'date of birth', 'nationality', 'social security'] },
  { tag: 'Work', color: 'pink', words: ['payslip', 'salary', 'employer', 'employee id', 'timesheet', 'net pay', 'gross pay', 'employment contract'] },
];

const RECEIPT_WORDS = ['subtotal', 'total', 'cash', 'change due', 'receipt', 'vat', 'tax', 'card ending', 'thank you for your', 'qty', 'item total', 'amount paid'];
const INVOICE_WORDS = ['invoice', 'invoice no', 'bill to', 'due date', 'payment terms', 'purchase order', 'remit to'];

const CURRENCIES = [
  { symbol: '$', code: 'USD' },
  { symbol: '€', code: 'EUR' },
  { symbol: '£', code: 'GBP' },
  { symbol: '₪', code: 'ILS' },
  { symbol: '₴', code: 'UAH' },
  { symbol: '¥', code: 'JPY' },
  { symbol: '₹', code: 'INR' },
  { symbol: 'CHF', code: 'CHF' },
  { symbol: 'PLN', code: 'PLN' },
];

const TOTAL_HINTS = ['grand total', 'total due', 'amount due', 'total amount', 'balance due', 'total paid', 'total', 'sum', 'summe', 'gesamt', 'montant', 'итого', 'всього', 'сума'];

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoDate(y, m, d) {
  if (y < 100) y += y > 60 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Pick the most plausible document date, preferring day-first for ambiguous slashes. */
function findDate(text, dayFirst = true) {
  const candidates = [];
  const labelled = /(?:date|issued|invoice date|datum|дата)\s*[:\-]?\s*/i;

  const numeric = /\b(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})\b/g;
  let match;
  while ((match = numeric.exec(text))) {
    const [raw, a, b, c] = match;
    const n = (v) => parseInt(v, 10);
    let iso = '';
    if (a.length === 4) iso = isoDate(n(a), n(b), n(c));
    else if (n(a) > 12) iso = isoDate(n(c), n(b), n(a));
    else if (n(b) > 12) iso = isoDate(n(c), n(a), n(b));
    else iso = dayFirst ? isoDate(n(c), n(b), n(a)) : isoDate(n(c), n(a), n(b));
    if (iso) {
      const before = text.slice(Math.max(0, match.index - 24), match.index);
      candidates.push({ iso, score: labelled.test(before) ? 3 : 1, at: match.index });
    }
  }

  const named = /\b(\d{1,2})[\s.-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,-]*(\d{2,4})\b/gi;
  while ((match = named.exec(text))) {
    const iso = isoDate(parseInt(match[3], 10), MONTHS[match[2].toLowerCase()], parseInt(match[1], 10));
    if (iso) candidates.push({ iso, score: 2, at: match.index });
  }

  const namedFirst = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})\b/gi;
  while ((match = namedFirst.exec(text))) {
    const iso = isoDate(parseInt(match[3], 10), MONTHS[match[1].toLowerCase()], parseInt(match[2], 10));
    if (iso) candidates.push({ iso, score: 2, at: match.index });
  }

  if (!candidates.length) return '';
  candidates.sort((a, b) => b.score - a.score || a.at - b.at);
  return candidates[0].iso;
}

function parseNumber(raw) {
  let value = raw.replace(/[^\d.,-]/g, '');
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  if (lastComma > lastDot) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else {
    value = value.replace(/,/g, '');
  }
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

/** Total on a receipt: prefer a labelled line, else the largest money-looking figure. */
function findAmount(text) {
  const lines = text.split('\n');
  let best = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const hint = TOTAL_HINTS.find((word) => lower.includes(word));
    if (!hint) continue;
    if (/sub\s*total|total items|total qty|total savings/.test(lower)) continue;
    const numbers = line.match(/[-+]?[\d][\d.,]*\d|\d/g) || [];
    for (const raw of numbers) {
      const value = parseNumber(raw);
      if (value === null || value <= 0 || value > 10_000_000) continue;
      const weight = (hint === 'total' ? 2 : 3) + (value >= 1 ? 1 : 0);
      if (!best || weight > best.weight || (weight === best.weight && value > best.value)) {
        best = { value, weight };
      }
    }
  }
  if (best) return best.value;

  const money = text.match(/[$€£₪₴¥]\s?[-+]?[\d][\d.,]*\d/g) || [];
  const values = money.map((m) => parseNumber(m)).filter((v) => v !== null && v > 0);
  return values.length ? Math.max(...values) : null;
}

function findCurrency(text) {
  for (const { symbol, code } of CURRENCIES) {
    if (text.includes(symbol)) return code;
  }
  const code = text.match(/\b(USD|EUR|GBP|ILS|UAH|PLN|CHF|CAD|AUD|JPY|INR|SEK|NOK|CZK)\b/);
  return code ? code[1] : '';
}

/** The shop or issuer is usually the boldest thing at the top of the page. */
function findVendor(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  let best = null;
  for (const [index, line] of lines.entries()) {
    const clean = line.replace(/[^\p{L}\p{N}&'. -]/gu, '').trim();
    if (clean.length < 3 || clean.length > 42) continue;
    if (!/\p{L}{2}/u.test(clean)) continue;
    if (/^(invoice|receipt|tax invoice|order|date|tel|phone|www\.|http|thank)/i.test(clean)) continue;
    const letters = clean.replace(/[^\p{L}]/gu, '');
    if (!letters) continue;
    const upperRatio = (clean.match(/\p{Lu}/gu) || []).length / letters.length;
    const score = (8 - index) + upperRatio * 4;
    if (!best || score > best.score) best = { name: clean, score };
  }
  return best ? best.name : '';
}

function countHits(haystack, words) {
  let hits = 0;
  for (const word of words) {
    if (haystack.includes(word)) hits += 1;
  }
  return hits;
}

function classify(text, filename = '') {
  const haystack = `${filename}\n${text}`.toLowerCase();
  const tags = [];

  for (const rule of TAG_RULES) {
    const hits = countHits(haystack, rule.words);
    if (hits >= 1) tags.push({ name: rule.tag, color: rule.color, hits });
  }
  tags.sort((a, b) => b.hits - a.hits);

  const receiptHits = countHits(haystack, RECEIPT_WORDS);
  const invoiceHits = countHits(haystack, INVOICE_WORDS);
  let kind = 'document';
  if (invoiceHits >= 2 && invoiceHits >= receiptHits) kind = 'invoice';
  else if (receiptHits >= 2) kind = 'receipt';

  if (kind === 'receipt' && !tags.some((t) => t.name === 'Receipt')) {
    tags.unshift({ name: 'Receipt', color: 'emerald', hits: receiptHits });
  }
  if (kind === 'invoice') {
    tags.unshift({ name: 'Invoice', color: 'emerald', hits: invoiceHits });
  }

  return { kind, tags: tags.slice(0, 5).map(({ name, color }) => ({ name, color })) };
}

/** One pass over the OCR text: tags, kind, vendor, date, total. */
function analyse(text, filename = '') {
  const { kind, tags } = classify(text, filename);
  const money = kind === 'receipt' || kind === 'invoice';
  return {
    kind,
    tags,
    vendor: findVendor(text),
    doc_date: findDate(text),
    amount: money ? findAmount(text) : null,
    currency: money ? findCurrency(text) : '',
  };
}

module.exports = { analyse, classify, findDate, findAmount, findVendor, findCurrency, TAG_RULES };
