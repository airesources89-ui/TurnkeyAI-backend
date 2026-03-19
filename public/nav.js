// TurnkeyAI Shared Navigation — inject with: document.getElementById('tkNav').innerHTML = tkNav();
function tkNav(activePage) {
  return `
  <style>
    #tk-nav{position:fixed;top:0;left:0;right:0;z-index:1000;background:rgba(10,16,30,0.97);backdrop-filter:blur(14px);border-bottom:1px solid rgba(0,180,120,0.18);display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:64px;font-family:'DM Sans',sans-serif;}
    #tk-nav .tk-logo{display:flex;align-items:center;text-decoration:none;flex-shrink:0;}
    #tk-nav .tk-logo img{height:38px;width:auto;object-fit:contain;}
    #tk-nav .tk-links{display:flex;align-items:center;gap:0.2rem;list-style:none;margin:0;padding:0;}
    #tk-nav .tk-links a{color:rgba(255,255,255,0.72);text-decoration:none;font-size:0.87rem;font-weight:500;padding:0.45rem 0.9rem;border-radius:6px;transition:all 0.2s;letter-spacing:0.2px;white-space:nowrap;}
    #tk-nav .tk-links a:hover{color:#fff;background:rgba(255,255,255,0.07);}
    #tk-nav .tk-links a.active{color:#00c478;font-weight:700;}
    #tk-nav .tk-cta{background:linear-gradient(135deg,#0055ff,#0077ff);color:white!important;padding:0.5rem 1.2rem!important;border-radius:7px!important;font-weight:700!important;}
    #tk-nav .tk-cta:hover{background:linear-gradient(135deg,#0044dd,#0066ee)!important;transform:translateY(-1px);}
    #tk-hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;padding:8px;border:none;background:none;}
    #tk-hamburger span{display:block;width:22px;height:2px;background:rgba(255,255,255,0.8);border-radius:2px;transition:all 0.3s;}
    #tk-mobile-menu{display:none;position:fixed;top:64px;left:0;right:0;background:rgba(10,16,30,0.99);border-bottom:1px solid rgba(0,180,120,0.2);padding:1rem 1.5rem;z-index:999;flex-direction:column;gap:0.3rem;}
    #tk-mobile-menu a{color:rgba(255,255,255,0.8);text-decoration:none;font-size:0.95rem;font-weight:500;padding:0.75rem 0.5rem;border-bottom:1px solid rgba(255,255,255,0.06);display:block;font-family:'DM Sans',sans-serif;}
    #tk-mobile-menu a:last-child{border-bottom:none;}
    #tk-mobile-menu a.active{color:#00c478;font-weight:700;}
    @media(max-width:768px){#tk-nav .tk-links{display:none;}#tk-hamburger{display:flex;}}
  </style>
  <nav id="tk-nav">
    <a href="/index.html" class="tk-logo"><img src="/assets/turnkey_logo.jpg" alt="TurnkeyAI Services"></a>
    <ul class="tk-links">
      <li><a href="/index.html" ${activePage==='home'?'class="active"':''}>Home</a></li>
      <li><a href="/business.html" ${activePage==='business'?'class="active"':''}>Business Sites</a></li>
      <li><a href="/personal.html" ${activePage==='personal'?'class="active"':''}>Personal Sites</a></li>
      <li><a href="/blog.html" ${activePage==='blog'?'class="active"':''}>Blog</a></li>
      <li><a href="/pricing.html" ${activePage==='pricing'?'class="active"':''}>Pricing</a></li>
      <li><a href="/about.html" ${activePage==='about'?'class="active"':''}>About Us</a></li>
      <li><a href="/intake.html" class="tk-cta">Get Started →</a></li>
    </ul>
    <button id="tk-hamburger" onclick="tkToggleMenu()" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </nav>
  <div id="tk-mobile-menu">
    <a href="/index.html" ${activePage==='home'?'class="active"':''}>Home</a>
    <a href="/business.html" ${activePage==='business'?'class="active"':''}>Business Sites</a>
    <a href="/personal.html" ${activePage==='personal'?'class="active"':''}>Personal Sites</a>
    <a href="/blog.html" ${activePage==='blog'?'class="active"':''}>Blog</a>
    <a href="/pricing.html" ${activePage==='pricing'?'class="active"':''}>Pricing</a>
    <a href="/about.html" ${activePage==='about'?'class="active"':''}>About Us</a>
    <a href="/intake.html" style="color:#00c478;font-weight:700;">Get Started →</a>
  </div>
  `;
}
function tkToggleMenu(){
  var m=document.getElementById('tk-mobile-menu');
  m.style.display=m.style.display==='flex'?'none':'flex';
}
