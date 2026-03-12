<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Chat & Mini-Me | TurnkeyAI Services</title>
    <meta name="description" content="Every TurnkeyAI website includes a 24/7 AI chat assistant. Add Mini-Me — your personal AI avatar — and never miss a lead again.">
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
    <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        :root{--primary:#0066FF;--primary-dark:#0052CC;--accent:#00D68F;--dark:#1a1a2e;--gray-700:#374151;--gray-500:#6B7280;--gray-100:#F3F4F6;}
        body{font-family:'DM Sans',sans-serif;color:#1F2937;}
        /* NAV */
        .nav{background:white;box-shadow:0 2px 20px rgba(0,0,0,0.08);padding:18px 0;position:sticky;top:0;z-index:100;}
        .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;justify-content:space-between;align-items:center;}
        .logo{font-size:24px;font-weight:700;color:var(--dark);text-decoration:none;}
        .logo span{color:var(--accent);}
        .nav-links{display:flex;gap:28px;align-items:center;}
        .nav-links a{text-decoration:none;color:var(--gray-500);font-weight:500;font-size:15px;transition:color 0.2s;}
        .nav-links a:hover,.nav-links a.active{color:var(--primary);}
        .nav-cta{background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:white;padding:11px 22px;border-radius:9px;font-weight:600;font-size:14px;text-decoration:none;}
        @media(max-width:640px){.nav-links a:not(.nav-cta){display:none;}}
        /* HERO */
        .hero{background:linear-gradient(135deg,#080c22 0%,#1a1a2e 55%,#0a1f30 100%);color:white;padding:90px 24px 70px;text-align:center;position:relative;overflow:hidden;}
        .hero::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at center,rgba(0,102,255,0.12) 0%,transparent 60%);}
        .hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,214,143,0.13);border:1px solid rgba(0,214,143,0.4);color:var(--accent);padding:7px 18px;border-radius:20px;font-size:13px;font-weight:700;margin-bottom:22px;position:relative;}
        .hero h1{font-family:'Playfair Display',serif;font-size:54px;font-weight:700;margin-bottom:20px;line-height:1.15;position:relative;}
        .hero h1 .hl{background:linear-gradient(135deg,var(--accent),#00b377);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
        .hero p{font-size:19px;opacity:0.82;max-width:580px;margin:0 auto 36px;line-height:1.7;position:relative;}
        .hero-btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;position:relative;}
        .btn-hero-primary{background:linear-gradient(135deg,var(--accent),#00b377);color:#0a1628;padding:16px 36px;border-radius:11px;font-weight:700;font-size:16px;text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:all 0.2s;}
        .btn-hero-primary:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,214,143,0.4);}
        .btn-hero-secondary{background:rgba(255,255,255,0.09);color:white;padding:16px 36px;border-radius:11px;font-weight:600;font-size:16px;text-decoration:none;border:2px solid rgba(255,255,255,0.22);transition:all 0.2s;}
        .btn-hero-secondary:hover{background:rgba(255,255,255,0.16);}
        /* STATS */
        .stats{background:var(--dark);padding:44px 24px;}
        .stats-inner{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:28px;text-align:center;}
        .stat-num{font-family:'Playfair Display',serif;font-size:46px;font-weight:700;color:var(--accent);}
        .stat-label{color:rgba(255,255,255,0.65);font-size:14px;margin-top:4px;}
        /* SECTION LAYOUT */
        .section{padding:80px 24px;}
        .section-inner{max-width:1100px;margin:0 auto;}
        .section-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--primary);margin-bottom:10px;}
        .section h2{font-family:'Playfair Display',serif;font-size:40px;font-weight:700;color:var(--dark);margin-bottom:14px;line-height:1.2;}
        .section .sub{font-size:17px;color:var(--gray-500);max-width:560px;line-height:1.7;margin-bottom:44px;}
        .two-col{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:start;}
        @media(max-width:768px){.two-col{grid-template-columns:1fr;}.hero h1{font-size:36px;}}
        /* FEATURES */
        .feature-list{display:flex;flex-direction:column;gap:22px;}
        .feature-item{display:flex;gap:14px;align-items:flex-start;}
        .feature-icon{width:46px;height:46px;background:linear-gradient(135deg,var(--primary),var(--accent));border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
        .feature-text h3{font-weight:700;font-size:16px;color:var(--dark);margin-bottom:3px;}
        .feature-text p{font-size:13px;color:var(--gray-500);line-height:1.6;}
        /* CHAT DEMO */
        .chat-demo{background:white;border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,0.12);overflow:hidden;}
        .chat-header{background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:white;padding:18px 22px;display:flex;align-items:center;gap:12px;}
        .chat-header .avatar{width:38px;height:38px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
        .chat-header h3{font-weight:700;font-size:15px;}
        .chat-header p{font-size:12px;opacity:0.8;}
        .chat-header .online{display:flex;align-items:center;gap:5px;font-size:12px;opacity:0.85;margin-left:auto;white-space:nowrap;}
        .online-dot{width:7px;height:7px;background:var(--accent);border-radius:50%;animation:pulse 2s infinite;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
        .chat-messages{padding:20px;min-height:260px;display:flex;flex-direction:column;gap:14px;max-height:340px;overflow-y:auto;}
        .chat-msg{max-width:82%;}
        .chat-msg.bot{align-self:flex-start;}
        .chat-msg.user{align-self:flex-end;}
        .chat-name{font-size:11px;color:var(--gray-500);margin-bottom:3px;font-weight:600;}
        .chat-bubble{padding:11px 15px;border-radius:14px;font-size:14px;line-height:1.6;}
        .bot .chat-bubble{background:var(--gray-100);color:var(--dark);border-bottom-left-radius:4px;}
        .user .chat-bubble{background:var(--primary);color:white;border-bottom-right-radius:4px;}
        .typing{display:none;align-self:flex-start;}
        .typing .chat-bubble{padding:11px 18px;}
        .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#9CA3AF;margin:0 2px;animation:bounce 1.4s infinite;}
        .dot:nth-child(2){animation-delay:0.2s;}.dot:nth-child(3){animation-delay:0.4s;}
        @keyframes bounce{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-5px);}}
        .quick-replies{display:flex;flex-wrap:wrap;gap:7px;padding:0 20px 14px;}
        .qr-btn{background:#e8f0fe;color:var(--primary);border:none;padding:7px 14px;border-radius:18px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;}
        .qr-btn:hover{background:var(--primary);color:white;}
        .chat-input-row{display:flex;gap:10px;padding:14px 20px;border-top:1px solid #eee;}
        .chat-input-row input{flex:1;padding:11px 14px;border:2px solid #eee;border-radius:9px;font-size:14px;font-family:inherit;}
        .chat-input-row input:focus{outline:none;border-color:var(--primary);}
        .chat-send{background:var(--primary);color:white;border:none;border-radius:9px;padding:11px 18px;font-weight:600;cursor:pointer;font-size:14px;}
        /* MINI-ME SECTION */
        .mini-me-section{background:linear-gradient(135deg,#080d1e,#0d1f14);padding:90px 24px;color:white;}
        .mini-me-inner{max-width:1100px;margin:0 auto;}
        .mini-me-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,214,143,0.12);border:1px solid rgba(0,214,143,0.4);color:var(--accent);padding:7px 18px;border-radius:20px;font-size:13px;font-weight:700;margin-bottom:20px;}
        .mini-me-inner h2{font-family:'Playfair Display',serif;font-size:46px;font-weight:700;margin-bottom:18px;line-height:1.2;}
        .mini-me-inner .sub{font-size:18px;opacity:0.78;max-width:580px;line-height:1.7;margin-bottom:44px;}
        .mm-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-bottom:44px;}
        .mm-step{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:14px;padding:24px;}
        .mm-step .num{font-size:30px;font-weight:700;color:var(--accent);margin-bottom:10px;}
        .mm-step h3{font-size:16px;font-weight:700;margin-bottom:7px;}
        .mm-step p{font-size:13px;opacity:0.72;line-height:1.6;}
        .mm-cta{background:rgba(0,214,143,0.07);border:2px solid rgba(0,214,143,0.28);border-radius:18px;padding:36px;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center;}
        @media(max-width:580px){.mm-cta{grid-template-columns:1fr;}}
        .mm-cta h3{font-size:22px;font-weight:700;margin-bottom:8px;}
        .mm-cta p{font-size:14px;opacity:0.78;line-height:1.6;}
        .price-tag{font-size:46px;font-weight:700;color:var(--accent);white-space:nowrap;text-align:center;}
        .price-tag .mo{font-size:17px;opacity:0.65;}
        .price-free{font-size:12px;opacity:0.6;margin-top:4px;text-align:center;}
        .btn-mm{display:inline-block;background:linear-gradient(135deg,var(--accent),#00b377);color:#0a1628;padding:15px 32px;border-radius:11px;font-weight:700;font-size:15px;text-decoration:none;margin-top:14px;transition:all 0.2s;}
        .btn-mm:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,214,143,0.4);}
        /* PRICING */
        .pricing-section{background:var(--gray-100);padding:80px 24px;}
        .pricing-inner{max-width:820px;margin:0 auto;text-align:center;}
        .pricing-inner h2{font-family:'Playfair Display',serif;font-size:40px;color:var(--dark);margin-bottom:12px;}
        .pricing-inner .sub{font-size:17px;color:var(--gray-500);margin-bottom:44px;}
        .pricing-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;}
        @media(max-width:580px){.pricing-grid{grid-template-columns:1fr;}}
        .price-card{background:white;border:2px solid #e5e7eb;border-radius:18px;padding:30px;text-align:left;position:relative;}
        .price-card.featured{border-color:var(--accent);box-shadow:0 8px 32px rgba(0,214,143,0.18);}
        .pc-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--accent);color:#0a1628;padding:4px 16px;border-radius:18px;font-size:12px;font-weight:700;white-space:nowrap;}
        .price-card h3{font-size:18px;font-weight:700;color:var(--dark);margin-bottom:8px;}
        .price-card .price{font-family:'Playfair Display',serif;font-size:40px;font-weight:700;color:var(--primary);margin-bottom:3px;}
        .price-card .price-sub{font-size:12px;color:var(--gray-500);margin-bottom:22px;}
        .price-card ul{list-style:none;display:flex;flex-direction:column;gap:9px;}
        .price-card ul li{font-size:13px;color:var(--gray-700);display:flex;align-items:flex-start;gap:7px;line-height:1.5;}
        .price-card ul li::before{content:'✓';color:var(--accent);font-weight:700;flex-shrink:0;}
        .price-card .pc-cta{display:block;text-align:center;margin-top:22px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:white;padding:13px;border-radius:9px;font-weight:600;text-decoration:none;font-size:14px;transition:all 0.2s;}
        .price-card .pc-cta:hover{transform:translateY(-2px);}
        /* FOOTER */
        footer{background:var(--dark);color:rgba(255,255,255,0.55);text-align:center;padding:28px 24px;font-size:14px;}
        footer a{color:var(--accent);text-decoration:none;}
    </style>
</head>
<body>

<nav class="nav">
    <div class="nav-inner">
        <a href="/" class="logo">TurnkeyAI<span>Services</span></a>
        <div class="nav-links">
            <a href="/">Home</a>
            <a href="/business.html">Business Sites</a>
            <a href="/chatbot.html" class="active">AI Chat & Mini-Me</a>
            <a href="/turnkeyai-intake-form.html" class="nav-cta">Get Started Free</a>
        </div>
    </div>
</nav>

<!-- HERO -->
<section class="hero">
    <div class="hero-badge">🤖 AI Chat & Avatar Technology</div>
    <h1>Your Business Never<br>Sleeps with <span class="hl">AI Chat</span></h1>
    <p>Every TurnkeyAI website comes with a 24/7 AI assistant that answers questions, captures leads, and books appointments — even at 2am on a Sunday.</p>
    <div class="hero-btns">
        <a href="#demo" class="btn-hero-primary">💬 Try the Live Demo</a>
        <a href="#mini-me" class="btn-hero-secondary">🎬 See Mini-Me</a>
    </div>
</section>

<!-- STATS -->
<div class="stats">
    <div class="stats-inner">
        <div><div class="stat-num">67%</div><div class="stat-label">of missed calls never call back</div></div>
        <div><div class="stat-num">24/7</div><div class="stat-label">AI captures leads while you sleep</div></div>
        <div><div class="stat-num">3×</div><div class="stat-label">more conversions with instant response</div></div>
        <div><div class="stat-num">$0</div><div class="stat-label">extra — included in your plan</div></div>
    </div>
</div>

<!-- AI CHAT FEATURES + DEMO -->
<section class="section" id="demo">
    <div class="section-inner">
        <div class="two-col">
            <div>
                <div class="section-label">AI Chat Assistant</div>
                <h2>Your 24/7 Virtual Receptionist</h2>
                <p class="sub">Built into every TurnkeyAI website at no extra charge. Your AI knows your business inside and out.</p>
                <div class="feature-list">
                    <div class="feature-item">
                        <div class="feature-icon">💬</div>
                        <div class="feature-text"><h3>Answers questions instantly</h3><p>Hours, services, pricing, availability — your AI responds in seconds, any time of day.</p></div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon">📋</div>
                        <div class="feature-text"><h3>Captures leads 24/7</h3><p>While you're on a job or asleep, your AI is collecting contact info and booking inquiries.</p></div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon">🎯</div>
                        <div class="feature-text"><h3>Matches your personality</h3><p>Set it to professional, friendly, warm, or confident. Your AI represents your brand your way.</p></div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon">📱</div>
                        <div class="feature-text"><h3>Missed call text return</h3><p>Any missed call triggers an instant SMS so you never lose a lead to voicemail again.</p></div>
                    </div>
                </div>
            </div>

            <!-- LIVE DEMO CHAT -->
            <div>
                <div class="chat-demo">
                    <div class="chat-header">
                        <div class="avatar">💬</div>
                        <div><h3>Ask Us Anything</h3><p>Jazzy's House Cleaning — Demo</p></div>
                        <div class="online"><div class="online-dot"></div>Online now</div>
                    </div>
                    <div class="chat-messages" id="chatMessages">
                        <div class="chat-msg bot">
                            <div class="chat-name">AI Assistant</div>
                            <div class="chat-bubble">Hi there! 👋 Welcome to Jazzy's House Cleaning. I can help with pricing, availability, or booking. What can I do for you?</div>
                        </div>
                    </div>
                    <div class="typing" id="typingIndicator">
                        <div class="chat-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
                    </div>
                    <div class="quick-replies" id="quickReplies">
                        <button class="qr-btn" onclick="sendQuick('How much does a cleaning cost?')">💰 Pricing?</button>
                        <button class="qr-btn" onclick="sendQuick('What areas do you serve?')">📍 Service area?</button>
                        <button class="qr-btn" onclick="sendQuick('How do I book?')">📅 Book now?</button>
                        <button class="qr-btn" onclick="sendQuick('Are you insured?')">🛡️ Insured?</button>
                    </div>
                    <div class="chat-input-row">
                        <input type="text" id="chatInput" placeholder="Type a question..." onkeydown="if(event.key==='Enter')sendChat()">
                        <button class="chat-send" onclick="sendChat()">Send</button>
                    </div>
                </div>
                <p style="font-size:12px;color:var(--gray-500);text-align:center;margin-top:10px;">This is a live demo — try typing anything!</p>
            </div>
        </div>
    </div>
</section>

<!-- MINI-ME -->
<section class="mini-me-section" id="mini-me">
    <div class="mini-me-inner">
        <div class="mini-me-badge">🤖 NEW — Mini-Me AI Avatar</div>
        <h2>Meet Mini-Me —<br>Your Personal AI Avatar</h2>
        <p class="sub">Mini-Me is a digital version of you that lives on your website — your face, your voice, your personality — representing your business around the clock. It's the most personal way to connect with new customers before they ever call you.</p>

        <div class="mm-steps">
            <div class="mm-step"><div class="num">01</div><h3>You record one short clip</h3><p>On your phone. We send you a script based on your business info. One take, 30–60 seconds. That's it.</p></div>
            <div class="mm-step"><div class="num">02</div><h3>We create your AI avatar</h3><p>Using your clip, we build a digital Mini-Me — your face, your voice, your personality — powered by AI video technology.</p></div>
            <div class="mm-step"><div class="num">03</div><h3>It lives on your website</h3><p>Your Mini-Me greets every visitor, answers questions in your voice, and makes your business unforgettable.</p></div>
            <div class="mm-step"><div class="num">04</div><h3>It works for you 24/7</h3><p>Never takes a day off. Always says the right thing. Builds trust before you ever pick up the phone.</p></div>
        </div>

        <div class="mm-cta">
            <div>
                <h3>🎬 Your first Mini-Me video is FREE</h3>
                <p>Sign up for any TurnkeyAI plan today and get your first Mini-Me video included at no charge. After that, it's just $59/month to keep your avatar active and updated on your site.</p>
                <a href="/turnkeyai-intake-form.html" class="btn-mm">Add Mini-Me When I Sign Up →</a>
            </div>
            <div>
                <div class="price-tag">$59<span class="mo">/mo</span></div>
                <div class="price-free">First video FREE</div>
            </div>
        </div>
    </div>
</section>

<!-- PRICING -->
<section class="pricing-section">
    <div class="pricing-inner">
        <h2>Simple, Transparent Pricing</h2>
        <p class="sub">No setup fees. No contracts. Cancel anytime.</p>
        <div class="pricing-grid">
            <div class="price-card">
                <h3>Website + AI Chat</h3>
                <div class="price">$99</div>
                <div class="price-sub">per month · $0 setup fee</div>
                <ul>
                    <li>Professional AI-powered website</li>
                    <li>24/7 AI chat assistant</li>
                    <li>Missed call text return</li>
                    <li>After hours auto-reply</li>
                    <li>Client dashboard — update your info anytime</li>
                    <li>1 free 60-second promo video</li>
                </ul>
                <a href="/turnkeyai-intake-form.html" class="pc-cta">Get Started</a>
            </div>
            <div class="price-card featured">
                <div class="pc-badge">🔥 Most Popular</div>
                <h3>Website + AI Chat + Mini-Me</h3>
                <div class="price">$158</div>
                <div class="price-sub">per month · first Mini-Me video FREE</div>
                <ul>
                    <li>Everything in the standard plan</li>
                    <li>Your personal Mini-Me AI avatar</li>
                    <li>Mini-Me on your homepage — greets every visitor</li>
                    <li>Monthly avatar update option</li>
                    <li>Image/likeness consent stored on file</li>
                    <li>Priority support</li>
                </ul>
                <a href="/turnkeyai-intake-form.html" class="pc-cta">Add Mini-Me</a>
            </div>
        </div>
    </div>
</section>

<footer>
    <p>© 2025 TurnkeyAI Services · <a href="/">Home</a> · <a href="/turnkeyai-intake-form.html">Get Started</a> · <a href="mailto:george@turnkeyaiservices.com">george@turnkeyaiservices.com</a> · (228) 604-3200</p>
    <p style="margin-top:7px;font-size:12px;">AI-Powered Websites for Local Business — Built by TurnkeyAI Services</p>
</footer>

<script>
var DEMO_SYSTEM = "You are a friendly AI assistant demo for Jazzy's House Cleaning, a professional house cleaning service in Bay St. Louis, MS. Answer questions about: pricing (standard cleaning $120, deep clean $200, move-in/out $250), hours (Mon-Sat 8am-6pm), service area (Bay St. Louis, Gulfport, Biloxi, and surrounding areas), booking (call 228-604-3200 or fill out the contact form), and insurance (yes, fully insured and bonded). Keep answers short, friendly, and end with a follow-up question.";

async function sendChat(){
    var input=document.getElementById('chatInput');
    var text=input.value.trim();
    if(!text)return;
    input.value='';
    addMsg(text,'user');
    document.getElementById('quickReplies').style.display='none';
    showTyping(true);
    try{
        var res=await fetch('https://turnkeyai-backend-production.up.railway.app/api/chat',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({message:text,systemPrompt:DEMO_SYSTEM})
        });
        var data=await res.json();
        showTyping(false);
        addMsg(data.reply||"Thanks! For immediate help call (228) 604-3200.",'bot');
    }catch(e){
        showTyping(false);
        addMsg("Thanks for your message! For immediate help call (228) 604-3200.",'bot');
    }
}

function sendQuick(text){document.getElementById('chatInput').value=text;sendChat();}

function addMsg(text,role){
    var c=document.getElementById('chatMessages');
    var d=document.createElement('div');
    d.className='chat-msg '+role;
    if(role==='bot')d.innerHTML='<div class="chat-name">AI Assistant</div><div class="chat-bubble">'+escHtml(text)+'</div>';
    else d.innerHTML='<div class="chat-bubble">'+escHtml(text)+'</div>';
    c.appendChild(d);
    c.scrollTop=c.scrollHeight;
}

function showTyping(show){
    var t=document.getElementById('typingIndicator');
    t.style.display=show?'flex':'none';
    if(show)document.getElementById('chatMessages').scrollTop=document.getElementById('chatMessages').scrollHeight;
}

function escHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
</script>
</body>
</html>
