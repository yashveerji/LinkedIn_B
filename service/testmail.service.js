import https from 'node:https';
import { URL } from 'node:url';

const TESTMAIL_JSON_ENDPOINT = 'https://api.testmail.app/api/json';

function ensureConfig() {
  const apikey = process.env.TESTMAIL_APIKEY;
  const namespace = process.env.TESTMAIL_NAMESPACE;
  if (!apikey || !namespace) {
    const missing = [];
    if (!apikey) missing.push('TESTMAIL_APIKEY');
    if (!namespace) missing.push('TESTMAIL_NAMESPACE');
    throw new Error(`Missing Testmail config: ${missing.join(', ')}`);
  }
  return { apikey, namespace };
}

export function testmailAddress(tag) {
  const { namespace } = ensureConfig();
  const safeTag = (tag || 'default').toString().trim() || 'default';
  return `${namespace}.${safeTag}@inbox.testmail.app`;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

export async function fetchInbox(params = {}) {
  const { apikey, namespace } = ensureConfig();
  const url = new URL(TESTMAIL_JSON_ENDPOINT);
  url.searchParams.set('apikey', apikey);
  url.searchParams.set('namespace', namespace);

  const allowed = [
    'pretty',
    'headers',
    'spam_report',
    'tag',
    'tag_prefix',
    'timestamp_from',
    'timestamp_to',
    'limit',
    'offset',
    'livequery',
  ];
  for (const key of allowed) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      url.searchParams.set(key, String(params[key]));
    }
  }

  return await getJson(url);
}

export async function waitForEmailByTag(tag, fromTimestamp) {
  const ts = fromTimestamp || Date.now();
  return await fetchInbox({ tag, timestamp_from: ts, livequery: 'true' });
}
