export const GTM_ID = "GTM-NP2F9GRJ";
export const GA_MEASUREMENT_ID = "G-1LWRQYDEKS";
export const GA_DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}`;

/** True for /admin and anything under it (query/hash ignored). */
export function isAdminPathname(pathname: string): boolean {
  if (!pathname) return false;
  const path = pathname.split("?")[0].split("#")[0];
  return path === "/admin" || path.startsWith("/admin/");
}

/** Inline gtag bootstrap: reuses dataLayer, disables hits on /admin, wraps history before config. */
export function gtagBootstrapScript(measurementId: string = GA_MEASUREMENT_ID): string {
  return `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
(function(){
  var key='ga-disable-${measurementId}';
  function isAdmin(p){ return p==='/admin' || (p && p.indexOf('/admin/')===0); }
  function pathFromUrl(u){
    if(u==null||u==='') return location.pathname;
    try { return new URL(String(u), location.origin).pathname; } catch(e) { return String(u).split('?')[0].split('#')[0]; }
  }
  function sync(u){ window[key]=isAdmin(pathFromUrl(u)); }
  sync(location.pathname);
  if(!window.__c360AnalyticsGuard){
    window.__c360AnalyticsGuard=true;
    var ps=history.pushState, rs=history.replaceState;
    history.pushState=function(){ sync(arguments[2]); return ps.apply(this, arguments); };
    history.replaceState=function(){ sync(arguments[2]); return rs.apply(this, arguments); };
    window.addEventListener('popstate', function(){ sync(location.pathname); });
  }
})();
gtag('js', new Date());
if(!window['ga-disable-${measurementId}']){ gtag('config', '${measurementId}'); }`;
}
