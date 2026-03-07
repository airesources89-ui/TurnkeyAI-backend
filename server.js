const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = 'turnkeyaiservices@gmail.com';
const PORT = process.env.PORT || 8080;

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'TurnkeyAI Services <onboarding@resend.dev>',
      to, subject, html
    })
  });
  const data = await res.json();
  if (!res.ok) console.error('[Resend error]', data);
  return data;
}

app.get('/health', (req, res) => {
  res.json({ status: 'TurnkeyAI Backend Running', time: new Date().toISOString() });
});

app.post('/api/intake', async (req, res) => {
  try {
    const data = req.body;
    await sendEmail({ to: ADMIN_EMAIL, subject: `New Business Intake: ${data.businessName || 'Unknown'}`, html: `<h2>New Business Intake</h2><pre>${JSON.stringify(data, null, 2)}</pre>` });
    await sendEmail({ to: data.email, subject: 'We received your TurnkeyAI request!', html: `<h2>Thanks, ${data.firstName || data.businessName}!</h2><p>We received your website request and will have a preview ready within 24 hours.</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch (err) { console.error('[/api/intake]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/territory-partner', async (req, res) => {
  try {
    const data = req.body;
    await sendEmail({ to: ADMIN_EMAIL, subject: `New Territory Partner: ${data.name || 'Unknown'}`, html: `<h2>Territory Partner Application</h2><pre>${JSON.stringify(data, null, 2)}</pre>` });
    await sendEmail({ to: data.email, subject: 'Your TurnkeyAI Territory Partner Application', html: `<h2>Thanks, ${data.name}!</h2><p>We received your application and will review it within 24 hours.</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch (err) { console.error('[/api/territory-partner]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/family-intake', async (req, res) => {
  try {
    const data = req.body;
    await sendEmail({ to: ADMIN_EMAIL, subject: `New Family Site: ${data.familyName || 'Unknown'}`, html: `<h2>Family Intake</h2><pre>${JSON.stringify(data, null, 2)}</pre>` });
    await sendEmail({ to: data.email, subject: 'Your TurnkeyAI Family Site Request', html: `<h2>Thanks!</h2><p>Preview ready within 24 hours.</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch (err) { console.error('[/api/family-intake]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/crafter-intake', async (req, res) => {
  try {
    const data = req.body;
    await sendEmail({ to: ADMIN_EMAIL, subject: `New Crafter Store: ${data.shopName || data.name || 'Unknown'}`, html: `<h2>Crafter Intake</h2><pre>${JSON.stringify(data, null, 2)}</pre>` });
    await sendEmail({ to: data.email, subject: 'Your TurnkeyAI Crafter Store Request', html: `<h2>Thanks!</h2><p>Preview ready within 24 hours.</p><p>— TurnkeyAI Services Team</p>` });
    res.json({ success: true });
  } catch (err) { console.error('[/api/crafter-intake]', err); res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt || 'You are a helpful assistant for TurnkeyAI Services.' }, { role: 'user', content: message }] })
      }
    );
    const data = await response.json();
    res.json({ reply: data.result?.response || 'Sorry, I could not process that.' });
  } catch (err) { console.error('[/api/chat]', err); res.status(500).json({ reply: 'Chat temporarily unavailable.' }); }
});

app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.listen(PORT, () => console.log(`TurnkeyAI backend running on port ${PORT}`));
