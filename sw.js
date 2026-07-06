// Service Worker for Web Push（コオロギ）
// 配置: リポジトリのルート（/sw.js で配信されること。public/ ではなくルート）
// 理由: Service Worker はルート(/sw.js)で配信しないとアプリ全体を制御できない（スコープの問題）

self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '新しい応募', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '新しい応募';
  const options = {
    body: data.body || '',
    data: { url: data.url || '/' },
    requireInteraction: false
  };
  if (data.icon) options.icon = data.icon;
  if (data.badge) options.badge = data.badge;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // 既に開いているウィンドウがあればそれをフォーカス
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      // なければ新しく開く
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
