// Service Worker for Web Push（コオロギ）v2: カテゴリ別バッジ集計つき
// 配置: リポジトリのルート（/sw.js）

// ===== バッジ帳簿（IndexedDB） =====
const BDB = 'kcs-badges';
const BSTORE = 'counts';

function bdbOpen() {
  return new Promise(function (res, rej) {
    const r = indexedDB.open(BDB, 1);
    r.onupgradeneeded = function () { r.result.createObjectStore(BSTORE); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}

function badgeGetAll(db) {
  return new Promise(function (res, rej) {
    const store = db.transaction(BSTORE, 'readonly').objectStore(BSTORE);
    const out = {};
    const cur = store.openCursor();
    cur.onsuccess = function (e) {
      const c = e.target.result;
      if (c) { out[c.key] = c.value; c.continue(); } else { res(out); }
    };
    cur.onerror = function () { rej(cur.error); };
  });
}

function badgeSet(db, key, val) {
  return new Promise(function (res, rej) {
    const tx = db.transaction(BSTORE, 'readwrite');
    tx.objectStore(BSTORE).put(val, key);
    tx.oncomplete = function () { res(); };
    tx.onerror = function () { rej(tx.error); };
  });
}

// カテゴリを+1して、アイコンバッジに合計を反映（失敗しても通知は必ず出す）
async function bumpBadge(category) {
  try {
    const db = await bdbOpen();
    const all = await badgeGetAll(db);
    await badgeSet(db, category, (all[category] || 0) + 1);
    const after = await badgeGetAll(db);
    let total = 0;
    for (const k in after) total += after[k];
    if ('setAppBadge' in self.navigator) {
      await self.navigator.setAppBadge(total);
    }
  } catch (e) { /* バッジ失敗は無視 */ }
}

// ===== Push =====
self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '通知', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '通知';
  const options = {
    body: data.body || '',
    data: { url: data.url || '/' },
    requireInteraction: false
  };
  if (data.icon) options.icon = data.icon;
  if (data.badge) options.badge = data.badge;

  event.waitUntil(Promise.all([
    bumpBadge(data.category || 'other'),
    self.registration.showNotification(title, options)
  ]));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
