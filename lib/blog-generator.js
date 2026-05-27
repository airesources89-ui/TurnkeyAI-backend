// ════════════════════════════════════════════════
// ── lib/blog-generator.js — Client Blog Generation
// ── Generates 30 blog posts via OpenAI on first deploy,
// ── then schedules monthly regeneration (8 new posts/mo).
// ── Deploys blog pages to Cloudflare Pages as static HTML.
// ── Only runs for plans: website_blog, website_blog_social, full_package
// ════════════════════════════════════════════════

const { deployToCloudflarePages } = require('./deploy');
const { saveClient } = require('./db');

const BASE_URL = process.env.BASE_URL || 'https://turnkeyaiservices.com';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ── Plans that include blog ──
const BLOG_PLANS = ['website_blog', 'website_blog_social', 'full_package'];

function planIncludesBlog(client) {
  const plan = client.data.selectedPlan || client.data.plan || client.data.tier || client.data.packageType || '';
  return BLOG_PLANS.includes(plan);
}

// ── Generate a single blog post via OpenAI ──
async function generateBlogPost(client, topic, postNumber) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const biz      = client.data.businessName || 'Our Business';
  const industry = (client.data.industry || 'local service').replace(/_/g, ' ');
  const city     = client.data.city || 'your area';
  const state    = client.data.state || '';
  const location = [city, state].filter(Boolean).join(', ');
  const services = Object.keys(client.data)
    .filter(k => k.startsWith('service_') && client.data[k] === 'on')
    .map(k => k.replace('service_', '').replace(/_/g, ' '))
    .slice(0, 8)
    .join(', ');

  const systemPrompt = `You are a professional content writer specializing in local service business SEO blog posts. Write helpful, informative blog posts that rank well on Google and establish the business as a local authority. Write in a friendly, expert tone. Use the business name and location naturally throughout. Format the response as JSON with these exact fields: title, metaDescription, content. The content field should be full HTML (using <h2>, <h3>, <p>, <ul>, <li> tags only — no <html>, <head>, <body> tags). Aim for 600-900 words. Do not include markdown. Return only valid JSON.`;

  const userPrompt = `Write a blog post for ${biz}, a ${industry} business in ${location}.
Topic: ${topic}
${services ? 'Services they offer: ' + services : ''}

Requirements:
- Title should be SEO-friendly and include the city name naturally
- Meta description: 150-160 characters, compelling, includes city
- Content: 600-900 words, helpful and informative
- Mention ${biz} and ${location} naturally 2-3 times
- Include a call-to-action at the end encouraging readers to contact ${biz}
- Do NOT mention competitors
- Return as JSON: { "title": "...", "metaDescription": "...", "content": "<h2>...</h2><p>...</p>..." }`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('OpenAI error: ' + err);
  }

  const data = await response.json();
  let text = (data.choices?.[0]?.message?.content || '').trim();

  // Strip markdown code fences if present
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch(e) {
    throw new Error('Failed to parse blog post JSON: ' + e.message);
  }

  return {
    title: parsed.title || topic,
    metaDescription: parsed.metaDescription || '',
    content: parsed.content || '',
    slug: 'post-' + postNumber,
    publishDate: new Date().toISOString(),
    postNumber
  };
}

// ── Build topics for a given industry ──
function buildTopics(client, count) {
  const industry = (client.data.industry || 'local service').replace(/_/g, ' ');
  const city     = client.data.city || 'your area';
  const state    = client.data.state || '';
  const location = [city, state].filter(Boolean).join(', ');

  // Generic topics that work for any industry
  const generic = [
    `How to Choose the Best ${industry} Company in ${location}`,
    `Top ${count > 10 ? '10' : '5'} Signs You Need a ${industry} Professional in ${city}`,
    `What to Expect When You Hire a ${industry} Service in ${location}`,
    `How Much Does ${industry} Cost in ${city}? A Complete Guide`,
    `${industry} Tips Every ${city} Homeowner Should Know`,
    `Why Local ${industry} Services in ${city} Are Worth It`,
    `Common ${industry} Mistakes and How to Avoid Them`,
    `How to Prepare for Your ${industry} Appointment in ${location}`,
    `${industry} Seasonal Checklist for ${city} Residents`,
    `How to Find a Trustworthy ${industry} Company Near ${city}`,
    `Questions to Ask Before Hiring a ${industry} Pro in ${location}`,
    `The Benefits of Regular ${industry} Service for ${city} Homes`,
    `${industry} Emergency? Here's What to Do in ${city}`,
    `How Technology Is Changing ${industry} Services in ${location}`,
    `DIY vs Professional ${industry}: What ${city} Residents Should Know`,
    `How to Read ${industry} Estimates and Avoid Overpaying in ${city}`,
    `${industry} Warranties and Guarantees: What to Look For in ${location}`,
    `Eco-Friendly ${industry} Options Available in ${city}`,
    `How ${industry} Services Protect Your Home's Value in ${location}`,
    `Customer Reviews: Why They Matter When Choosing ${industry} in ${city}`,
    `The History of ${industry} Services in ${location}`,
    `How ${industry} Professionals Stay Trained and Certified in ${city}`,
    `${industry} Frequently Asked Questions Answered by ${city} Experts`,
    `Neighborhood Guide: ${industry} Services Across ${city}`,
    `How to Maintain Results After Your ${industry} Service in ${location}`,
    `${industry} Safety Tips for ${city} Families`,
    `What Insurance Covers for ${industry} in ${location}`,
    `How to Schedule ${industry} Service Around Your ${city} Lifestyle`,
    `${industry} Trends Shaping ${city} in ${new Date().getFullYear()}`,
    `Why ${city} Residents Trust Local ${industry} Professionals`
  ];

  // Return requested count, cycling if needed
  const topics = [];
  for (let i = 0; i < count; i++) {
    topics.push(generic[i % generic.length]);
  }
  return topics;
}

// ── Build HTML for a single blog post page ──
function buildPostHTML(post, client, allPosts) {
  const biz      = client.data.businessName || 'Our Business';
  const city     = client.data.city || '';
  const state    = client.data.state || '';
  const phone    = client.twilioNumber
    ? client.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    : (client.data.phone || '');
  const phoneRaw = phone.replace(/\D/g, '');
  const liveUrl  = client.liveUrl || '';

  const pubDate = new Date(post.publishDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const recentPosts = allPosts
    .filter(p => p.slug !== post.slug)
    .slice(0, 4)
    .map(p => `<a href="${p.slug}.html" style="display:block;padding:10px 0;border-bottom:1px solid #e5e7eb;color:#0066FF;text-decoration:none;font-size:14px;font-weight:600;line-height:1.4;">${p.title}</a>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} | ${biz}</title>
  <meta name="description" content="${post.metaDescription}">
  <meta property="og:title" content="${post.title}">
  <meta property="og:description" content="${post.metaDescription}">
  <meta property="og:type" content="article">
  <link rel="canonical" href="${liveUrl}/blog/${post.slug}.html">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',sans-serif;background:#f8fafc;color:#1e293b;-webkit-font-smoothing:antialiased}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:rgba(10,22,40,.95);backdrop-filter:blur(12px);border-bottom:1px solid rgba(245,158,11,.18)}
    .nav-logo{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;color:white;letter-spacing:2px;text-decoration:none}
    .nav-logo span{color:#f59e0b}
    .nav-links{display:flex;gap:1rem;list-style:none;align-items:center}
    .nav-links a{color:rgba(255,255,255,.8);text-decoration:none;font-size:.85rem;font-weight:500}
    .nav-links a:hover{color:#f59e0b}
    .nav-cta{background:#f59e0b!important;color:#0a1628!important;padding:.4rem .9rem;border-radius:6px;font-weight:700!important}
    .page-header{background:linear-gradient(135deg,#0a1628,#1a3a6b);padding:7rem 1.5rem 3rem;text-align:center}
    .page-header .label{font-size:.72rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f59e0b;margin-bottom:.5rem}
    .page-header h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(1.8rem,4vw,2.8rem);color:white;letter-spacing:1px;line-height:1.1;max-width:800px;margin:0 auto .8rem}
    .page-header .meta{font-size:.85rem;color:rgba(255,255,255,.5)}
    .content-wrap{max-width:1080px;margin:2.5rem auto;padding:0 1.5rem;display:grid;grid-template-columns:1fr 320px;gap:2.5rem;align-items:start}
    @media(max-width:768px){.content-wrap{grid-template-columns:1fr}.sidebar{display:none}}
    .post-body{background:white;border-radius:16px;padding:2.5rem;box-shadow:0 4px 24px rgba(10,22,40,.07)}
    .post-body h2{font-family:'Bebas Neue',sans-serif;font-size:1.7rem;color:#0a1628;letter-spacing:1px;margin:2rem 0 .8rem}
    .post-body h3{font-size:1.1rem;font-weight:700;color:#0a1628;margin:1.5rem 0 .6rem}
    .post-body p{font-size:1rem;line-height:1.85;color:#374151;margin-bottom:1.2rem}
    .post-body ul,.post-body ol{padding-left:1.5rem;margin-bottom:1.2rem}
    .post-body li{font-size:1rem;line-height:1.8;color:#374151;margin-bottom:.3rem}
    .post-cta{background:linear-gradient(135deg,#0a1628,#1a3a6b);border-radius:14px;padding:2rem;margin-top:2.5rem;text-align:center}
    .post-cta h3{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:white;letter-spacing:1px;margin-bottom:.6rem}
    .post-cta p{color:rgba(255,255,255,.75);font-size:.95rem;margin-bottom:1.5rem}
    .post-cta a{background:#f59e0b;color:#0a1628;padding:.85rem 2rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:.97rem;display:inline-flex;align-items:center;gap:.5rem}
    .sidebar{position:sticky;top:90px}
    .sidebar-card{background:white;border-radius:14px;padding:1.5rem;box-shadow:0 4px 24px rgba(10,22,40,.07);margin-bottom:1.5rem}
    .sidebar-card h4{font-size:.95rem;font-weight:700;color:#0a1628;margin-bottom:1rem;padding-bottom:.6rem;border-bottom:2px solid #e5e7eb}
    .back-link{display:inline-flex;align-items:center;gap:.4rem;color:#0066FF;text-decoration:none;font-size:.9rem;font-weight:600;margin-bottom:1.5rem}
    .back-link:hover{color:#0052CC}
    footer{background:#0a1628;padding:2rem 1.5rem;text-align:center;margin-top:4rem}
    footer p{color:rgba(255,255,255,.35);font-size:.8rem}
    footer a{color:#f59e0b;text-decoration:none}
  </style>
</head>
<body>
<nav>
  <a href="../index.html" class="nav-logo">${biz.split(' ').slice(0,-1).join(' ')} <span>${biz.split(' ').slice(-1)[0]}</span></a>
  <ul class="nav-links">
    <li><a href="../index.html">Home</a></li>
    <li><a href="../pricing.html">Pricing</a></li>
    <li><a href="../scheduling.html">Schedule</a></li>
    <li><a href="index.html">Blog</a></li>
    ${phone ? `<li><a href="tel:${phoneRaw}" class="nav-cta"><i class="fas fa-phone"></i> Call Now</a></li>` : ''}
  </ul>
</nav>

<div class="page-header">
  <div class="label">Blog &mdash; ${biz}</div>
  <h1>${post.title}</h1>
  <div class="meta">Published ${pubDate} &bull; ${city}${state ? ', ' + state : ''}</div>
</div>

<div class="content-wrap">
  <main>
    <a href="index.html" class="back-link"><i class="fas fa-arrow-left"></i> Back to Blog</a>
    <div class="post-body">
      ${post.content}
      <div class="post-cta">
        <h3>Ready to Get Started?</h3>
        <p>Contact ${biz} today &mdash; serving ${city}${state ? ', ' + state : ''} and surrounding areas.</p>
        ${phone ? `<a href="tel:${phoneRaw}"><i class="fas fa-phone"></i> Call ${phone}</a>` : `<a href="../scheduling.html"><i class="fas fa-calendar-check"></i> Schedule Online</a>`}
      </div>
    </div>
  </main>
  <aside class="sidebar">
    ${phone ? `<div class="sidebar-card"><h4>&#x1F4DE; Call Us Now</h4><a href="tel:${phoneRaw}" style="display:block;background:#f59e0b;color:#0a1628;text-align:center;padding:12px;border-radius:8px;font-weight:700;text-decoration:none;font-size:1.05rem;">${phone}</a></div>` : ''}
    <div class="sidebar-card">
      <h4>&#x1F4DD; Recent Posts</h4>
      ${recentPosts || '<p style="font-size:13px;color:#64748b;">More posts coming soon.</p>'}
    </div>
    <div class="sidebar-card">
      <h4>&#x1F4C5; Schedule Service</h4>
      <p style="font-size:13px;color:#64748b;margin-bottom:12px;">Book an appointment online in seconds.</p>
      <a href="../scheduling.html" style="display:block;background:#0a1628;color:white;text-align:center;padding:10px;border-radius:8px;font-weight:700;text-decoration:none;font-size:.9rem;"><i class="fas fa-calendar-check"></i> Book Now</a>
    </div>
  </aside>
</div>

<footer>
  <p>&copy; ${new Date().getFullYear()} ${biz} &bull; ${city}${state ? ', ' + state : ''} &bull; Powered by <a href="https://turnkeyaiservices.com">TurnkeyAI Services</a></p>
</footer>
</body>
</html>`;
}

// ── Build blog index page ──
function buildBlogIndexHTML(posts, client) {
  const biz      = client.data.businessName || 'Our Business';
  const city     = client.data.city || '';
  const state    = client.data.state || '';
  const phone    = client.twilioNumber
    ? client.twilioNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    : (client.data.phone || '');
  const phoneRaw = phone.replace(/\D/g, '');

  const postCards = posts.map(p => {
    const pubDate = new Date(p.publishDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const excerpt = p.metaDescription || p.title;
    return `
    <div style="background:white;border-radius:14px;padding:1.8rem;box-shadow:0 4px 24px rgba(10,22,40,.07);border:1px solid rgba(10,22,40,.06);transition:transform .2s;">
      <div style="font-size:.72rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f59e0b;margin-bottom:.6rem;">${pubDate}</div>
      <h2 style="font-size:1.1rem;font-weight:700;color:#0a1628;margin-bottom:.7rem;line-height:1.4;">${p.title}</h2>
      <p style="font-size:.9rem;color:#64748b;line-height:1.65;margin-bottom:1.2rem;">${excerpt}</p>
      <a href="${p.slug}.html" style="color:#0066FF;font-weight:700;font-size:.9rem;text-decoration:none;display:inline-flex;align-items:center;gap:.3rem;">Read More <i class="fas fa-arrow-right" style="font-size:.75rem;"></i></a>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog | ${biz} | ${city}${state ? ', ' + state : ''}</title>
  <meta name="description" content="Tips, advice, and local insights from ${biz} &mdash; your trusted ${(client.data.industry || 'service').replace(/_/g,' ')} experts in ${city}${state ? ', ' + state : ''}.">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',sans-serif;background:#f8fafc;color:#1e293b;-webkit-font-smoothing:antialiased}
    nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:rgba(10,22,40,.95);backdrop-filter:blur(12px);border-bottom:1px solid rgba(245,158,11,.18)}
    .nav-logo{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;color:white;letter-spacing:2px;text-decoration:none}
    .nav-logo span{color:#f59e0b}
    .nav-links{display:flex;gap:1rem;list-style:none;align-items:center}
    .nav-links a{color:rgba(255,255,255,.8);text-decoration:none;font-size:.85rem;font-weight:500}
    .nav-links a:hover{color:#f59e0b}
    .nav-cta{background:#f59e0b!important;color:#0a1628!important;padding:.4rem .9rem;border-radius:6px;font-weight:700!important}
    .page-header{background:linear-gradient(135deg,#0a1628,#1a3a6b);padding:7rem 1.5rem 4rem;text-align:center}
    .page-header .label{font-size:.72rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f59e0b;margin-bottom:.5rem}
    .page-header h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(2rem,5vw,3.5rem);color:white;letter-spacing:1.5px;margin-bottom:.8rem}
    .page-header p{color:rgba(255,255,255,.7);font-size:1rem;max-width:520px;margin:0 auto;line-height:1.7}
    .grid-section{max-width:1080px;margin:3rem auto;padding:0 1.5rem 5rem}
    .posts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.5rem}
    footer{background:#0a1628;padding:2rem 1.5rem;text-align:center}
    footer p{color:rgba(255,255,255,.35);font-size:.8rem}
    footer a{color:#f59e0b;text-decoration:none}
  </style>
</head>
<body>
<nav>
  <a href="../index.html" class="nav-logo">${biz.split(' ').slice(0,-1).join(' ')} <span>${biz.split(' ').slice(-1)[0]}</span></a>
  <ul class="nav-links">
    <li><a href="../index.html">Home</a></li>
    <li><a href="../pricing.html">Pricing</a></li>
    <li><a href="../scheduling.html">Schedule</a></li>
    <li><a href="index.html" style="color:#f59e0b;font-weight:700;">Blog</a></li>
    ${phone ? `<li><a href="tel:${phoneRaw}" class="nav-cta"><i class="fas fa-phone"></i> Call Now</a></li>` : ''}
  </ul>
</nav>

<div class="page-header">
  <div class="label">Local Tips &amp; Insights</div>
  <h1>The ${biz} Blog</h1>
  <p>Expert advice, local insights, and helpful tips from your trusted ${(client.data.industry || 'service').replace(/_/g,' ')} team in ${city}${state ? ', ' + state : ''}.</p>
</div>

<div class="grid-section">
  <div class="posts-grid">
    ${postCards}
  </div>
</div>

<footer>
  <p>&copy; ${new Date().getFullYear()} ${biz} &bull; ${city}${state ? ', ' + state : ''} &bull; Powered by <a href="https://turnkeyaiservices.com">TurnkeyAI Services</a></p>
</footer>
</body>
</html>`;
}

// ── Build sitemap entries for blog posts ──
function buildBlogSitemapEntries(posts, projectName) {
  const base = `https://${projectName}.pages.dev`;
  const entries = [
    `  <url><loc>${base}/blog/index.html</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`
  ];
  posts.forEach(p => {
    entries.push(`  <url><loc>${base}/blog/${p.slug}.html</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
  });
  return entries.join('\n');
}

// ── Main: generate and deploy 30 blog posts ──
async function generateAndDeployBlog(client, postCount = 30) {
  if (!planIncludesBlog(client)) {
    console.log(`[blog-generator] Plan does not include blog for ${client.data.businessName} — skipping`);
    return;
  }
  if (!client.cfProjectName) {
    console.warn('[blog-generator] No cfProjectName — skipping');
    return;
  }

  console.log(`[blog-generator] Generating ${postCount} blog posts for ${client.data.businessName}...`);

  const topics = buildTopics(client, postCount);
  const posts  = [];

  // Generate posts sequentially to avoid rate limits
  for (let i = 0; i < topics.length; i++) {
    try {
      console.log(`[blog-generator] Generating post ${i + 1}/${topics.length}: ${topics[i].substring(0, 60)}...`);
      const post = await generateBlogPost(client, topics[i], i + 1);
      posts.push(post);
      // Small delay between OpenAI calls to be respectful of rate limits
      if (i < topics.length - 1) await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[blog-generator] Failed to generate post ${i + 1}:`, err.message);
      // Continue — don't let one failed post stop the whole batch
    }
  }

  if (posts.length === 0) {
    console.error('[blog-generator] No posts generated — aborting deploy');
    return;
  }

  console.log(`[blog-generator] Generated ${posts.length} posts. Building HTML and deploying...`);

  // ── Build file map for deployment ──
  // We deploy blog as a separate sub-folder by merging with existing site pages
  // Each blog file goes under blog/
  const blogFiles = {};

  // Blog index
  blogFiles['blog/index'] = buildBlogIndexHTML(posts, client);

  // Individual post pages
  posts.forEach(post => {
    blogFiles[`blog/${post.slug}`] = buildPostHTML(post, client, posts);
  });

  // Deploy blog files to the existing CF Pages project
  await deployToCloudflarePages(client.cfProjectName, blogFiles);

  // ── Save blog metadata to client record ──
  client.blogPosts = posts.map(p => ({
    slug: p.slug,
    title: p.title,
    publishDate: p.publishDate,
    postNumber: p.postNumber
  }));
  client.blogGeneratedAt = new Date().toISOString();
  client.blogPostCount   = posts.length;
  await saveClient(client);

  console.log(`[blog-generator] ✅ Blog deployed for ${client.data.businessName} — ${posts.length} posts at /${client.cfProjectName}.pages.dev/blog/`);
}

// ── Generate 8 new monthly posts and append to existing blog ──
async function generateMonthlyBlogPosts(client) {
  if (!planIncludesBlog(client)) return;
  if (!client.cfProjectName) return;

  const existingCount = client.blogPostCount || 0;
  const newCount      = 8;

  console.log(`[blog-generator] Generating ${newCount} monthly posts for ${client.data.businessName} (existing: ${existingCount})...`);

  const allTopics   = buildTopics(client, existingCount + newCount);
  const newTopics   = allTopics.slice(existingCount, existingCount + newCount);
  const newPosts    = [];

  for (let i = 0; i < newTopics.length; i++) {
    try {
      const post = await generateBlogPost(client, newTopics[i], existingCount + i + 1);
      newPosts.push(post);
      if (i < newTopics.length - 1) await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[blog-generator] Monthly post ${i + 1} failed:`, err.message);
    }
  }

  if (newPosts.length === 0) return;

  // Rebuild full post list (existing metadata + new full posts)
  const existingMeta = client.blogPosts || [];
  const allPosts = [
    ...existingMeta.map(p => ({ ...p, content: '', metaDescription: p.title })),
    ...newPosts
  ];

  const blogFiles = {};
  blogFiles['blog/index'] = buildBlogIndexHTML(allPosts, client);
  newPosts.forEach(post => {
    blogFiles[`blog/${post.slug}`] = buildPostHTML(post, client, allPosts);
  });

  await deployToCloudflarePages(client.cfProjectName, blogFiles);

  client.blogPosts = [
    ...existingMeta,
    ...newPosts.map(p => ({ slug: p.slug, title: p.title, publishDate: p.publishDate, postNumber: p.postNumber }))
  ];
  client.blogPostCount   = client.blogPosts.length;
  client.blogLastUpdated = new Date().toISOString();
  await saveClient(client);

  console.log(`[blog-generator] ✅ Monthly blog update complete for ${client.data.businessName} — ${newPosts.length} new posts added`);
}

// ── Schedule monthly blog regeneration (runs every 24h, fires on 30-day intervals) ──
function scheduleBlogRefresh(clients) {
  console.log('[blog-generator] Blog refresh scheduler initialized — checking daily');

  setInterval(async () => {
    const now = new Date();
    for (const client of Object.values(clients)) {
      if (!planIncludesBlog(client)) continue;
      if (client.status !== 'active') continue;
      if (!client.blogGeneratedAt) continue;

      const lastGenerated = new Date(client.blogGeneratedAt);
      const daysSince = (now - lastGenerated) / (1000 * 60 * 60 * 24);

      if (daysSince >= 30) {
        console.log(`[blog-generator] 30 days elapsed for ${client.data.businessName} — running monthly refresh`);
        generateMonthlyBlogPosts(client).catch(err =>
          console.error(`[blog-generator] Monthly refresh failed for ${client.data.businessName}:`, err.message)
        );
      }
    }
  }, 24 * 60 * 60 * 1000); // Check every 24 hours
}

console.log('[module] lib/blog-generator.js loaded');

module.exports = {
  generateAndDeployBlog,
  generateMonthlyBlogPosts,
  scheduleBlogRefresh,
  planIncludesBlog
};
