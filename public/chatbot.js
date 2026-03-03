(function() {
  // ── TurnkeyAI Chat Widget ──────────────────────────────────────────────────
  const SITE_CONTEXT = `
You are the TurnkeyAI Services virtual assistant. You help visitors learn about TurnkeyAI Services and answer their questions 24/7.

COMPANY INFO:
- Name: TurnkeyAI Services
- Owner: George Dickson
- Location: 300 Blakemore Ave, Bay St. Louis, Mississippi 39520
- Phone: (603) 922-2004
- Email: turnkeyaiservices@gmail.com
- Website: turnkeyaiservices.com

WHAT WE DO:
TurnkeyAI Services builds professional, fully functional AI-powered websites for local small businesses and personal/family use — fully automated, delivered within 24 hours. No tech skills required.

PRICING:
- Website Only: $99/month, $0 setup fee, 12-month minimum
- Website + Blog (8 SEO posts/month): $129/month
- Website + Blog + Social Media Management: $159/month
- Social media account setup (one-time): $99
- Territory Partner (Hub): $199/month, protected territory, 60/40 revenue split
- Lead Discovery: $1.50/search, no monthly fee

WHAT'S INCLUDED WITH EVERY SITE:
- Professional website built from a 10-minute intake form
- 24/7 AI chat assistant on the client's site
- After-hours call answering — FREE
- Missed call return — FREE
- Online reservation & booking system
- Google Maps & local SEO optimization
- Client dashboard for self-service updates
- Google Analytics integration
- Mobile-first responsive design
- Site delivered within 24 hours
- Review before go-live — no surprises

BUSINESS SITE TYPES (55+ industries):
Restaurants, cleaning companies, plumbers, electricians, salons, contractors, landscapers, auto repair, medical/dental, agriculture, and many more.

PERSONAL SITE TYPES:
Family heritage sites, reunion sites, crafter/maker stores, recipe collections, memorial/tribute pages.

TERRITORY PARTNER PROGRAM:
- Partners pay $199/month
- Earn 60% of every client's monthly fee they generate
- Protected territory
- No tech skills needed
- Partners who refer clients earn $59.40/month per $99/month client

HOW IT WORKS:
1. Customer fills out a 10-minute industry-specific intake form
2. TurnkeyAI builds the site within 24 hours using AI
3. Customer reviews and approves before go-live
4. Site goes live — customer manages via dashboard

PAYMENT OPTIONS: Credit/debit card, PayPal, bank transfer, check.

RULES FOR RESPONSES:
- Be friendly, helpful, and concise
- If someone wants to get started, direct them to the correct intake form
- Business sites: turnkeyaiservices.com/business.html
- Personal/family sites: turnkeyaiservices.com/personal.html
- Crafter stores: turnkeyaiservices.com/crafter-intake.html
- Territory Partner: turnkeyaiservices.com/territory-partner.html
- For complex questions or to speak with George directly, provide the phone number (603) 922-2004
- Never make up information not listed here
- Keep responses under 150 words
- If asked about pricing always mention no setup fee and 24-hour delivery
`;

  const styles = `
    #tkai-chat-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 60px; height: 60px; border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      border: none; cursor: pointer; box-shadow: 0 4px 20px rgba(37,99,235,.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; transition: transform .2s, box-shadow .2s;
    }
    #tkai-chat-btn:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(37,99,235,.5); }
    #tkai-chat-btn .tkai-badge {
      position: absolute; top: -4px; right: -4px;
      background: #ef4444; color: #fff; border-radius: 50%;
      width: 18px; height: 18px; font-size: 11px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      display: none;
    }
    #tkai-chat-window {
      position: fixed; bottom: 96px; right: 24px; z-index: 9998;
      width: 360px; max-width: calc(100vw - 48px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,.18);
      display: none; flex-direction: column;
      font-family: 'Nunito', system-ui, sans-serif;
      overflow: hidden; max-height: 520px;
    }
    #tkai-chat-window.open { display: flex; animation: tkaiSlideUp .25s ease; }
    @keyframes tkaiSlideUp { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform: translateY(0); } }
    .tkai-header {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      padding: 14px 16px; display: flex; align-items: center; gap: 10px;
    }
    .tkai-avatar { font-size: 24px; }
    .tkai-header-info { flex: 1; }
    .tkai-header-name { color: #fff; font-weight: 800; font-size: 14px; }
    .tkai-header-status { color: rgba(255,255,255,.7); font-size: 11px; }
    .tkai-close { background: none; border: none; color: #fff; cursor: pointer; font-size: 20px; opacity: .8; padding: 0; line-height: 1; }
    .tkai-close:hover { opacity: 1; }
    .tkai-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px; min-height: 200px; max-height: 320px;
    }
    .tkai-msg { max-width: 85%; font-size: 13px; line-height: 1.5; }
    .tkai-msg.bot { align-self: flex-start; }
    .tkai-msg.user { align-self: flex-end; }
    .tkai-msg-bubble {
      padding: 10px 13px; border-radius: 12px;
    }
    .tkai-msg.bot .tkai-msg-bubble { background: #f1f5f9; color: #1e293b; border-radius: 4px 12px 12px 12px; }
    .tkai-msg.user .tkai-msg-bubble { background: linear-gradient(135deg,#2563eb,#1d4ed8); color: #fff; border-radius: 12px 4px 12px 12px; }
    .tkai-typing { display: flex; gap: 4px; padding: 10px 13px; background: #f1f5f9; border-radius: 4px 12px 12px 12px; width: fit-content; }
    .tkai-typing span { width: 7px; height: 7px; background: #94a3b8; border-radius: 50%; animation: tkaiDot 1.2s infinite; }
    .tkai-typing span:nth-child(2) { animation-delay: .2s; }
    .tkai-typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes tkaiDot { 0%,80%,100%{transform:scale(.8);opacity:.5} 40%{transform:scale(1.1);opacity:1} }
    .tkai-input-row {
      padding: 12px; border-top: 1px solid #e2e8f0;
      display: flex; gap: 8px; align-items: center;
    }
    .tkai-input {
      flex: 1; border: 1.5px solid #e2e8f0; border-radius: 10px;
      padding: 9px 13px; font-family: inherit; font-size: 13px;
      outline: none; resize: none; line-height: 1.4;
      max-height: 80px; overflow-y: auto;
      transition: border .15s;
    }
    .tkai-input:focus { border-color: #2563eb; }
    .tkai-send {
      background: linear-gradient(135deg,#2563eb,#1d4ed8);
      border: none; border-radius: 9px; width: 36px; height: 36px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: transform .15s;
    }
    .tkai-send:hover { transform: scale(1.08); }
    .tkai-send svg { width: 16px; height: 16px; fill: #fff; }
    .tkai-footer { text-align: center; padding: 6px; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
    .tkai-footer a { color: #2563eb; text-decoration: none; }
  `;

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // Build HTML
  const btn = document.createElement('button');
  btn.id = 'tkai-chat-btn';
  btn.innerHTML = '💬<span class="tkai-badge" id="tkai-badge">1</span>';
  btn.title = 'Chat with TurnkeyAI';

  const win = document.createElement('div');
  win.id = 'tkai-chat-window';
  win.innerHTML = `
    <div class="tkai-header">
      <div class="tkai-avatar">🤖</div>
      <div class="tkai-header-info">
        <div class="tkai-header-name">TurnkeyAI Assistant</div>
        <div class="tkai-header-status">● Online 24/7</div>
      </div>
      <button class="tkai-close" id="tkai-close">✕</button>
    </div>
    <div class="tkai-messages" id="tkai-messages"></div>
    <div class="tkai-input-row">
      <textarea class="tkai-input" id="tkai-input" placeholder="Ask me anything..." rows="1"></textarea>
      <button class="tkai-send" id="tkai-send">
        <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
    </div>
    <div class="tkai-footer">Powered by <a href="https://turnkeyaiservices.com">TurnkeyAI Services</a></div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(win);

  const messagesEl = document.getElementById('tkai-messages');
  const inputEl = document.getElementById('tkai-input');
  const badge = document.getElementById('tkai-badge');

  let history = [];
  let isOpen = false;
  let hasGreeted = false;

  function addMessage(role, text) {
    const msg = document.createElement('div');
    msg.className = 'tkai-msg ' + role;
    msg.innerHTML = `<div class="tkai-msg-bubble">${text}</div>`;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'tkai-msg bot';
    el.id = 'tkai-typing';
    el.innerHTML = `<div class="tkai-typing"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('tkai-typing');
    if (el) el.remove();
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    addMessage('user', text);
    history.push({ role: 'user', content: text });
    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context: SITE_CONTEXT })
      });
      const data = await res.json();
      removeTyping();
      const reply = data.reply || "I'm having trouble right now. Please call (603) 922-2004 or email turnkeyaiservices@gmail.com.";
      addMessage('bot', reply);
      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      removeTyping();
      addMessage('bot', "I'm having trouble connecting. Please call <strong>(603) 922-2004</strong> or email turnkeyaiservices@gmail.com.");
    }
  }

  function openChat() {
    isOpen = true;
    win.classList.add('open');
    badge.style.display = 'none';
    if (!hasGreeted) {
      hasGreeted = true;
      addMessage('bot', "Hi! 👋 I'm the TurnkeyAI assistant. I can answer questions about our website services, pricing, and partner program — or help you get started. What can I help you with?");
    }
    inputEl.focus();
  }

  function closeChat() {
    isOpen = false;
    win.classList.remove('open');
  }

  btn.addEventListener('click', () => isOpen ? closeChat() : openChat());
  document.getElementById('tkai-close').addEventListener('click', closeChat);

  document.getElementById('tkai-send').addEventListener('click', () => sendMessage(inputEl.value));

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  });

  // Show badge after 8 seconds to draw attention
  setTimeout(() => {
    if (!isOpen) { badge.style.display = 'flex'; }
  }, 8000);

})();
