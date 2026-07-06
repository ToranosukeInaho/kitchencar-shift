// Vercel Serverless Function: Web Push 送信（コオロギ）v2
// 配置: api/send-push.js
// 必要な環境変数(Vercel): SUPA_URL, SUPA_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT
//
// body.staff_ids: 宛先のstaff_id配列（省略時は全購読者に送信）
//   例: { title, body, url, staff_ids: ["3", "12"] }

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
    title: body.title || '通知',
    body: body.body || '',
    url: body.url || '/',
    icon: body.icon
  });

  // 宛先フィルタ（staff_ids配列。英数字・ハイフン・アンダースコアのみ許可）
  let ids = null;
  if (Array.isArray(body.staff_ids)) {
    ids = body.staff_ids
      .map(function (x) { return String(x); })
      .filter(function (x) { return /^[\w-]+$/.test(x); });
    if (ids.length === 0) {
      // 宛先指定されたが有効なIDがない → 誰にも送らない（全員送信への誤爆防止）
      res.status(200).json({ sent: 0, removed: 0, total: 0, note: 'no valid staff_ids' });
      return;
    }
  }

  // 購読を取得
  let subs = [];
  try {
    let url = `${SUPA_URL}/rest/v1/push_subscriptions?select=*`;
    if (ids) {
      url += `&staff_id=in.(${ids.map(encodeURIComponent).join(',')})`;
    }
    const r = await fetch(url, {
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
