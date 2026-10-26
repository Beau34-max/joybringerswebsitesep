/* ============================================================
   JOYBRINGERS — Top Contact / Social Bar
   Injects a sticky top strip above the main navbar.
   Include this script in <head> of every public page.
   ============================================================ */
(function () {
  var CSS = [
    '.jb-topbar{background:#006526;padding:7px 0;font-size:0.82rem;z-index:10000;border-bottom:2px solid #004d1a;position:fixed;top:0;left:0;right:0;width:100%;}',
    '.jb-topbar .container{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;}',
    '.jb-topbar-socials{display:flex;align-items:center;gap:10px;}',
    '.jb-topbar-socials a{color:rgba(255,255,255,0.82);font-size:0.9rem;transition:color 0.15s;line-height:1;}',
    '.jb-topbar-socials a:hover{color:#FDDE04;}',
    '.jb-topbar-contact{display:flex;align-items:center;gap:20px;flex-wrap:wrap;}',
    '.jb-topbar-contact a{color:rgba(255,255,255,0.92);text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:5px;transition:color 0.15s;}',
    '.jb-topbar-contact a:hover{color:#FDDE04;text-decoration:none;}',
    '.jb-topbar-contact i{font-size:0.78rem;opacity:0.85;}',
    '@media(max-width:576px){.jb-topbar-contact{display:none;}.jb-topbar .container{justify-content:center;}}'
  ].join('');

  var html = [
    '<div class="jb-topbar" id="jb-topbar">',
    '  <div class="container">',
    '    <div class="jb-topbar-socials">',
    '      <a href="https://www.facebook.com/Joybringers/" target="_blank" rel="noopener" aria-label="Facebook"><i class="fab fa-facebook-f"></i></a>',
    '      <a href="https://www.instagram.com/joybringerscharity/" target="_blank" rel="noopener" aria-label="Instagram"><i class="fab fa-instagram"></i></a>',
    '      <a href="https://x.com/JoybringersC" target="_blank" rel="noopener" aria-label="X / Twitter"><i class="fab fa-x-twitter"></i></a>',
    '      <a href="https://www.linkedin.com/company/joybringers/" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="fab fa-linkedin-in"></i></a>',
    '      <a href="https://www.tiktok.com/@joybringersc" target="_blank" rel="noopener" aria-label="TikTok"><i class="fab fa-tiktok"></i></a>',
    '    </div>',
    '    <div class="jb-topbar-contact">',
    '      <a href="tel:07780105816"><i class="fas fa-phone"></i> 07780 105816</a>',
    '      <a href="mailto:info@joybringerscharity.org"><i class="fas fa-envelope"></i> info@joybringerscharity.org</a>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('');

  function inject() {
    // Inject CSS
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Inject HTML before the first child of <body>
    var body = document.body;
    if (!body) return;
    // If page-wrapper exists, insert before it; otherwise prepend to body
    var wrapper = document.getElementById('page-wrapper') || body.firstElementChild;
    var div = document.createElement('div');
    div.innerHTML = html;
    var bar = div.firstElementChild;
    if (wrapper) {
      body.insertBefore(bar, wrapper);
    } else {
      body.insertAdjacentHTML('afterbegin', html);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
