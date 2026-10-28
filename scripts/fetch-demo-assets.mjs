// Downloads only this reviewed, fixed list of development reference photographs.
// Run manually; never accepts a URL from a mobile user.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'apps/mobile/assets/photos');
await mkdir(directory, { recursive: true });
const items = [
  ['red-fox', 'Vulpes vulpes (44561825982).jpg'],
  ['caracal', 'Caracal001.jpg'],
  ['eagle-owl', 'Bubo bubo 1 (Martin Mecnarowski).jpg'],
  ['sample-portrait', "Woman's close portrait, 3096664.jpg"],
];
const credits = [];
for (const [id, title] of items) {
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({ action: 'query', format: 'json', titles: `File:${title}`,
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960' }).toString();
  const response = await fetch(api, { headers: { 'User-Agent': 'KinformDevelopment/0.1' } });
  if (!response.ok) throw new Error(`Metadata ${id}: ${response.status}`);
  const body = await response.json();
  const info = Object.values(body.query.pages)[0]?.imageinfo?.[0];
  if (!info) throw new Error(`Missing metadata for ${id}`);
  const meta = info.extmetadata;
  const license = meta.LicenseShortName?.value;
  if (!['CC0', 'CC BY-SA 2.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'CC BY 3.0', 'CC BY 4.0'].includes(license)) {
    throw new Error(`Review license before use: ${id}, ${license}`);
  }
  const source = info.thumburl || info.url;
  const target = path.join(directory, `${id}.jpg`);
  let exists = false;
  try { await access(target); exists = true; } catch { /* new asset */ }
  if (!exists) {
    const download = await fetch(source, { headers: { 'User-Agent': 'KinformDevelopment/0.1' } });
    if (!download.ok) throw new Error(`Download ${id}: ${download.status}`);
    const image = Buffer.from(await download.arrayBuffer());
    if (image[0] !== 0xff || image[1] !== 0xd8) throw new Error(`Not a JPEG: ${id}`);
    await writeFile(target, image);
  }
  credits.push({ id, title, sourcePage: info.descriptionurl, originalUrl: info.url,
    downloadedUrl: source, authorHtml: meta.Artist?.value, license,
    licenseUrl: meta.LicenseUrl?.value, modified: 'Resized by Wikimedia; app displays cropped views.',
    use: id === 'sample-portrait' ? 'Local demo only; not submitted to AI or used for endorsement.' : 'Development catalogue reference',
    checked: '2026-09-06' });
  console.log(`${id}: ${license}`);
}
await writeFile(path.join(directory, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
