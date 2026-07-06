// Vercel Serverless Function: Web Push 送信（コオロギ）
// 配置: api/send-push.js
// 必要な環境変数(Vercel): SUPA_URL, SUPA_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT

const webpush = require('web-push');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const SUPA_URL = process.env.SUPA_URL;
  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!SUPA_URL || !SUPA_SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    res.status(500).json({ error: '環境変数が未設定です' });
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // body のパース（Vercel は通常パース済みだが文字列のこともある）
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const payload = JSON.stringify({
    title: body.title || '新しい応募',
    body: body.body || '',
    url: body.url || '/',
    icon: body.icon
  });

  // 購読を全件取得
  let subs = [];
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/push_subscriptions?select=*`, {
      headers: {
        apikey: SUPA_SERVICE_KEY,
        Authorization: `Bearer ${SUPA_SERVICE_KEY}`
      }
    });
    subs = await r.json();
    if (!Array.isArray(subs)) subs = [];
  } catch (e) {
    res.status(500).json({ error: '購読の取得に失敗', detail: String(e) });
    return;
  }

  let sent = 0;
  let removed = 0;

  await Promise.all(subs.map(async function (sub) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    };
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (err) {
      // 失効した購読(404/410)は削除
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        try {
          await fetch(
            `${SUPA_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
            {
              method: 'DELETE',
              headers: {
                apikey: SUPA_SERVICE_KEY,
                Authorization: `Bearer ${SUPA_SERVICE_KEY}`,
                Prefer: 'return=minimal'
              }
            }
          );
          removed++;
        } catch (e) { /* 削除失敗は無視 */ }
      }
    }
  }));

  res.status(200).json({ sent: sent, removed: removed, total: subs.length });
};
