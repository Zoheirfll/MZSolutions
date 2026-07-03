// Epic 8.3 — injection des scripts de pixels marketing (Facebook, TikTok,
// Google Analytics, Google Tag Manager) sur la boutique publique, et envoi
// des événements standards (PageView, AddToCart, InitiateCheckout, Purchase).
// Aucune clé API serveur nécessaire — ce sont de purs scripts client qui
// communiquent directement avec chaque plateforme depuis le navigateur.

// Mappe nos noms d'événements internes vers le nom attendu par chaque
// plateforme (les conventions diffèrent : Facebook/TikTok utilisent
// PascalCase, GA4 utilise snake_case).
const EVENT_MAP = {
  PageView:          { facebook: 'PageView',          tiktok: 'ViewContent',      ga: 'page_view' },
  AddToCart:         { facebook: 'AddToCart',          tiktok: 'AddToCart',        ga: 'add_to_cart' },
  InitiateCheckout:  { facebook: 'InitiateCheckout',   tiktok: 'InitiateCheckout', ga: 'begin_checkout' },
  Purchase:          { facebook: 'Purchase',           tiktok: 'CompletePayment',  ga: 'purchase' },
}

let loadedFor = null // slug déjà initialisé, évite de réinjecter les scripts à chaque changement de page

function injectScript(id, src, inline) {
  if (document.getElementById(id)) return
  const script = document.createElement('script')
  script.id = id
  if (src) script.src = src
  if (inline) script.innerHTML = inline
  script.async = true
  document.head.appendChild(script)
}

function loadFacebookPixel(pixelId) {
  if (window.fbq) { window.fbq('init', pixelId); return }
  injectScript('mz-fb-pixel-base', null, `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
  `)
}

function loadTikTokPixel(pixelId) {
  if (window.ttq) { window.ttq.load(pixelId); return }
  injectScript('mz-tiktok-pixel-base', null, `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${pixelId}');
      ttq.page();
    }(window, document, 'ttq');
  `)
}

function loadGoogleAnalytics(measurementId) {
  if (window.gtag) { window.gtag('config', measurementId); return }
  injectScript('mz-ga-base', `https://www.googletagmanager.com/gtag/js?id=${measurementId}`)
  injectScript('mz-ga-init', null, `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${measurementId}');
  `)
}

function loadGoogleTagManager(containerId) {
  if (document.getElementById('mz-gtm-base')) return
  injectScript('mz-gtm-base', null, `
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
    var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
    j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${containerId}');
  `)
}

/** Charge les scripts pour chaque pixel actif de la boutique (une fois par slug). */
export function loadPixelScripts(slug, pixels) {
  if (!pixels || pixels.length === 0 || loadedFor === slug) return
  loadedFor = slug
  for (const p of pixels) {
    try {
      if (p.pixel_type === 'facebook') loadFacebookPixel(p.pixel_id)
      else if (p.pixel_type === 'tiktok') loadTikTokPixel(p.pixel_id)
      else if (p.pixel_type === 'google_analytics') loadGoogleAnalytics(p.pixel_id)
      else if (p.pixel_type === 'google_tag_manager') loadGoogleTagManager(p.pixel_id)
    } catch { /* un pixel mal configuré ne doit jamais casser la boutique */ }
  }
}

/** Envoie un événement standard (US-8.3.2) à chaque script de pixel chargé. */
export function trackEvent(eventName, params = {}) {
  const names = EVENT_MAP[eventName]
  if (!names) return
  try { window.fbq?.('track', names.facebook, params) } catch {}
  try { window.ttq?.track(names.tiktok, params) } catch {}
  try { window.gtag?.('event', names.ga, params) } catch {}
  try { window.dataLayer?.push({ event: names.ga, ...params }) } catch {}
}
