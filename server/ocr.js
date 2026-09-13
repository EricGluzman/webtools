'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { DATA_DIR, OCR_LANGS } = require('./config');

const FILES_DIR = path.join(DATA_DIR, 'files');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');

let sharp = null;
try {
  sharp = require('sharp');
} catch {
  // Optional. Without it we fall back to poppler / the original image.
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, timeout: 180_000, ...opts },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = String(stderr || '');
          return reject(err);
        }
        resolve(String(stdout || ''));
      });
  });
}

async function has(cmd) {
  try {
    await run(cmd, ['--version'], { timeout: 8000 });
    return true;
  } catch (err) {
    // tesseract and friends exit 0 on --version; a missing binary gives ENOENT.
    return err.code !== 'ENOENT';
  }
}

let capabilities = null;
async function detect() {
  if (capabilities) return capabilities;
  const [tesseract, pdftotext, pdftoppm] = await Promise.all([
    has('tesseract'),
    has('pdftotext'),
    has('pdftoppm'),
  ]);
  capabilities = { tesseract, pdftotext, pdftoppm, sharp: Boolean(sharp) };
  return capabilities;
}

/** Read a PDF's embedded text layer. Fast, exact, and free when it exists. */
async function pdfTextLayer(file) {
  try {
    const tmp = path.join(os.tmpdir(), `wt-${Date.now()}.txt`);
    await run('pdftotext', ['-layout', '-q', file, tmp]);
    const text = fs.readFileSync(tmp, 'utf8');
    fs.unlinkSync(tmp);
    return text;
  } catch {
    return '';
  }
}

async function tesseractText(imagePath) {
  const out = path.join(os.tmpdir(), `wt-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await run('tesseract', [imagePath, out, '-l', OCR_LANGS, '--oem', '1', '--psm', '4']);
  const txtFile = `${out}.txt`;
  const text = fs.existsSync(txtFile) ? fs.readFileSync(txtFile, 'utf8') : '';
  if (fs.existsSync(txtFile)) fs.unlinkSync(txtFile);
  return text;
}

/** Grayscale + normalise + upscale small scans: cheap wins for OCR accuracy. */
async function prepareImage(file) {
  if (!sharp) return file;
  try {
    const out = path.join(os.tmpdir(), `wt-prep-${Date.now()}.png`);
    const image = sharp(file).rotate();
    const meta = await image.metadata();
    let pipeline = image.grayscale().normalise();
    const width = meta.width || 0;
    // Upscaling helps small scans; past that it only costs OCR time.
    if (width && width < 1000) pipeline = pipeline.resize({ width: Math.round(width * 2) });
    if (width > 2600) pipeline = pipeline.resize({ width: 2600 });
    await pipeline.sharpen().toFile(out);
    return out;
  } catch {
    return file;
  }
}

async function pdfToImages(file, maxPages) {
  const prefix = path.join(os.tmpdir(), `wt-page-${Date.now()}`);
  await run('pdftoppm', ['-r', '200', '-gray', '-png', '-f', '1', '-l', String(maxPages), file, prefix]);
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(base) && name.endsWith('.png'))
    .sort()
    .map((name) => path.join(dir, name));
}

async function makeThumb(storedName, mime) {
  const source = path.join(FILES_DIR, storedName);
  const target = path.join(THUMBS_DIR, `${storedName}.jpg`);
  const caps = await detect();
  try {
    if (mime === 'application/pdf') {
      if (!caps.pdftoppm) return '';
      const prefix = path.join(os.tmpdir(), `wt-thumb-${Date.now()}`);
      await run('pdftoppm', ['-r', '80', '-jpeg', '-f', '1', '-l', '1', '-scale-to', '640', source, prefix]);
      const dir = path.dirname(prefix);
      const base = path.basename(prefix);
      const page = fs.readdirSync(dir).find((n) => n.startsWith(base));
      if (!page) return '';
      fs.copyFileSync(path.join(dir, page), target);
      fs.unlinkSync(path.join(dir, page));
      return path.basename(target);
    }
    if (sharp) {
      await sharp(source)
        .rotate()
        .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toFile(target);
      return path.basename(target);
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * Pull text out of one stored file.
 * Returns { text, pages, status, error } — never throws.
 */
async function extractText(storedName, mime) {
  const file = path.join(FILES_DIR, storedName);
  const caps = await detect();

  try {
    if (mime === 'application/pdf') {
      let text = caps.pdftotext ? await pdfTextLayer(file) : '';
      if (text.replace(/\s/g, '').length > 80) {
        // pdftotext ends every page with a form feed, trailing one included.
        const pages = text.split('\f').filter((page) => page.trim()).length || 1;
        return { text, pages, status: 'done', error: '' };
      }
      if (!caps.tesseract || !caps.pdftoppm) {
        return {
          text,
          pages: 1,
          status: text ? 'done' : 'unavailable',
          error: text ? '' : 'Install tesseract-ocr and poppler-utils to read scanned PDFs.',
        };
      }
      const images = await pdfToImages(file, 8);
      const chunks = [];
      for (const image of images) {
        chunks.push(await tesseractText(image));
        fs.unlinkSync(image);
      }
      return { text: chunks.join('\n\n'), pages: images.length, status: 'done', error: '' };
    }

    if (!caps.tesseract) {
      return { text: '', pages: 1, status: 'unavailable', error: 'Install tesseract-ocr to read images.' };
    }
    const prepared = await prepareImage(file);
    const text = await tesseractText(prepared);
    if (prepared !== file) fs.unlinkSync(prepared);
    return { text, pages: 1, status: 'done', error: '' };
  } catch (err) {
    return { text: '', pages: 1, status: 'failed', error: err.stderr || err.message || 'OCR failed' };
  }
}

module.exports = { detect, extractText, makeThumb, FILES_DIR, THUMBS_DIR };
