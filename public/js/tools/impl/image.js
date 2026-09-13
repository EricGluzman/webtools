import { h, mount, panel, split, controls, field, input, select, button, stats, download, toast, dropzone, pickFile } from '../kit.js';
import { formatBytes } from '../../core/dom.js';

export default function (root, ctx) {
  const state = {
    format: ctx.state.format || 'image/webp',
    quality: ctx.state.quality ?? 82,
    maxWidth: ctx.state.maxWidth ?? 1600,
    keepRatio: true,
  };

  let source = null;      // { file, bitmap }
  let outputBlob = null;

  const preview = h('div.image-stage', h('p.small.dim', 'No image loaded yet.'));
  const info = h('div');
  const drop = h('div.dropzone', { onclick: () => choose() },
    h('strong', 'Drop an image here'),
    h('p', 'Everything happens in your browser — the file never leaves this page.')
  );

  dropzone(drop, (files) => load(files[0]));

  async function choose() {
    const [file] = await pickFile({ accept: 'image/*' });
    if (file) load(file);
  }

  async function load(file) {
    if (!file || !file.type.startsWith('image/')) return toast('That is not an image', 'error');
    try {
      const bitmap = await createImageBitmap(file);
      source = { file, bitmap };
      state.maxWidth = Math.min(state.maxWidth, bitmap.width);
      await convert();
    } catch (err) {
      toast(`Could not read that image — ${err.message}`, 'error');
    }
  }

  async function convert() {
    if (!source) return;
    const { bitmap, file } = source;
    const scale = Math.min(1, state.maxWidth / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    outputBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, state.format, state.quality / 100));

    if (!outputBlob) return toast('This browser cannot write that format', 'error');

    const url = URL.createObjectURL(outputBlob);
    mount(preview, h('img', { src: url, alt: 'Converted preview', onload: () => setTimeout(() => URL.revokeObjectURL(url), 5000) }));

    const change = ((outputBlob.size - file.size) / file.size) * 100;
    mount(info, stats([
      { label: 'Original', value: formatBytes(file.size) },
      { label: 'Result', value: formatBytes(outputBlob.size) },
      { label: 'Change', value: `${change > 0 ? '+' : ''}${change.toFixed(0)}%` },
      { label: 'Size', value: `${width}×${height}` },
      { label: 'Was', value: `${bitmap.width}×${bitmap.height}` },
    ]));
  }

  const qualityRow = h('div.field.grow',
    h('span.label', 'Quality'),
    input({
      type: 'range',
      min: '30',
      max: '100',
      value: String(state.quality),
      oninput: (value, node) => {
        state.quality = Number(value);
        node.nextElementSibling.textContent = `${state.quality}%`;
        ctx.save({ quality: state.quality });
        convert();
      },
    }),
    h('small.dim', `${state.quality}%`));

  const widthRow = h('div.field.grow',
    h('span.label', 'Maximum width'),
    input({
      type: 'number',
      min: '32',
      max: '8000',
      value: String(state.maxWidth),
      oninput: (value) => {
        state.maxWidth = Math.max(32, Number(value) || 32);
        ctx.save({ maxWidth: state.maxWidth });
        convert();
      },
    }));

  mount(root,
    drop,
    split(
      panel('Preview', {
        actions: [
          button('Choose file', { iconName: 'upload', onclick: choose }),
          button('Download', {
            iconName: 'download',
            variant: 'btn-primary',
            onclick: () => {
              if (!outputBlob || !source) return toast('Load an image first', 'error');
              const extension = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[state.format];
              const base = source.file.name.replace(/\.[^.]+$/, '');
              download(`${base}.${extension}`, outputBlob);
            },
          }),
        ],
      }, preview),
      panel('Output settings', {},
        controls(
          field('Format', select([
            { value: 'image/webp', label: 'WebP' },
            { value: 'image/jpeg', label: 'JPEG' },
            { value: 'image/png', label: 'PNG (lossless)' },
          ], state.format, (value) => {
            state.format = value;
            ctx.save({ format: value });
            qualityRow.classList.toggle('hidden', value === 'image/png');
            convert();
          }))),
        widthRow,
        qualityRow,
        info),
      { ratio: '1.15fr .85fr' }
    )
  );

  qualityRow.classList.toggle('hidden', state.format === 'image/png');
}
