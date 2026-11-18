import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { validateOutput } from './validate-output.mjs';
const now = Date.parse('2026-11-18T10:00:00Z');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'iptv-validator-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (p, s) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); };
  put('channels.json', JSON.stringify({ updated_at: now, channels: [{ count: 1 }] }));
  put('test.m3u', '#EXTM3U\n#EXTINF:-1,Test\nhttps://example.com/live\n');
  put('sources/sources.json', JSON.stringify({ sources: { Test: ['https://example.com/live'] } }));
  put('txt/merged.txt', 'Test,https://example.com/live');
  put('index.html', '<html></html>');
  const xml = '<tv><programme start="20261118180000 +0800"></programme></tv>';
  for (const file of ['51zmt', '51zmt_cc', '51zmt_df']) put(`epg/${file}.xml`, xml);
  put('epg/epg_pw.xml.gz', gzipSync(xml));
  put('txt/test.txt', 'Test,https://example.com/live');
  put('tvbox/tvbox.json', JSON.stringify({ lives: [{ name: 'Test', type: 0, url: 'https://example.com/txt/test.txt' }] }));
  return { root, put };
}
test('accepts complete fresh output', t => { const {root} = fixture(t); assert.match(validateOutput(root, now), /Validated/); });
test('rejects stale metadata', t => { const {root, put} = fixture(t); put('channels.json', JSON.stringify({updated_at: now - 86400e3})); assert.throws(() => validateOutput(root, now), /stale/); });
test('rejects swallowed EPG failure', t => { const {root} = fixture(t); rmSync(join(root, 'epg/51zmt.xml')); assert.throws(() => validateOutput(root, now)); });
test('rejects stale EPG', t => { const {root, put} = fixture(t); put('epg/51zmt.xml', '<tv><programme start="20261117180000 +0800"/></tv>'); assert.throws(() => validateOutput(root, now), /current China date/); });
test('rejects empty playlists', t => { const {root, put} = fixture(t); put('test.m3u', '#EXTM3U'); assert.throws(() => validateOutput(root, now), /playlist/); });
test('rejects malformed JSON', t => { const {root, put} = fixture(t); put('sources/sources.json', '{bad'); assert.throws(() => validateOutput(root, now)); });
test('rejects worker code', t => { const {root, put} = fixture(t); put('_worker.js', 'export default {}'); assert.throws(() => validateOutput(root, now), /server-side/); });

test('rejects empty TVBox object', t => { const {root, put} = fixture(t); put('tvbox/tvbox.json', '{}'); assert.throws(() => validateOutput(root, now), /TVBox lives/); });
test('rejects empty TVBox lives', t => { const {root, put} = fixture(t); put('tvbox/tvbox.json', '{"lives":[]}'); assert.throws(() => validateOutput(root, now), /TVBox lives/); });
test('rejects malformed TVBox live', t => { const {root, put} = fixture(t); put('tvbox/tvbox.json', '{"lives":[{}]}'); assert.throws(() => validateOutput(root, now), /live entry/); });
test('rejects nonexistent TVBox TXT', t => { const {root, put} = fixture(t); put('tvbox/tvbox.json', JSON.stringify({lives:[{name:'Test',type:0,url:'https://example.com/txt/missing.txt'}]})); assert.throws(() => validateOutput(root, now), /missing TXT/); });
test('rejects only empty TVBox playlists', t => { const {root, put} = fixture(t); put('txt/test.txt', ''); assert.throws(() => validateOutput(root, now), /nonempty TXT/); });
test('accepts nested encoded names and optional template fields', t => { const {root, put} = fixture(t); put('txt/group/频道.txt', 'Test,https://example.com/live'); put('tvbox/tvbox.json', JSON.stringify({sites:[],custom:'optional',lives:[{name:'频道',type:0,url:'https://example.com/prefix/txt/group/%E9%A2%91%E9%81%93.txt',epg:'https://example.com/{date}/{name}.json'}]})); assert.match(validateOutput(root, now), /Validated/); });
