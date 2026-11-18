import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

export function validateOutput(root, now = Date.now()) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      assert(!entry.isSymbolicLink(), `Symlink not permitted: ${rel}`);
      if (entry.isDirectory()) walk(join(dir, entry.name), rel + '/');
      else { assert(statSync(join(root, rel)).size <= 25 * 1024 * 1024, `File exceeds 25 MiB: ${rel}`); files.push(rel); }
    }
  }
  walk(root);
  // Static-only deployment: never upload server-side executable code.
  assert(!files.some(p => p === '_worker.js' || p.startsWith('_worker.js/') || p.startsWith('functions/')), 'Unexpected server-side code');
  const channels = JSON.parse(read('channels.json'));
  assert(Number.isFinite(channels.updated_at) && now - channels.updated_at < 6 * 3600e3 && channels.updated_at <= now + 300e3, 'Missing or stale channels.json');
  assert(Array.isArray(channels.channels) && channels.channels.some(c => c.count > 0), 'No channels');
  const playlists = files.filter(p => p.endsWith('.m3u'));
  assert(playlists.some(p => { const s = read(p); return s.startsWith('#EXTM3U') && s.includes('#EXTINF:') && /^(https?|rtsp|rtmp|udp):\/\//m.test(s); }), 'No usable M3U playlist');
  const sources = JSON.parse(read('sources/sources.json')).sources;
  assert(sources && Object.values(sources).some(v => Array.isArray(v) && v.some(x => typeof x === 'string' && x.length > 0)), 'Empty merged sources');
  assert(read('txt/merged.txt').trim().length > 0, 'Empty merged TXT');
  assert(read('index.html').includes('<html'), 'Missing static index');
  const today = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).replaceAll('-', '');
  for (const p of ['epg/51zmt.xml', 'epg/51zmt_cc.xml', 'epg/51zmt_df.xml', 'epg/epg_pw.xml.gz']) {
    const xml = p.endsWith('.gz') ? gunzipSync(readFileSync(join(root, p))).toString() : read(p);
    assert(/<tv[\s>]/.test(xml) && xml.includes('</tv>'), `Invalid XMLTV envelope: ${p}`);
    assert(new RegExp(`<programme\\b[^>]*\\bstart=["']${today}\\d{6}`).test(xml), `No programmes for current China date: ${p}`);
  }
  const tvbox = files.filter(p => p.startsWith('tvbox/') && p.endsWith('.json'));
  assert(tvbox.length > 0, 'Missing TVBox output');
  for (const p of tvbox) JSON.parse(read(p));
  // Source currently writes this public endpoint. Other template fields are
  // intentionally unconstrained; remote templates can add optional fields.
  const config = JSON.parse(read('tvbox/tvbox.json'));
  assert(config && Array.isArray(config.lives) && config.lives.length > 0, 'Missing or empty TVBox lives');
  let hasUsableLive = false;
  for (const live of config.lives) {
    assert(live && typeof live.name === 'string' && live.name.trim() && live.type === 0 && typeof live.url === 'string', 'Invalid TVBox live entry');
    let url;
    try { url = new URL(live.url); } catch { throw new Error('Invalid TVBox live URL'); }
    assert(['http:', 'https:'].includes(url.protocol), 'Invalid TVBox live URL protocol');
    // Match nested output filenames without assuming a specific site domain.
    const marker = url.pathname.lastIndexOf('/txt/');
    assert(marker >= 0 && url.pathname.endsWith('.txt'), 'TVBox live must reference generated TXT');
    const relative = decodeURIComponent(url.pathname.slice(marker + 1));
    assert(files.includes(relative), `TVBox references missing TXT: ${relative}`);
    if (read(relative).trim()) hasUsableLive = true;
  }
  assert(hasUsableLive, 'TVBox lives contain no nonempty TXT playlists');
  return `Validated ${files.length} files, ${playlists.length} playlists, fresh channel metadata and all four EPG feeds.`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(validateOutput(process.argv[2] || 'source/m3u'));
}
