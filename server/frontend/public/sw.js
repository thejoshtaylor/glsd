// GLSD Service Worker -- Push Notifications
// Version: 1.0.0

var CACHE_NAME = 'glsd-offline-v1';
var OFFLINE_URL = '/offline.html';

// D-01: Action buttons for permission requests
var ACTIONS_APPROVE_DENY = [
  { action: 'approve', title: 'Approve' },
  { action: 'deny', title: 'Deny' },
];

// Store auth tokens from push payloads for action button API calls
var _pushTokens = {};

// --- Push Event (D-01, D-02, D-03) ---
self.addEventListener('push', function (event) {
  if (!event.data) return;

  var data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('SW: Failed to parse push data', e);
    return;
  }

  // Store token for action button use (Pitfall 2: SW auth via payload token)
  if (data.requestId && data.token) {
    _pushTokens[data.requestId] = data.token;
  }

  var title = '';
  var options = {};

  if (data.type === 'permissionRequest') {
    // D-02: urgency-styled permission notification
    title = 'Approval needed';
    options = {
      body: (data.toolName || 'Tool') + ' on ' + (data.projectName || 'project'),
      tag: 'session-' + data.sessionId + '-perm',  // D-03: deduplication
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: {
        type: data.type,
        sessionId: data.sessionId,
        requestId: data.requestId,
      },
      actions: ACTIONS_APPROVE_DENY,  // D-01: inline action buttons
      requireInteraction: true,
    };
  } else if (data.type === 'taskComplete') {
    // D-02: informational completion notification
    title = 'Session finished';
    options = {
      body: (data.projectName || 'Project') + ' \u00B7 $' + (data.costUsd || '0.00'),
      tag: 'session-' + data.sessionId + '-done',  // D-03: deduplication
      icon: '/icons/icon-192.png',
      data: {
        type: data.type,
        sessionId: data.sessionId,
      },
    };
  } else {
    return; // Unknown type, skip
  }

  // Pitfall 5: Always wrap in waitUntil
  event.waitUntil(self.registration.showNotification(title, options));
});

// --- Notification Click (D-01, D-04) ---
self.addEventListener('notificationclick', function (event) {
  var action = event.action;
  var notifData = event.notification.data || {};
  var type = notifData.type;
  var sessionId = notifData.sessionId;
  var requestId = notifData.requestId;
  event.notification.close();

  if (type === 'permissionRequest' && (action === 'approve' || action === 'deny')) {
    // D-01: Service worker calls backend API directly
    var token = _pushTokens[requestId];
    if (!token) {
      event.waitUntil(
        self.registration.showNotification('Action failed', {
          body: 'Auth token expired. Open the app to respond.',
          tag: 'session-' + sessionId + '-error',
        })
      );
      return;
    }

    event.waitUntil(
      fetch('/api/v1/push/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          session_id: sessionId,
          request_id: requestId,
          approved: action === 'approve',
        }),
      }).then(function (res) {
        // D-04: Auto-dismiss on success (notification already closed above)
        delete _pushTokens[requestId];
        if (!res.ok) {
          // D-04: Show error replacement notification on failure
          return self.registration.showNotification('Action failed', {
            body: 'Could not send response. Open the app to retry.',
            tag: 'session-' + sessionId + '-error',
          });
        }
      }).catch(function () {
        return self.registration.showNotification('Action failed', {
          body: 'Network error. Open the app to retry.',
          tag: 'session-' + sessionId + '-error',
        });
      })
    );
  } else {
    // Tapping notification body opens app to session page (D-01)
    event.waitUntil(
      clients.openWindow('/sessions/' + sessionId)
    );
  }
});

// --- Offline Fallback (D-05) ---
self.addEventListener('fetch', function (event) {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match(OFFLINE_URL);
      })
    );
  }
});

// --- Install: cache offline page, skip waiting (Pitfall 6) ---
self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.add(OFFLINE_URL);
    })
  );
});

// --- Activate: claim clients ---
self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});
