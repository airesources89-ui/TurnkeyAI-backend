// ════════════════════════════════════════════════
// ── lib/site-generator.js — FINALIZED DESIGN STANDARD
// ── Gulf Coast Template: Bebas Neue + DM Sans
// ── Multi-page: index, pricing, scheduling, messaging
// ════════════════════════════════════════════════
const BASE_URL = process.env.BASE_URL || 'https://turnkeyaiservices.com';

function generateSiteHTML(data, isPreview, clientObj) {
  const biz      = data.businessName || 'Your Business';
  const owner    = data.ownerName || '';
  const rawPhone = data.phone || '';
  const phone    = (!isPreview && clientObj && clientObj.twilioNumber)
    ? clientObj.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    : rawPhone;
  const phoneRaw = phone.replace(/\D/g, '');
  const email    = data.email || '';
  const city     = data.city || data.targetCity || '';
  const state    = data.state || '';
  const address  = [data.address, city, state, data.zip].filter(Boolean).join(', ');
  const about    = data.aboutUs || '';
  const tagline  = data.missionStatement || 'Quality service you can count on.';
  const industry = (data.industry || 'local business').replace(/_/g,' ');
  const advantage= data.competitiveAdvantage || '';
  const awards   = data.awards || '';
  const ownerPhoto  = data.ownerPhoto || '';
  const miniMeVideo = data.miniMeVideoUrl || '';
  const chatName    = data.chatName || 'Chat With Us';

  const heroImages = {
    plumbing:'https://plus.unsplash.com/premium_photo-1663045495725-89f23b57cfc5?w=1600&q=80',
    electrician:'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1600&q=80',
    electrical:'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1600&q=80',
    hvac:'https://plus.unsplash.com/premium_photo-1664301972519-506636f0245d?w=1600&q=80',
    roofing:'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80',
    landscaping:'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=1600&q=80',
    lawn:'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=1600&q=80',
    cleaning:'https://plus.unsplash.com/premium_photo-1679500354538-0398de125937?w=1600&q=80',
    auto_repair:'https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=1600&q=80',
    automotive:'https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=1600&q=80',
    restaurant:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80',
    salon:'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&q=80',
    fencing:'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80',
    construction:'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80',
    painting:'https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=1600&q=80',
    pest_control:'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=1600&q=80',
    accounting:'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80',
    acupuncture:'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=1600&q=80',
    appliance_repair:'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1600&q=80',
    architecture:'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1600&q=80',
    attorney:'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1600&q=80',
    auto_body:'https://images.unsplash.com/photo-1603486002664-a7319421e133?w=1600&q=80',
    auto_detailing:'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1600&q=80',
    auto_sales:'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=1600&q=80',
    agriculture:'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600&q=80',
    bail_bonds:'https://images.unsplash.com/photo-1589578228447-e1a4e481c6c8?w=1600&q=80',
    bakery:'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1600&q=80',
    barber:'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1600&q=80',
    beauty_supply:'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1600&q=80',
    catering:'https://images.unsplash.com/photo-1555244162-803834f70033?w=1600&q=80',
    childcare:'https://images.unsplash.com/photo-1587654780291-39c9404d7dd0?w=1600&q=80',
    chiropractic:'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1600&q=80',
    counseling:'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?w=1600&q=80',
    dance:'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=1600&q=80',
    dental:'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=1600&q=80',
    event_planning:'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&q=80',
    financial_advisor:'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1600&q=80',
    fitness:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=80',
    flooring:'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=1600&q=80',
    food_truck:'https://images.unsplash.com/photo-1567129937968-cdad8f07e2f8?w=1600&q=80',
    funeral:'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1600&q=80',
    handyman:'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=1600&q=80',
    insurance:'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1600&q=80',
    it_support:'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1600&q=80',
    locksmith:'https://images.unsplash.com/photo-1558001373-7b93ee48ffa0?w=1600&q=80',
    massage:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1600&q=80',
    moving:'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=1600&q=80',
    music_lessons:'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=1600&q=80',
    notary:'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1600&q=80',
    pet_grooming:'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=1600&q=80',
    pet_services:'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1600&q=80',
    photography:'https://images.unsplash.com/photo-1554048612-b6a482bc67e5?w=1600&q=80',
    physical_therapy:'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1600&q=80',
    pool_service:'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1600&q=80',
    pressure_washing:'https://plus.unsplash.com/premium_photo-1663045495725-89f23b57cfc5?w=1600&q=80',
    print_shop:'https://images.unsplash.com/photo-1562654501-a0ccc0fc3fb1?w=1600&q=80',
    real_estate:'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600&q=80',
    security:'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=1600&q=80',
    solar:'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1600&q=80',
    tattoo:'https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?w=1600&q=80',
    tree_service:'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1600&q=80',
    trucking:'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=1600&q=80',
    towing:'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1600&q=80',
    tutoring:'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=1600&q=80',
    upholstery:'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1600&q=80',
    veterinary:'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1600&q=80',
    wedding:'https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=80',
    window_cleaning:'https://plus.unsplash.com/premium_photo-1679500354538-0398de125937?w=1600&q=80',
    window_door:'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80',
    other:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80',
    default:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80',
  };
  const industryKey = (data.industry||'').toLowerCase().replace(/ /g,'_');
  let heroImage = heroImages[industryKey];
  if (!heroImage) {
    const fuzzyMatch = Object.keys(heroImages).find(k => k !== 'default' && (industryKey.includes(k) || k.includes(industryKey)));
    heroImage = fuzzyMatch ? heroImages[fuzzyMatch] : heroImages.default;
  }

  const iconSet = {
    plumbing:['fa-faucet-drip','fa-toilet','fa-fire-flame-curved','fa-pipe-section','fa-house-flood-water','fa-bolt'],
    electrician:['fa-bolt','fa-plug','fa-lightbulb','fa-solar-panel','fa-screwdriver-wrench','fa-shield-halved'],
    electrical:['fa-bolt','fa-plug','fa-lightbulb','fa-solar-panel','fa-screwdriver-wrench','fa-shield-halved'],
    hvac:['fa-wind','fa-temperature-half','fa-fan','fa-snowflake','fa-fire','fa-wrench'],
    roofing:['fa-house-chimney','fa-hammer','fa-hard-hat','fa-cloud-rain','fa-shield-halved','fa-star'],
    landscaping:['fa-leaf','fa-seedling','fa-tree','fa-scissors','fa-sun','fa-tractor'],
    lawn:['fa-leaf','fa-seedling','fa-tree','fa-scissors','fa-sun','fa-tractor'],
    cleaning:['fa-broom','fa-spray-can','fa-soap','fa-star','fa-shield-halved','fa-house'],
    auto_repair:['fa-car','fa-wrench','fa-oil-can','fa-gear','fa-gauge-high','fa-screwdriver-wrench'],
    restaurant:['fa-utensils','fa-pizza-slice','fa-burger','fa-wine-glass','fa-star','fa-clock'],
    salon:['fa-scissors','fa-spa','fa-star','fa-heart','fa-clock','fa-shield-halved'],
    default:['fa-star','fa-shield-halved','fa-wrench','fa-thumbs-up','fa-clock','fa-phone'],
  }[industryKey] || ['fa-star','fa-shield-halved','fa-wrench','fa-thumbs-up','fa-clock','fa-phone'];

  const palettes = {
    plumbing:{primary:'#0a1628',accent:'#f59e0b',accent2:'#e85d04'},
    electrician:{primary:'#0f172a',accent:'#f59e0b',accent2:'#eab308'},
    electrical:{primary:'#0f172a',accent:'#f59e0b',accent2:'#eab308'},
    hvac:{primary:'#0c1a2e',accent:'#38bdf8',accent2:'#0ea5e9'},
    roofing:{primary:'#1c0a0a',accent:'#f59e0b',accent2:'#b91c1c'},
    landscaping:{primary:'#14532d',accent:'#84cc16',accent2:'#16a34a'},
    lawn:{primary:'#14532d',accent:'#84cc16',accent2:'#16a34a'},
    cleaning:{primary:'#0a1628',accent:'#06b6d4',accent2:'#0891b2'},
    auto_repair:{primary:'#1e1b4b',accent:'#f59e0b',accent2:'#f97316'},
    restaurant:{primary:'#1c0a0a',accent:'#f97316',accent2:'#dc2626'},
    salon:{primary:'#1e1b4b',accent:'#ec4899',accent2:'#a855f7'},
    default:{primary:'#0a1628',accent:'#f59e0b',accent2:'#e85d04'},
  };
  let pal = palettes[industryKey] || palettes.default;
  if (data.colorPreference) {
    const cp = data.colorPreference.toLowerCase();
    if      (cp.includes('red'))    pal = {primary:'#1c0a0a',accent:'#f59e0b',accent2:'#dc2626'};
    else if (cp.includes('green'))  pal = {primary:'#14532d',accent:'#84cc16',accent2:'#16a34a'};
    else if (cp.includes('purple')) pal = {primary:'#1e1b4b',accent:'#a78bfa',accent2:'#7c3aed'};
    else if (cp.includes('orange')) pal = {primary:'#1c1917',accent:'#f59e0b',accent2:'#ea580c'};
    else if (cp.includes('teal'))   pal = {primary:'#042f2e',accent:'#06b6d4',accent2:'#0d9488'};
    else if (cp.includes('blue'))   pal = {primary:'#0a1628',accent:'#38bdf8',accent2:'#0066FF'};
    else if (cp.includes('pink'))   pal = {primary:'#1e1b4b',accent:'#ec4899',accent2:'#a855f7'};
  }

  const serviceItems = [];
  Object.keys(data).forEach(k => {
    if (k.startsWith('service_') && data[k] === 'on') {
      const name = k.replace('service_','').replace(/_/g,' ');
      const price = data['price_'+k.replace('service_','')] || '';
      serviceItems.push({ name: name.charAt(0).toUpperCase()+name.slice(1), price });
    }
  });
  if (data.additionalServices) {
    data.additionalServices.split('\n').forEach(s => s.trim() && serviceItems.push({ name: s.trim(), price: '' }));
  }

  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const dayLabels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hoursData = days.map((d,i) => data['day_'+d] ? { label: dayLabels[i], hours: data['hours_'+d]||'Open' } : null).filter(Boolean);

  const payKeys = ['cash','card','check','venmo','cashapp','zelle'];
  const payLabels = {cash:'Cash',card:'Credit/Debit Card',check:'Check',venmo:'Venmo',cashapp:'CashApp',zelle:'Zelle'};
  const payMethods = payKeys.filter(k => data['pay_'+k]).map(k => payLabels[k]).join(' \u00b7 ');

  const clientId    = data.id || '';
  const previewToken= data._previewToken || '';
  const clientApproveUrl = clientId && previewToken ? `${BASE_URL}/api/client-approve/${clientId}?token=${previewToken}` : '';

  // ── Build rich chatbot system prompt ──
  const chatServiceNames = serviceItems.map(s => s.name + (s.price ? ' ('+s.price+')' : '')).join(', ');
  const chatHoursStr = hoursData.map(h => h.label + ': ' + h.hours).join('; ');
  const chatPersonality = data.chatPersonality || 'friendly';
  const chatPricing = data.pricingDisplay || 'free_estimate';
  const chatFaq = data.faqQuestions || '';
  const chatPricingInstruction = chatPricing === 'ranges' ? 'Show price ranges when asked about pricing.'
    : chatPricing === 'starting_at' ? 'Show starting prices only when asked about pricing.'
    : chatPricing === 'no_pricing' ? 'Do not share any pricing information. Tell them to call for a quote.'
    : 'When asked about pricing, say we offer free estimates and to call or book online.';
  const chatTone = chatPersonality === 'professional' ? 'Be professional and formal in tone.'
    : chatPersonality === 'casual' ? 'Be casual and conversational.'
    : chatPersonality === 'direct' ? 'Be direct and no-nonsense.'
    : 'Be friendly and helpful.';
  let chatSystem = `You are the AI chat assistant for ${biz}, a ${industry} business in ${city}${state ? ', ' + state : ''}. ${chatTone}
Phone: ${phone}. Email: ${email}.${address.length > 5 ? ' Address: ' + address + '.' : ''}
${chatServiceNames ? 'Services we offer: ' + chatServiceNames + '.' : ''}
${chatHoursStr ? 'Business hours: ' + chatHoursStr + '.' : ''}
${payMethods ? 'Payment methods: ' + payMethods + '.' : ''}
${about ? 'About us: ' + about.substring(0, 300) + '.' : ''}
${tagline ? 'Our motto: ' + tagline : ''}
${advantage ? 'What sets us apart: ' + advantage : ''}
${chatFaq ? 'Common questions customers ask: ' + chatFaq.substring(0, 300) : ''}
${chatPricingInstruction}
Answer customer questions using the information above. If you do not know a specific answer, say you will have someone follow up and provide the phone number. Do not make up information. Keep responses concise (under 200 words).`;
  if (chatSystem.length > 2000) chatSystem = chatSystem.substring(0, 2000);

  const bizWords  = biz.split(' ');
  const bizFirst  = bizWords.slice(0,-1).join(' ') || biz;
  const bizLast   = bizWords.length > 1 ? bizWords.slice(-1)[0] : '';

  // ── Derived HTML blocks ──
  const serviceCardsHTML = serviceItems.map((s,i) => `
    <div class="svc-card" style="background:white;border-radius:14px;padding:1.8rem;box-shadow:0 4px 24px rgba(10,22,40,.08);border:1px solid rgba(10,22,40,.06);transition:transform .25s,box-shadow .25s;position:relative;overflow:hidden;">
      <div style="width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,${pal.accent},${pal.accent2});display:flex;align-items:center;justify-content:center;font-size:1.3rem;color:white;margin-bottom:1.1rem;">
        <i class="fas ${iconSet[i%iconSet.length]}"></i>
      </div>
      <h3 style="font-size:1.05rem;font-weight:700;color:#1e293b;margin-bottom:.5rem;">${s.name}</h3>
      ${s.price?`<p style="font-weight:700;color:${pal.accent};font-size:1rem;">${s.price}</p>`:'<p style="font-size:.88rem;color:#64748b;line-height:1.6;">Professional service you can count on.</p>'}
    </div>`).join('');

  const hoursRows = hoursData.map(h => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.08);">
      <span style="color:rgba(255,255,255,.75);font-size:.95rem;">${h.label}</span>
      <span style="color:white;font-weight:600;font-size:.95rem;">${h.hours}</span>
    </div>`).join('');

  const hoursRowsLight = hoursData.map(h => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #e5e7eb;">
      <span style="color:#374151;font-size:.95rem;">${h.label}</span>
      <span style="color:#0a1628;font-weight:600;font-size:.95rem;">${h.hours}</span>
    </div>`).join('');

  const miniMeSection = miniMeVideo ? `
    <section style="padding:5rem 1.5rem;background:${pal.primary};text-align:center;">
      <div style="max-width:680px;margin:0 auto;">
        <div style="display:inline-block;background:${pal.accent};color:${pal.primary};padding:5px 16px;border-radius:50px;font-size:.75rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:1.2rem;">A Message From ${owner||'Our Team'}</div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:2.8rem;color:white;letter-spacing:1.5px;margin-bottom:1.5rem;">Meet Us Personally</h2>
        <video src="${miniMeVideo}" controls style="width:100%;border-radius:16px;max-height:380px;box-shadow:0 20px 60px rgba(0,0,0,.5);"></video>
      </div>
    </section>` : '';

  // ── ANALYTICS_TRACKING: Pageview tracking for live sites only ──
  const trackingSnippet = (!isPreview && clientObj && clientObj.id)
    ? `\n(function(){try{fetch('${BASE_URL}/api/track/pageview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:'${clientObj.id}',page:location.pathname,referrer:document.referrer})}).catch(function(){});}catch(e){}})();`
    : '';

  // ── Dashboard link for nav ──
  const dashboardLink = (!isPreview && clientObj && clientObj.dashToken)
    ? `${BASE_URL}/pages/client-dashboard.html?token=${clientObj.dashToken}`
    : `${BASE_URL}/pages/client-dashboard.html`;

  // ══════════════════════════════════════
  // ── SHARED PIECES FOR ALL PAGES ──
  // ══════════════════════════════════════

  const sharedHead = `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">`;

  const sharedCSS = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#050d1a;overflow-x:hidden;-webkit-font-smoothing:antialiased}
    img{max-width:100%}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:rgba(10,22,40,.92);backdrop-filter:blur(12px);border-bottom:1px solid rgba(245,158,11,.18)}
    .nav-logo{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;color:white;letter-spacing:2px;text-decoration:none}
    .nav-logo span{color:${pal.accent}}
    .nav-links{display:flex;gap:1.2rem;list-style:none;align-items:center}
    .nav-links a{color:rgba(255,255,255,.8);text-decoration:none;font-size:.85rem;font-weight:500;letter-spacing:.4px;transition:color .2s}
    .nav-links a:hover{color:${pal.accent}}
    .nav-cta{background:${pal.accent}!important;color:${pal.primary}!important;padding:.45rem 1rem;border-radius:6px;font-weight:700!important;font-size:.82rem!important}
    .nav-login{background:rgba(255,255,255,.12)!important;color:white!important;padding:.45rem 1rem;border-radius:6px;font-weight:600!important;font-size:.82rem!important;border:1px solid rgba(255,255,255,.25)}
    .nav-login:hover{background:rgba(255,255,255,.22)!important}
    .btn-primary{background:${pal.accent};color:${pal.primary};padding:.85rem 1.9rem;border-radius:8px;font-weight:700;font-size:.97rem;text-decoration:none;border:none;cursor:pointer;transition:all .25s;display:inline-flex;align-items:center;gap:.5rem;font-family:inherit}
    .btn-primary:hover{background:${pal.accent2};color:white;transform:translateY(-2px);box-shadow:0 8px 25px rgba(245,158,11,.4)}
    .btn-outline{background:transparent;color:white;padding:.85rem 1.9rem;border-radius:8px;font-weight:600;font-size:.97rem;text-decoration:none;border:2px solid rgba(255,255,255,.35);cursor:pointer;transition:all .25s;display:inline-flex;align-items:center;gap:.5rem}
    .btn-outline:hover{border-color:${pal.accent};color:${pal.accent};transform:translateY(-2px)}
    section{padding:5.5rem 1.5rem}
    .container{max-width:1080px;margin:0 auto}
    .section-label{font-size:.72rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${pal.accent};margin-bottom:.5rem}
    .section-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(2rem,5vw,3.2rem);letter-spacing:1.5px;line-height:1.05;margin-bottom:.9rem}
    .section-sub{font-size:1rem;color:#64748b;line-height:1.7;max-width:520px}
    .svc-card:hover{transform:translateY(-5px)!important;box-shadow:0 16px 48px rgba(10,22,40,.14)!important}
    footer{background:#050d1a;padding:2.5rem 1.5rem 1.8rem;border-top:1px solid rgba(245,158,11,.15)}
    .footer-inner{max-width:1080px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1.2rem}
    .footer-logo{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;color:white;letter-spacing:2px;text-decoration:none}
    .footer-logo span{color:${pal.accent}}
    .footer-links{display:flex;gap:1.4rem;flex-wrap:wrap}
    .footer-links a{color:rgba(255,255,255,.45);font-size:.82rem;text-decoration:none}
    .footer-links a:hover{color:${pal.accent}}
    .footer-copy{color:rgba(255,255,255,.25);font-size:.75rem;width:100%;text-align:center;margin-top:1.4rem;padding-top:1.4rem;border-top:1px solid rgba(255,255,255,.06)}
    #chatWidget{position:fixed;bottom:24px;right:24px;z-index:9999}
    #chatToggleBtn{background:linear-gradient(135deg,${pal.accent},${pal.accent2});color:${pal.primary};border:none;border-radius:50px;padding:13px 20px;font-size:.92rem;font-weight:700;cursor:pointer;box-shadow:0 6px 24px rgba(245,158,11,.4);font-family:inherit;display:flex;align-items:center;gap:8px}
    #chatBox{display:none;flex-direction:column;background:white;border-radius:20px;box-shadow:0 12px 48px rgba(0,0,0,.2);width:330px;max-height:470px;overflow:hidden;border:1px solid #e5e7eb}
    #chatHeader{background:linear-gradient(135deg,${pal.primary},#1a3a6b);color:white;padding:15px 18px;display:flex;justify-content:space-between;align-items:center}
    #chatMessages{flex:1;overflow-y:auto;padding:14px;min-height:210px;background:#f9fafb}
    #chatInputRow{padding:11px;border-top:1px solid #e5e7eb;display:flex;gap:8px;background:white}
    #chatInput{flex:1;padding:9px 13px;border:2px solid #e5e7eb;border-radius:10px;font-size:.88rem;font-family:inherit;outline:none}
    #chatSendBtn{background:${pal.accent};color:${pal.primary};border:none;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:700;font-family:inherit}
    .reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease}
    .reveal.visible{opacity:1;transform:translateY(0)}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:.9rem;margin-bottom:.9rem}
    .form-group{display:flex;flex-direction:column;gap:.3rem;margin-bottom:.9rem}
    .form-group label{font-size:.72rem;font-weight:700;color:#0a1628;letter-spacing:.3px;text-transform:uppercase}
    .form-group input,.form-group select,.form-group textarea{border:1.5px solid #e2e8f0;border-radius:8px;padding:.65rem .85rem;font-size:.9rem;font-family:inherit;color:#1e293b;background:#f8fafc;outline:none}
    .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:${pal.accent}}
    .form-group textarea{resize:vertical;min-height:75px}
    .btn-book{width:100%;background:${pal.accent};color:${pal.primary};border:none;border-radius:8px;padding:.88rem;font-size:.97rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .2s;display:flex;align-items:center;justify-content:center;gap:.5rem}
    .btn-book:hover{background:${pal.accent2};color:white}
    /* Hamburger menu */
    .nav-hamburger{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:4px}
    .nav-hamburger span{width:24px;height:2px;background:white;border-radius:2px;transition:all .2s}
    .mobile-menu{display:none;position:fixed;top:64px;left:0;right:0;background:rgba(10,22,40,.97);backdrop-filter:blur(12px);padding:1rem 2rem 1.5rem;z-index:99;flex-direction:column;gap:.8rem;border-bottom:1px solid rgba(245,158,11,.18)}
    .mobile-menu.open{display:flex}
    .mobile-menu a{color:rgba(255,255,255,.85);text-decoration:none;font-size:.95rem;font-weight:500;padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .mobile-menu a:last-child{border-bottom:none}
    @media(max-width:768px){
      .nav-links{display:none}
      .nav-hamburger{display:flex}
      .form-row{grid-template-columns:1fr}
    }`;

  // ── Build nav for a given active page ──
  function buildNav(activePage) {
    const link = (href, label, page) => {
      const isActive = (page === activePage);
      const style = isActive ? `color:${pal.accent};font-weight:700;` : '';
      return `<li><a href="${href}" style="${style}">${label}</a></li>`;
    };
    return `<nav>
  <a href="index.html" class="nav-logo">${bizFirst} <span>${bizLast}</span></a>
  <ul class="nav-links">
    ${link('index.html','Home','index')}
    ${link('pricing.html','Pricing','pricing')}
    ${link('scheduling.html','Schedule','scheduling')}
    ${link('messaging.html','Message Us','messaging')}
    <li><a href="${dashboardLink}" class="nav-login"><i class="fas fa-user"></i> Client Login</a></li>
    ${phone ? `<li><a href="tel:${phoneRaw}" class="nav-cta"><i class="fas fa-phone"></i> Call Now</a></li>` : ''}
  </ul>
  <button class="nav-hamburger" onclick="document.getElementById('mobileMenu').classList.toggle('open')" aria-label="Menu">
    <span></span><span></span><span></span>
  </button>
</nav>
<div class="mobile-menu" id="mobileMenu">
  <a href="index.html"><i class="fas fa-home"></i> Home</a>
  <a href="pricing.html"><i class="fas fa-tag"></i> Pricing</a>
  <a href="scheduling.html"><i class="fas fa-calendar-check"></i> Schedule</a>
  <a href="messaging.html"><i class="fas fa-envelope"></i> Message Us</a>
  <a href="${dashboardLink}"><i class="fas fa-user"></i> Client Login</a>
  ${phone ? `<a href="tel:${phoneRaw}"><i class="fas fa-phone"></i> Call ${phone}</a>` : ''}
</div>`;
  }

  const sharedFooter = `<footer>
  <div class="footer-inner">
    <a href="index.html" class="footer-logo">${bizFirst} <span>${bizLast}</span></a>
    <div class="footer-links">
      <a href="index.html">Home</a>
      <a href="pricing.html">Pricing</a>
      <a href="scheduling.html">Schedule</a>
      <a href="messaging.html">Message Us</a>
    </div>
  </div>
  <div class="footer-copy">\u00a9 ${new Date().getFullYear()} ${biz} \u00b7 ${city}${state?', '+state:''} \u00b7 All Rights Reserved \u00b7 Powered by <a href="https://turnkeyaiservices.com" target="_blank" rel="noopener" style="color:${pal.accent};text-decoration:none;font-weight:600;">TurnkeyAI Services</a></div>
</footer>`;

  const chatWidgetHTML = `<div id="chatWidget">
  <button id="chatToggleBtn" onclick="openChat()">\ud83d\udcac ${chatName}</button>
  <div id="chatBox">
    <div id="chatHeader">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:9px;height:9px;background:#00D68F;border-radius:50%;animation:pulse 2s infinite;"></div>
        <span style="font-weight:700;font-size:.92rem;">\ud83d\udcac ${chatName}</span>
      </div>
      <span onclick="closeChat()" style="cursor:pointer;font-size:1.2rem;opacity:.7;">\u2715</span>
    </div>
    <div id="chatMessages"></div>
    <div id="chatInputRow">
      <input id="chatInput" type="text" placeholder="Ask a question..." onkeydown="if(event.key==='Enter')sendMsg()">
      <button id="chatSendBtn" onclick="sendMsg()">Send</button>
    </div>
  </div>
</div>`;

  const sharedScripts = `<script>
(function(){
  var obs=new IntersectionObserver(function(entries){entries.forEach(function(e,i){if(e.isIntersecting)setTimeout(function(){e.target.classList.add('visible');},i*70);});},{threshold:.1});
  document.querySelectorAll('.reveal').forEach(function(el){obs.observe(el);});
})();
${trackingSnippet}
var chatOpen=false;
var chatHistory=[];
var chatSystemPrompt=${JSON.stringify(chatSystem)};
function openChat(){
  chatOpen=true;
  document.getElementById('chatToggleBtn').style.display='none';
  var box=document.getElementById('chatBox');
  box.style.display='flex';
  if(!chatHistory.length){addMsg('bot','Hi! How can I help you today?');}
  document.getElementById('chatInput').focus();
}
function closeChat(){
  chatOpen=false;
  document.getElementById('chatBox').style.display='none';
  document.getElementById('chatToggleBtn').style.display='flex';
}
function addMsg(role,text){
  var msgs=document.getElementById('chatMessages');
  var d=document.createElement('div');
  d.style.cssText='margin-bottom:10px;display:flex;'+(role==='user'?'justify-content:flex-end;':'');
  var b=document.createElement('div');
  b.style.cssText='padding:9px 13px;border-radius:12px;max-width:82%;font-size:.88rem;line-height:1.5;'+(role==='user'?'background:#0066FF;color:white;':'background:white;border:1px solid #e5e7eb;color:#1e293b;');
  b.textContent=text;d.appendChild(b);msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}
async function sendMsg(){
  var input=document.getElementById('chatInput');
  var msg=input.value.trim();if(!msg)return;
  input.value='';
  addMsg('user',msg);
  chatHistory.push({role:'user',content:msg});
  var typing=document.createElement('div');
  typing.id='typing';typing.style.cssText='margin-bottom:10px;font-size:.8rem;color:#94a3b8;';
  typing.textContent='Typing...';
  document.getElementById('chatMessages').appendChild(typing);
  try{
    var r=await fetch('${BASE_URL}/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,history:chatHistory,system:chatSystemPrompt,businessName:'${biz.replace(/'/g,"\\'")}' })});
    var d=await r.json();
    var reply=d.reply||'Sorry, I had trouble with that. Please call us directly.';
    if(document.getElementById('typing'))document.getElementById('typing').remove();
    addMsg('bot',reply);
    chatHistory.push({role:'assistant',content:reply});
  }catch(e){
    if(document.getElementById('typing'))document.getElementById('typing').remove();
    addMsg('bot','Sorry, I had trouble connecting. Please call ${phone||'us'} directly.');
  }
}
<\/script>`;

  // ══════════════════════════════════════
  // ── PAGE WRAPPER HELPER ──
  // ══════════════════════════════════════
  function wrapPage(title, activePage, bodyContent, extraCSS) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  ${sharedHead}
  <title>${title}</title>
  <meta name="description" content="${tagline} Serving ${city}${state?', '+state:''}. ${phone?'Call '+phone:''}">
  <style>${sharedCSS}${extraCSS||''}</style>
</head>
<body>
${buildNav(activePage)}
${bodyContent}
${sharedFooter}
${chatWidgetHTML}
${sharedScripts}
</body>
</html>`;
  }

  // ══════════════════════════════════════
  // ── Preview banner (index only) ──
  // ══════════════════════════════════════
  const previewBanner = isPreview
    ? `<div style="background:#1a1d24;border-bottom:2px solid #f59e0b;padding:0;position:relative;z-index:101;">
        <div style="padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:16px;"><a href="https://turnkeyaiservices.com" style="color:rgba(255,255,255,.7);font-size:13px;text-decoration:none;white-space:nowrap;">\u2190 TurnkeyAI Home</a><span style="color:#f59e0b;font-weight:700;font-size:14px;">\ud83d\udd0d PREVIEW \u2014 This site is not yet live</span></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${clientApproveUrl?`<a href="${clientApproveUrl}" style="background:#00D68F;color:#071c12;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">\u2705 Approve &amp; Go Live \u2192</a>`:''}
            <button onclick="document.getElementById('changeModal').style.display='flex'" style="background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.25);color:white;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">\u270f\ufe0f Request Changes</button>
          </div>
        </div>
      </div>
      <div id="changeModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9998;align-items:center;justify-content:center;padding:24px;" onclick="if(event.target===this)this.style.display='none'">
        <div style="background:#1a1d24;border:1px solid #2e3240;border-radius:20px;padding:36px;width:100%;max-width:500px;color:white;">
          <h2 style="font-size:20px;font-weight:800;margin:0 0 8px;font-family:sans-serif;">Request Changes</h2>
          <p style="color:rgba(255,255,255,.6);font-size:14px;margin:0 0 24px;">Choose how you'd like to make changes:</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
            <button onclick="document.getElementById('changeModal').style.display='none';window.open('${BASE_URL}/pages/intake.html?update=${clientId}&token=${previewToken}','_blank')" style="background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;padding:18px;cursor:pointer;color:white;text-align:left;font-family:inherit;">
              <div style="font-size:24px;margin-bottom:8px;">\u270f\ufe0f</div>
              <div style="font-weight:700;font-size:14px;">Edit My Information</div>
              <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;">Opens your full intake form with your info pre-loaded</div>
            </button>
            <button onclick="document.getElementById('changeModal').style.display='none';document.getElementById('majorChangeSection').style.display='block';document.getElementById('majorChangeSection').scrollIntoView({behavior:'smooth'})" style="background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;padding:18px;cursor:pointer;color:white;text-align:left;font-family:inherit;">
              <div style="font-size:24px;margin-bottom:8px;">\ud83d\udce7</div>
              <div style="font-weight:700;font-size:14px;">Major Changes</div>
              <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;">Describe it \u2014 we handle everything</div>
            </button>
          </div>
          <button onclick="document.getElementById('changeModal').style.display='none'" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px;color:rgba(255,255,255,.6);cursor:pointer;font-family:inherit;font-size:14px;">Cancel</button>
        </div>
      </div>
      <div id="majorChangeSection" style="display:none;background:#f4f6fa;border-top:3px solid #00D68F;padding:40px 24px;">
        <div style="max-width:700px;margin:0 auto;">
          <h2 style="font-family:sans-serif;font-size:24px;font-weight:800;color:#1a1d24;margin:0 0 6px;">\ud83d\udce7 Tell Us What You Need</h2>
          <p style="color:#6b7280;margin:0 0 28px;font-size:15px;">Describe the changes and we'll handle everything within 24\u201348 hours.</p>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:16px;padding:28px;margin-bottom:16px;">
            <div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Your Name</label><input id="maj_name" type="text" value="${(data.ownerName||'').replace(/"/g,'&quot;')}" style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;"></div>
            <div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Your Email</label><input id="maj_email" type="email" value="${(data.email||'').replace(/"/g,'&quot;')}" style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;"></div>
            <div><label style="font-size:13px;font-weight:700;display:block;margin-bottom:6px;color:#374151;">Describe What You Want Changed</label><textarea id="maj_details" rows="6" placeholder="Be as specific as possible..." style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;font-family:sans-serif;outline:none;resize:vertical;"></textarea></div>
          </div>
          <button onclick="submitMajorChanges()" style="background:#00D68F;color:#071c12;border:none;border-radius:10px;padding:14px 32px;font-size:15px;font-weight:700;cursor:pointer;font-family:sans-serif;">Send to TurnkeyAI \u2192</button>
          <button onclick="document.getElementById('majorChangeSection').style.display='none'" style="margin-left:12px;background:none;border:none;color:#6b7280;font-size:14px;cursor:pointer;font-family:sans-serif;">Cancel</button>
        </div>
      </div>
      <script>
      function submitMajorChanges(){
        var details={name:document.getElementById('maj_name').value,email:document.getElementById('maj_email').value,details:document.getElementById('maj_details').value};
        fetch('${BASE_URL}/api/preview-change-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'major',clientId:'${clientId}',token:'${previewToken}',changes:details})})
        .then(function(){document.getElementById('majorChangeSection').style.display='none';var b=document.createElement('div');b.style='position:fixed;bottom:24px;right:24px;background:#00D68F;color:#071c12;padding:16px 24px;border-radius:12px;font-weight:700;font-size:14px;z-index:9999;font-family:sans-serif;';b.textContent='\u2705 Message sent! We will be in touch within 24 hours.';document.body.appendChild(b);setTimeout(function(){b.remove();},5000);})
        .catch(function(){alert('Send failed. Please email turnkeyaiservices@gmail.com');});
      }
      <\/script>`
    : '';

  const poweredByBar = !isPreview
    ? `<div style="background:${pal.primary};color:rgba(255,255,255,.7);text-align:center;padding:10px 24px;font-size:13px;">\u26a1 Powered by <a href="https://turnkeyaiservices.com" style="color:${pal.accent};font-weight:700;text-decoration:none;">TurnkeyAI Services</a></div>`
    : '';

  // ══════════════════════════════════════
  // ── INDEX PAGE (LANDING PAGE) ──
  // ══════════════════════════════════════
  const indexExtraCSS = `
    .hero{min-height:100vh;position:relative;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;padding-top:70px}
    .hero-bg{position:absolute;inset:0;background-image:url('${heroImage}');background-size:cover;background-position:center;animation:slowZoom 20s ease-in-out infinite alternate}
    @keyframes slowZoom{from{transform:scale(1.03)}to{transform:scale(1.1)}}
    .hero-overlay{position:absolute;inset:0;background:linear-gradient(160deg,rgba(10,22,40,.65) 0%,rgba(26,58,107,.45) 55%,rgba(232,93,4,.10) 100%)}
    .hero-content{position:relative;z-index:2;max-width:820px;padding:0 1.5rem;animation:fadeUp .9s ease both}
    @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    .hero-badge{display:inline-flex;align-items:center;gap:.5rem;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);color:${pal.accent};font-size:.75rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:.4rem 1rem;border-radius:50px;margin-bottom:1.4rem}
    .hero h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(3.2rem,8vw,6rem);color:white;line-height:1;letter-spacing:2px;margin-bottom:1.1rem;text-shadow:0 4px 24px rgba(0,0,0,.5)}
    .hero h1 span{color:${pal.accent}}
    .hero p{font-size:1.1rem;color:rgba(255,255,255,.92);line-height:1.7;max-width:540px;margin:0 auto 2rem;text-shadow:0 2px 8px rgba(0,0,0,.4)}
    .hero-btns{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}
    .hero-stats{display:flex;justify-content:center;gap:2.5rem;flex-wrap:wrap;margin-top:2.5rem}
    .stat strong{display:block;font-family:'Bebas Neue',sans-serif;font-size:2rem;color:${pal.accent};letter-spacing:1px}
    .stat span{font-size:.75rem;color:rgba(255,255,255,.55);letter-spacing:.5px}
    .trust-bar{background:${pal.accent};padding:.85rem 2rem;display:flex;align-items:center;justify-content:center;gap:2rem;flex-wrap:wrap}
    .trust-bar span{font-size:.78rem;font-weight:700;color:${pal.primary};letter-spacing:.5px;display:flex;align-items:center;gap:.4rem;text-transform:uppercase}
    .services-section{background:#f0f4ff}
    .services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;margin-top:2.8rem}
    .why-section{background:${pal.primary};position:relative;overflow:hidden}
    .why-bg{position:absolute;inset:0;background-image:url('${heroImage}');background-size:cover;opacity:.07}
    .why-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.4rem;margin-top:2.8rem}
    .why-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:1.7rem;transition:background .25s,transform .25s}
    .why-card:hover{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);transform:translateY(-4px)}
    .why-card i{font-size:1.7rem;color:${pal.accent};margin-bottom:.9rem;display:block}
    .why-card h4{font-size:.97rem;font-weight:700;color:white;margin-bottom:.45rem}
    .why-card p{font-size:.84rem;color:rgba(255,255,255,.5);line-height:1.6}
    .reviews-section{background:white}
    .reviews-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;margin-top:2.8rem}
    .review-card{background:#f0f4ff;border-radius:14px;padding:1.7rem;border-left:4px solid ${pal.accent};transition:transform .2s}
    .review-card:hover{transform:translateY(-4px)}
    .stars{color:${pal.accent};font-size:.88rem;margin-bottom:.75rem}
    .review-card p{font-size:.92rem;color:#1e293b;line-height:1.7;font-style:italic;margin-bottom:.9rem}
    .reviewer{font-size:.8rem;font-weight:700;color:#0a1628}
    .booking-section{background:#f0f4ff}
    .booking-wrap{display:grid;grid-template-columns:1fr 1fr;gap:3rem;margin-top:2.8rem;align-items:start}
    .booking-form{background:white;border-radius:16px;padding:2rem;box-shadow:0 8px 32px rgba(10,22,40,.1)}
    .cta-section{background:linear-gradient(135deg,${pal.primary} 0%,#1a3a6b 60%,rgba(232,93,4,.2) 100%);text-align:center}
    .cta-phone{display:block;font-family:'Bebas Neue',sans-serif;font-size:2.6rem;color:${pal.accent};text-decoration:none;letter-spacing:2px;margin-bottom:1.4rem}
    @media(max-width:768px){.booking-wrap{grid-template-columns:1fr}}`;

  const indexBody = `
${previewBanner}
${poweredByBar}

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <div class="hero-badge"><i class="fas fa-shield-halved"></i> Licensed &amp; Insured \u00b7 ${city}${state?', '+state:''}</div>
    <h1>${bizFirst} <span>${bizLast}</span></h1>
    <p>${tagline}</p>
    <div class="hero-btns">
      ${phone?`<a href="tel:${phoneRaw}" class="btn-primary"><i class="fas fa-phone"></i> Call Now \u2014 Free Estimate</a>`:''}
      <a href="pricing.html" class="btn-outline"><i class="fas fa-tag"></i> View Pricing</a>
    </div>
    <div class="hero-stats">
      ${awards?`<div class="stat"><strong>\ud83c\udfc6</strong><span>${awards}</span></div>`:''}
      <div class="stat"><strong>5\u2605</strong><span>Average Rating</span></div>
      <div class="stat"><strong>24/7</strong><span>Emergency Line</span></div>
      <div class="stat"><strong>100%</strong><span>Satisfaction</span></div>
    </div>
  </div>
</section>

<div class="trust-bar reveal">
  <span><i class="fas fa-check-circle"></i> Licensed &amp; Bonded</span>
  <span><i class="fas fa-clock"></i> Same-Day Service</span>
  <span><i class="fas fa-dollar-sign"></i> Upfront Pricing</span>
  <span><i class="fas fa-star"></i> 5-Star Rated</span>
  <span><i class="fas fa-map-marker-alt"></i> ${city}${state?', '+state:''} &amp; Surrounding Areas</span>
</div>

${miniMeSection}

${serviceItems.length?`
<section class="services-section" id="services">
  <div class="container">
    <div class="reveal">
      <div class="section-label">What We Do</div>
      <h2 class="section-title" style="color:#0a1628;">Our Services</h2>
      <p class="section-sub">Proudly serving ${city}${state?', '+state:''} and surrounding areas.</p>
    </div>
    <div class="services-grid">${serviceCardsHTML}</div>
    ${payMethods?`<div class="reveal" style="text-align:center;margin-top:2rem;padding:1.2rem;background:white;border-radius:10px;"><p style="color:#64748b;font-size:.92rem;">\ud83d\udcb3 We accept: <strong style="color:#0a1628;">${payMethods}</strong></p></div>`:''}
    <div style="text-align:center;margin-top:2rem;" class="reveal">
      <a href="pricing.html" class="btn-primary"><i class="fas fa-tag"></i> View Full Pricing</a>
    </div>
  </div>
</section>`:''}

<section class="why-section" id="why">
  <div class="why-bg"></div>
  <div class="container" style="position:relative;z-index:2;">
    <div class="reveal">
      <div class="section-label">Why Choose Us</div>
      <h2 class="section-title" style="color:white;">The ${city} Standard</h2>
      <p class="section-sub" style="color:rgba(255,255,255,.6);">We're not just a ${industry} company \u2014 we're your neighbors.</p>
    </div>
    <div class="why-grid">
      <div class="why-card reveal"><i class="fas fa-stopwatch"></i><h4>Fast Response</h4><p>Same-day service available. 60-minute target arrival for emergencies.</p></div>
      <div class="why-card reveal"><i class="fas fa-tag"></i><h4>Upfront Pricing</h4><p>Flat price quoted before we start. No surprises, ever.</p></div>
      <div class="why-card reveal"><i class="fas fa-certificate"></i><h4>Licensed Professionals</h4><p>Every job performed by fully licensed and insured technicians.</p></div>
      <div class="why-card reveal"><i class="fas fa-broom"></i><h4>Clean Job Sites</h4><p>We protect your property and clean up completely before we leave.</p></div>
    </div>
    ${advantage?`<div class="reveal" style="margin-top:2.5rem;background:rgba(255,255,255,.07);border:1px solid rgba(245,158,11,.3);border-radius:14px;padding:1.5rem 2rem;display:flex;gap:1rem;"><i class="fas fa-trophy" style="color:${pal.accent};font-size:1.5rem;flex-shrink:0;"></i><p style="color:rgba(255,255,255,.85);line-height:1.7;">${advantage}</p></div>`:''}
  </div>
</section>

${about||ownerPhoto?`
<section style="padding:5.5rem 1.5rem;background:white;" id="about">
  <div class="container">
    <div style="display:grid;grid-template-columns:${ownerPhoto?'1fr 1fr':'1fr'};gap:3.5rem;align-items:center;">
      <div class="reveal">
        <div class="section-label">Our Story</div>
        <h2 class="section-title" style="color:#0a1628;">About ${biz}</h2>
        ${about?`<p style="font-size:1rem;color:#374151;line-height:1.85;">${about}</p>`:''}
      </div>
      ${ownerPhoto?`<div class="reveal"><img src="${ownerPhoto}" alt="${owner}" style="width:100%;border-radius:20px;object-fit:cover;max-height:420px;box-shadow:0 20px 60px rgba(0,0,0,.12);"></div>`:''}
    </div>
  </div>
</section>`:''}

<section class="reviews-section" id="reviews">
  <div class="container">
    <div class="reveal">
      <div class="section-label">Customer Reviews</div>
      <h2 class="section-title" style="color:#0a1628;">What Our Clients Say</h2>
    </div>
    <div class="reviews-grid">
      <div class="review-card reveal"><div class="stars">\u2605\u2605\u2605\u2605\u2605</div><p>"Fast, professional, and fair pricing. Showed up on time and got it done right the first time."</p><div class="reviewer">\u2014 Satisfied Customer, ${city}</div></div>
      <div class="review-card reveal"><div class="stars">\u2605\u2605\u2605\u2605\u2605</div><p>"Best ${industry} company in the area. Quoted less than the competition and the quality was excellent."</p><div class="reviewer">\u2014 Happy Client, ${state||city}</div></div>
      <div class="review-card reveal"><div class="stars">\u2605\u2605\u2605\u2605\u2605</div><p>"Called in the morning, they were here by noon. Explained everything clearly and left the place spotless."</p><div class="reviewer">\u2014 Local Homeowner, ${city}</div></div>
    </div>
  </div>
</section>

<section class="cta-section" id="contact">
  <div class="container">
    <div class="reveal">
      <div class="section-label" style="color:${pal.accent};">Ready to Get Started?</div>
      <h2 class="section-title" style="color:white;">Get Your Free Estimate Today</h2>
      <p style="color:rgba(255,255,255,.75);font-size:1.05rem;max-width:480px;margin:0 auto 2.2rem;line-height:1.7;">Call us now or submit a request. We respond within the hour during business hours.</p>
      ${phone?`<a href="tel:${phoneRaw}" class="cta-phone"><i class="fas fa-phone-volume"></i> ${phone}</a>`:''}
      <a href="scheduling.html" class="btn-primary" style="font-size:1rem;padding:.95rem 2.2rem;display:inline-flex;"><i class="fas fa-calendar-check"></i> Schedule Online</a>
    </div>
  </div>
</section>

${(hoursData.length||phone||email)?`
<section style="padding:5rem 1.5rem;background:${pal.primary};">
  <div class="container">
    <div style="text-align:center;margin-bottom:3rem;" class="reveal">
      <div class="section-label" style="color:${pal.accent};">Get In Touch</div>
      <h2 class="section-title" style="color:white;">Contact &amp; Hours</h2>
    </div>
    <div style="display:grid;grid-template-columns:${hoursData.length?'1fr 1fr':'1fr'};gap:2.5rem;">
      ${hoursData.length?`<div class="reveal" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2rem;"><h3 style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:white;letter-spacing:1px;margin-bottom:1.5rem;">Business Hours</h3>${hoursRows}</div>`:''}
      <div class="reveal" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2rem;">
        <h3 style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:white;letter-spacing:1px;margin-bottom:1.5rem;">Contact Us</h3>
        <div style="display:flex;flex-direction:column;gap:1rem;">
          ${phone?`<a href="tel:${phoneRaw}" style="display:flex;align-items:center;gap:1rem;color:white;text-decoration:none;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">\ud83d\udcde</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Phone</div><div style="font-size:1rem;font-weight:600;">${phone}</div></div></a>`:''}
          ${email?`<a href="mailto:${email}" style="display:flex;align-items:center;gap:1rem;color:white;text-decoration:none;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">\u2709\ufe0f</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Email</div><div style="font-size:.92rem;word-break:break-all;">${email}</div></div></a>`:''}
          ${address.length>5?`<div style="display:flex;align-items:flex-start;gap:1rem;padding:1rem;background:rgba(255,255,255,.07);border-radius:12px;"><span style="background:${pal.accent}22;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">\ud83d\udccd</span><div><div style="font-size:.72rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Location</div><div style="font-size:.92rem;color:rgba(255,255,255,.85);">${address}</div></div></div>`:''}
        </div>
      </div>
    </div>
  </div>
</section>`:''}`;

  const indexPage = wrapPage(
    `${biz}${isPreview?' | PREVIEW':''} | ${city}`,
    'index',
    indexBody,
    indexExtraCSS
  );

  // ══════════════════════════════════════
  // ── PRICING PAGE ──
  // ══════════════════════════════════════
  const pricingExtraCSS = `
    .page-hero{background:linear-gradient(135deg,${pal.primary} 0%,#1a3a6b 100%);padding:8rem 1.5rem 4rem;text-align:center}
    .services-section{background:#f0f4ff}
    .services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.4rem;margin-top:2.8rem}`;

  const pricingBody = `
<section class="page-hero">
  <div class="container">
    <div class="section-label" style="color:${pal.accent};">Transparent Pricing</div>
    <h1 class="section-title" style="color:white;font-size:clamp(2.4rem,6vw,4rem);">Our Services &amp; Pricing</h1>
    <p style="color:rgba(255,255,255,.75);font-size:1.05rem;max-width:520px;margin:1rem auto 0;line-height:1.7;">${tagline}</p>
  </div>
</section>

${serviceItems.length?`
<section class="services-section">
  <div class="container">
    <div class="reveal">
      <div class="section-label">What We Offer</div>
      <h2 class="section-title" style="color:#0a1628;">Services &amp; Rates</h2>
      <p class="section-sub">Proudly serving ${city}${state?', '+state:''} and surrounding areas. All prices are estimates \u2014 call for an exact quote.</p>
    </div>
    <div class="services-grid">${serviceCardsHTML}</div>
    ${payMethods?`<div class="reveal" style="text-align:center;margin-top:2rem;padding:1.2rem;background:white;border-radius:10px;"><p style="color:#64748b;font-size:.92rem;">\ud83d\udcb3 We accept: <strong style="color:#0a1628;">${payMethods}</strong></p></div>`:''}
  </div>
</section>`:`
<section style="padding:5.5rem 1.5rem;background:#f0f4ff;">
  <div class="container" style="text-align:center;">
    <h2 class="section-title" style="color:#0a1628;">Free Estimates on All Jobs</h2>
    <p style="color:#64748b;font-size:1rem;max-width:480px;margin:0 auto 2rem;">We provide free, no-obligation estimates. Every job is different \u2014 call us and we'll give you an honest quote.</p>
  </div>
</section>`}

<section style="padding:4rem 1.5rem;background:white;text-align:center;">
  <div class="container reveal">
    <h2 class="section-title" style="color:#0a1628;">Ready for a Free Estimate?</h2>
    <p style="color:#64748b;margin-bottom:2rem;font-size:1rem;">No hidden fees. No surprises. Just honest pricing.</p>
    <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
      ${phone?`<a href="tel:${phoneRaw}" class="btn-primary"><i class="fas fa-phone"></i> Call ${phone}</a>`:''}
      <a href="scheduling.html" class="btn-outline" style="color:#0a1628;border-color:#0a1628;"><i class="fas fa-calendar-check"></i> Schedule Online</a>
    </div>
  </div>
</section>`;

  const pricingPage = wrapPage(
    `Pricing | ${biz} | ${city}`,
    'pricing',
    pricingBody,
    pricingExtraCSS
  );

  // ══════════════════════════════════════
  // ── SCHEDULING PAGE ──
  // ══════════════════════════════════════
  const schedClientId = (!isPreview && clientObj) ? clientObj.id : '';

  const schedulingExtraCSS = `
    .page-hero{background:linear-gradient(135deg,${pal.primary} 0%,#1a3a6b 100%);padding:8rem 1.5rem 4rem;text-align:center}
    .sched-section{background:#f0f4ff;padding:3.5rem 1.5rem 5rem}
    .week-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem}
    .week-nav button{background:${pal.accent};color:${pal.primary};border:none;border-radius:8px;padding:8px 18px;font-weight:700;font-size:.85rem;cursor:pointer;font-family:inherit}
    .week-nav button:hover{background:${pal.accent2};color:white}
    .week-label{font-weight:700;font-size:1rem;color:#0a1628}
    .week-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:2rem}
    .day-col{background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;min-width:0}
    .day-header{padding:10px 6px;text-align:center;background:#f8fafc;border-bottom:1px solid #e2e8f0}
    .day-header.today{background:${pal.accent};color:${pal.primary}}
    .day-header.today .dh-name,.day-header.today .dh-date{color:${pal.primary}}
    .dh-name{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:2px}
    .dh-date{font-size:1.15rem;font-weight:800;color:#0a1628}
    .dh-month{font-size:.6rem;color:#94a3b8;margin-top:1px}
    .day-closed{padding:16px 6px;text-align:center;color:#dc2626;font-size:.72rem;font-weight:600}
    .day-slots{padding:4px}
    .ts{padding:7px 4px;margin:3px 0;border-radius:6px;text-align:center;font-size:.75rem;font-weight:600;cursor:pointer;border:1.5px solid #e2e8f0;background:white;transition:all .15s}
    .ts.avail:hover{border-color:${pal.accent};background:#fffcf5}
    .ts.avail.sel{border-color:${pal.accent};background:${pal.accent};color:${pal.primary}}
    .ts.booked{background:#fee2e2;border-color:#fecaca;color:#dc2626;cursor:not-allowed;text-decoration:line-through;opacity:.55;font-size:.7rem}
    .ts.past{background:#f1f5f9;border-color:#e2e8f0;color:#cbd5e1;cursor:not-allowed;font-size:.7rem}
    .sched-form{background:white;border-radius:16px;padding:2rem;box-shadow:0 8px 32px rgba(10,22,40,.1);margin-top:2rem}
    .sel-banner{background:#f0f9ff;border:2px solid ${pal.accent};border-radius:10px;padding:14px 18px;margin-bottom:1.4rem;text-align:center;display:none}
    .sel-banner p{margin:0;font-size:.95rem;color:#1e40af;font-weight:600}
    .book-btn{width:100%;background:${pal.accent};color:${pal.primary};border:none;border-radius:10px;padding:1rem;font-size:1.05rem;font-weight:800;cursor:pointer;font-family:inherit;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:.5rem}
    .book-btn:hover:not(:disabled){background:${pal.accent2};color:white;transform:translateY(-1px)}
    .book-btn:disabled{opacity:.45;cursor:not-allowed}
    .confirm-banner{background:#f0fff4;border:2px solid #00D68F;border-radius:12px;padding:1.5rem;text-align:center;margin-top:1.5rem;display:none}
    .sched-loading{text-align:center;padding:20px 6px;color:#94a3b8;font-size:.78rem}
    @media(max-width:900px){.week-grid{grid-template-columns:repeat(4,1fr)}.day-col:nth-child(n+5){margin-top:0}}
    @media(max-width:600px){.week-grid{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:420px){.week-grid{grid-template-columns:repeat(2,1fr)}}`;

  const schedulingBody = `
<section class="page-hero">
  <div class="container">
    <div class="section-label" style="color:${pal.accent};">Easy Scheduling</div>
    <h1 class="section-title" style="color:white;font-size:clamp(2.4rem,6vw,4rem);">Book Your Appointment</h1>
    <p style="color:rgba(255,255,255,.75);font-size:1.05rem;max-width:520px;margin:1rem auto 0;line-height:1.7;">Pick a day and time — you'll get instant confirmation.</p>
  </div>
</section>

<section class="sched-section">
  <div class="container">
    <div class="reveal">
      <div class="section-label">1. Choose a Date &amp; Time</div>
      <div class="week-nav">
        <button onclick="shiftWeek(-7)"><i class="fas fa-chevron-left"></i> Previous</button>
        <span class="week-label" id="weekLabel"></span>
        <button onclick="shiftWeek(7)">Next <i class="fas fa-chevron-right"></i></button>
      </div>
    </div>
    <div class="week-grid" id="weekGrid">
      <div class="sched-loading"><i class="fas fa-spinner fa-spin"></i> Loading schedule...</div>
    </div>

    <div class="sched-form reveal">
      <div class="section-label">2. Your Information</div>
      <div class="sel-banner" id="selBanner">
        <p><i class="fas fa-calendar-check" style="margin-right:6px;"></i> <span id="selText"></span></p>
      </div>
      <div class="form-row">
        <div class="form-group"><label>First Name</label><input type="text" id="book_fname" placeholder="John"></div>
        <div class="form-group"><label>Last Name</label><input type="text" id="book_lname" placeholder="Smith"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Phone</label><input type="tel" id="book_phone" placeholder="${phone||'(555) 555-0000'}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="book_email" placeholder="you@email.com"></div>
      </div>
      <div class="form-group">
        <label>Service Needed</label>
        <select id="book_service">
          <option value="">Select a service\u2026</option>
          ${serviceItems.length?serviceItems.map(s=>`<option>${s.name}</option>`).join(''):`<option>${industry.charAt(0).toUpperCase()+industry.slice(1)} Service</option>`}
          <option>Other / Not Sure</option>
        </select>
      </div>
      <div class="form-group"><label>Describe the Issue</label><textarea id="book_notes" placeholder="Brief description\u2026"></textarea></div>
      <button class="book-btn" id="bookBtn" onclick="submitBooking(this)" disabled>
        <i class="fas fa-calendar-check"></i> Select a Date &amp; Time Above
      </button>
      <div class="confirm-banner" id="confirmBanner">
        <h3 style="color:#065f46;margin:0 0 6px;">\u2705 Appointment Saved!</h3>
        <p id="confirmText" style="color:#374151;margin:0;font-size:1rem;"></p>
        <p style="color:#64748b;font-size:.85rem;margin:8px 0 0;">Check your email and phone for confirmation details.</p>
      </div>
    </div>

    ${hoursData.length ? `<div style="margin-top:2rem;background:white;border-radius:14px;padding:1.5rem;border:1px solid #e5e7eb;" class="reveal"><h4 style="font-size:.95rem;font-weight:700;color:#0a1628;margin-bottom:1rem;"><i class="fas fa-clock" style="color:${pal.accent};margin-right:.4rem;"></i> Business Hours</h4>${hoursRowsLight}</div>` : ''}
  </div>
</section>

<script>
(function(){
  var API='${BASE_URL}';
  var CLIENT_ID='${schedClientId}';
  var selDate=null,selTime=null;
  var weekOffset=0;
  var slotCache={};

  function pad(n){return n<10?'0'+n:''+n;}

  function getWeekDates(offset){
    var dates=[];
    var now=new Date();
    now.setDate(now.getDate()+offset);
    for(var i=0;i<7;i++){
      var d=new Date(now);
      d.setDate(now.getDate()+i);
      dates.push(d);
    }
    return dates;
  }

  function fmtDateStr(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}

  function buildWeek(){
    var dates=getWeekDates(weekOffset);
    var dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var today=fmtDateStr(new Date());
    var first=dates[0],last=dates[6];
    document.getElementById('weekLabel').textContent=monthNames[first.getMonth()]+' '+first.getDate()+' \u2013 '+monthNames[last.getMonth()]+' '+last.getDate()+', '+last.getFullYear();
    var grid=document.getElementById('weekGrid');
    grid.innerHTML='';
    dates.forEach(function(d){
      var ds=fmtDateStr(d);
      var isToday=ds===today;
      var col=document.createElement('div');
      col.className='day-col';
      col.innerHTML='<div class="day-header'+(isToday?' today':'')+'"><div class="dh-name">'+dayNames[d.getDay()]+'</div><div class="dh-date">'+d.getDate()+'</div><div class="dh-month">'+monthNames[d.getMonth()]+'</div></div><div class="day-slots" id="slots_'+ds+'"><div class="sched-loading" style="padding:12px 4px;font-size:.7rem;"><i class="fas fa-spinner fa-spin"></i></div></div>';
      grid.appendChild(col);
      loadDaySlots(ds);
    });
  }

  function loadDaySlots(ds){
    var container=document.getElementById('slots_'+ds);
    if(!container)return;
    if(!CLIENT_ID){
      container.innerHTML='<div class="sched-loading" style="font-size:.68rem;padding:10px 4px;">Available when live</div>';
      return;
    }
    if(slotCache[ds]){
      renderSlots(ds,slotCache[ds]);
      return;
    }
    fetch(API+'/api/appointments/available/'+CLIENT_ID+'?date='+ds)
      .then(function(r){return r.json();})
      .then(function(data){
        slotCache[ds]=data;
        renderSlots(ds,data);
      })
      .catch(function(){
        container.innerHTML='<div class="sched-loading" style="font-size:.68rem;color:#dc2626;">Error</div>';
      });
  }

  function renderSlots(ds,data){
    var container=document.getElementById('slots_'+ds);
    if(!container)return;
    if(data.closed){
      container.innerHTML='<div class="day-closed">Closed</div>';
      return;
    }
    if(!data.slots||!data.slots.length){
      container.innerHTML='<div class="day-closed" style="color:#94a3b8;">No slots</div>';
      return;
    }
    var html='';
    data.slots.forEach(function(s){
      var shortTime=s.time.replace(':00 ',' ');
      if(s.available){
        var isSel=(selDate===ds&&selTime===s.time);
        html+='<div class="ts avail'+(isSel?' sel':'')+'" onclick="pickSlot(\\''+ds+'\\',\\''+s.time+'\\')">'+shortTime+'</div>';
      }else{
        html+='<div class="ts booked">'+shortTime+'</div>';
      }
    });
    container.innerHTML=html;
  }

  window.pickSlot=function(date,time){
    selDate=date;selTime=time;
    // Re-render all visible days to update selection highlight
    Object.keys(slotCache).forEach(function(ds){renderSlots(ds,slotCache[ds]);});
    updateBanner();
  };

  function updateBanner(){
    var banner=document.getElementById('selBanner');
    var btn=document.getElementById('bookBtn');
    if(selDate&&selTime){
      var d=new Date(selDate+'T12:00:00');
      var nice=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
      document.getElementById('selText').textContent=nice+' at '+selTime;
      banner.style.display='block';
      btn.disabled=false;
      btn.innerHTML='<i class="fas fa-calendar-check"></i> Save '+selTime+' Appointment';
    }else{
      banner.style.display='none';
      btn.disabled=true;
      btn.innerHTML='<i class="fas fa-calendar-check"></i> Select a Date & Time Above';
    }
  }

  window.shiftWeek=function(days){
    var newOffset=weekOffset+days;
    if(newOffset<0)newOffset=0;
    if(newOffset>21)return; // max 4 weeks ahead
    weekOffset=newOffset;
    buildWeek();
  };

  window.submitBooking=function(btn){
    if(!selDate||!selTime){alert('Please select a date and time.');return;}
    var ph=document.getElementById('book_phone').value.trim();
    var em=document.getElementById('book_email').value.trim();
    if(!ph&&!em){alert('Please enter a phone number or email so we can confirm your appointment.');return;}
    btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving\u2026';btn.disabled=true;
    fetch(API+'/api/appointments/book',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        clientId:CLIENT_ID,date:selDate,time:selTime,
        firstName:document.getElementById('book_fname').value.trim(),
        lastName:document.getElementById('book_lname').value.trim(),
        phone:ph,email:em,
        service:document.getElementById('book_service').value,
        notes:document.getElementById('book_notes').value.trim()
      })
    })
    .then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d};});})
    .then(function(res){
      if(!res.ok){
        if(res.data.error&&res.data.error.indexOf('just booked')>-1){
          alert(res.data.error);
          delete slotCache[selDate];
          loadDaySlots(selDate);
          selTime=null;updateBanner();
          btn.innerHTML='<i class="fas fa-calendar-check"></i> Select a Date & Time Above';btn.disabled=true;
        }else{
          alert(res.data.error||'Booking failed. Please try again.');
          btn.innerHTML='<i class="fas fa-calendar-check"></i> Save '+selTime+' Appointment';btn.disabled=false;
        }
        return;
      }
      // Success
      var d=new Date(selDate+'T12:00:00');
      var nice=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
      btn.innerHTML='<i class="fas fa-check-circle"></i> Saved!';btn.style.background='#16a34a';btn.style.color='white';
      document.getElementById('confirmText').textContent=nice+' at '+selTime;
      document.getElementById('confirmBanner').style.display='block';
      document.getElementById('selBanner').innerHTML='<p style="margin:0;color:#065f46;font-weight:700;">\u2705 Your appointment has been saved!</p>';
      // Refresh that day to show the slot as booked
      delete slotCache[selDate];
      loadDaySlots(selDate);
    })
    .catch(function(){
      btn.innerHTML='<i class="fas fa-calendar-check"></i> Save '+selTime+' Appointment';btn.disabled=false;
      alert('Something went wrong. Please call us directly.');
    });
  };

  buildWeek();
})();
<\/script>`;

  const schedulingPage = wrapPage(
    `Schedule | ${biz} | ${city}`,
    'scheduling',
    schedulingBody,
    schedulingExtraCSS
  );

  // ══════════════════════════════════════
  // ── MESSAGING PAGE ──
  // ══════════════════════════════════════
  const messagingExtraCSS = `
    .page-hero{background:linear-gradient(135deg,${pal.primary} 0%,#1a3a6b 100%);padding:8rem 1.5rem 4rem;text-align:center}
    .contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:3rem;margin-top:2.8rem;align-items:start}
    .contact-form{background:white;border-radius:16px;padding:2rem;box-shadow:0 8px 32px rgba(10,22,40,.1)}
    @media(max-width:768px){.contact-grid{grid-template-columns:1fr}}`;

  const messagingBody = `
<section class="page-hero">
  <div class="container">
    <div class="section-label" style="color:${pal.accent};">Get In Touch</div>
    <h1 class="section-title" style="color:white;font-size:clamp(2.4rem,6vw,4rem);">Send Us a Message</h1>
    <p style="color:rgba(255,255,255,.75);font-size:1.05rem;max-width:520px;margin:1rem auto 0;line-height:1.7;">Have a question? We'll get back to you within the hour during business hours.</p>
  </div>
</section>

<section style="padding:5.5rem 1.5rem;background:#f0f4ff;">
  <div class="container">
    <div class="contact-grid">
      <div>
        <div class="reveal" style="margin-bottom:2rem;">
          <div class="section-label">Contact Information</div>
          <h2 class="section-title" style="color:#0a1628;">Reach Us Directly</h2>
        </div>
        <div style="display:flex;flex-direction:column;gap:1rem;" class="reveal">
          ${phone?`<a href="tel:${phoneRaw}" style="display:flex;align-items:center;gap:1rem;color:#0a1628;text-decoration:none;padding:1.2rem;background:white;border-radius:12px;border:1px solid #e5e7eb;transition:transform .2s;"><span style="background:${pal.accent};width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${pal.primary};font-size:1.2rem;"><i class="fas fa-phone"></i></span><div><div style="font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Phone</div><div style="font-size:1.05rem;font-weight:700;">${phone}</div></div></a>`:''}
          ${email?`<a href="mailto:${email}" style="display:flex;align-items:center;gap:1rem;color:#0a1628;text-decoration:none;padding:1.2rem;background:white;border-radius:12px;border:1px solid #e5e7eb;transition:transform .2s;"><span style="background:${pal.accent};width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${pal.primary};font-size:1.2rem;"><i class="fas fa-envelope"></i></span><div><div style="font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Email</div><div style="font-size:.95rem;font-weight:600;word-break:break-all;">${email}</div></div></a>`:''}
          ${address.length>5?`<div style="display:flex;align-items:flex-start;gap:1rem;padding:1.2rem;background:white;border-radius:12px;border:1px solid #e5e7eb;"><span style="background:${pal.accent};width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${pal.primary};font-size:1.2rem;"><i class="fas fa-map-marker-alt"></i></span><div><div style="font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Location</div><div style="font-size:.95rem;font-weight:600;color:#0a1628;">${address}</div></div></div>`:''}
        </div>
        ${hoursData.length ? `<div style="margin-top:1.5rem;background:white;border-radius:14px;padding:1.5rem;border:1px solid #e5e7eb;" class="reveal"><h4 style="font-size:.95rem;font-weight:700;color:#0a1628;margin-bottom:1rem;"><i class="fas fa-clock" style="color:${pal.accent};margin-right:.4rem;"></i> Business Hours</h4>${hoursRowsLight}</div>` : ''}
      </div>
      <div class="contact-form reveal">
        <h4 style="font-size:1.05rem;font-weight:700;color:#0a1628;margin-bottom:1.4rem;"><i class="fas fa-envelope" style="color:${pal.accent};margin-right:.4rem;"></i> Send a Message</h4>
        <div class="form-row">
          <div class="form-group"><label>First Name</label><input type="text" id="msg_fname" placeholder="John"></div>
          <div class="form-group"><label>Last Name</label><input type="text" id="msg_lname" placeholder="Smith"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Phone</label><input type="tel" id="msg_phone" placeholder="${phone||'(555) 555-0000'}"></div>
          <div class="form-group"><label>Email</label><input type="email" id="msg_email" placeholder="you@email.com"></div>
        </div>
        <div class="form-group"><label>Subject</label>
          <select id="msg_subject">
            <option value="General Question">General Question</option>
            <option value="Request a Quote">Request a Quote</option>
            <option value="Service Inquiry">Service Inquiry</option>
            <option value="Feedback">Feedback</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group"><label>Your Message</label><textarea id="msg_notes" rows="5" placeholder="How can we help you?"></textarea></div>
        <button class="btn-book" onclick="handleMessage(this)"><i class="fas fa-paper-plane"></i> Send Message</button>
        <p style="font-size:.72rem;color:#64748b;text-align:center;margin-top:.65rem;">We respond within 1 hour during business hours.</p>
      </div>
    </div>
  </div>
</section>

<script>
function handleMessage(btn){
  var fname=document.getElementById('msg_fname').value.trim();
  var lname=document.getElementById('msg_lname').value.trim();
  var phone=document.getElementById('msg_phone').value.trim();
  var email=document.getElementById('msg_email').value.trim();
  var subject=document.getElementById('msg_subject').value;
  var notes=document.getElementById('msg_notes').value.trim();
  if(!phone&&!email){alert('Please enter a phone number or email so we can get back to you.');return;}
  if(!notes){alert('Please enter a message.');return;}
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Sending...';btn.disabled=true;
  fetch('${BASE_URL}/api/booking-lead',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({firstName:fname,lastName:lname,phone:phone,email:email,service:subject,notes:notes,businessName:'${biz.replace(/'/g,"\\'")}',businessEmail:'${email.replace(/'/g,"\\'")}',businessPhone:'${phone.replace(/'/g,"\\'")}',city:'${city.replace(/'/g,"\\'")}',industry:'${industry.replace(/'/g,"\\'")}' })
  })
  .then(function(r){return r.json();})
  .then(function(){btn.innerHTML='<i class="fas fa-check"></i> Message Sent!';btn.style.background='#16a34a';btn.style.color='white';document.getElementById('msg_notes').value='';setTimeout(function(){btn.innerHTML='<i class="fas fa-paper-plane"></i> Send Message';btn.style.background='';btn.style.color='';btn.disabled=false;},5000);})
  .catch(function(){btn.innerHTML='<i class="fas fa-paper-plane"></i> Send Message';btn.disabled=false;alert('Something went wrong. Please call us directly.');});
}
<\/script>`;

  const messagingPage = wrapPage(
    `Contact Us | ${biz} | ${city}`,
    'messaging',
    messagingBody,
    messagingExtraCSS
  );

  // ══════════════════════════════════════
  // ── RETURN MULTI-PAGE OBJECT ──
  // ══════════════════════════════════════
  return {
    index: indexPage,
    pricing: pricingPage,
    scheduling: schedulingPage,
    messaging: messagingPage
  };
}

console.log('[module] lib/site-generator.js loaded');

module.exports = { generateSiteHTML };
