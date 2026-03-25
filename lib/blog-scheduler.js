// ════════════════════════════════════════════════
// ── lib/blog-scheduler.js — Automated Blog Posting
// ── Posts to Meta Graph API (Facebook + Instagram) every Thursday
// ── Sends admin email notification after successful post
// ════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { sendBlogPostNotificationEmail } = require('./email');

const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
const META_PAGE_ID = process.env.META_PAGE_ID;
const META_INSTAGRAM_ID = process.env.META_INSTAGRAM_ID;

// ── Track which posts have been published (in-memory) ──
const publishedPosts = new Set();

// ── Load blog schedule ──
function loadBlogSchedule() {
  try {
    const scheduleFile = path.join(__dirname, '..', 'data', 'blog-schedule.json');
    const data = fs.readFileSync(scheduleFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[blog-scheduler] Failed to load blog-schedule.json:', err.message);
    return [];
  }
}

// ── Calculate current week (based on March 5, 2026 start) ──
function getCurrentWeek() {
  const WEEK1_DATE = new Date(2026, 2, 5); // March 5, 2026
  const now = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const elapsed = now.getTime() - WEEK1_DATE.getTime();
  let currentWeek = Math.floor(elapsed / msPerWeek) + 1;
  if (currentWeek < 1) currentWeek = 1;
  if (currentWeek > 12) currentWeek = 12;
  return currentWeek;
}

// ── Check if today is Thursday ──
function isThursday() {
  const now = new Date();
  return now.getDay() === 4; // 0 = Sunday, 4 = Thursday
}

// ── Post to Facebook Page ──
async function postToFacebook(post) {
  if (!META_PAGE_TOKEN || !META_PAGE_ID) {
    console.warn('[blog-scheduler] META_PAGE_TOKEN or META_PAGE_ID not set — skipping Facebook post');
    return false;
  }

  const message = `${post.icon} ${post.title}\n\n${post.excerpt}\n\nRead more: ${post.url}`;

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${META_PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        link: post.url,
        access_token: META_PAGE_TOKEN
      })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[blog-scheduler] Facebook post failed:', data);
      return false;
    }

    console.log('[blog-scheduler] Facebook post successful. Post ID:', data.id);
    return true;
  } catch (err) {
    console.error('[blog-scheduler] Facebook post error:', err.message);
    return false;
  }
}

// ── Post to Instagram ──
async function postToInstagram(post) {
  if (!META_PAGE_TOKEN || !META_INSTAGRAM_ID) {
    console.warn('[blog-scheduler] META_PAGE_TOKEN or META_INSTAGRAM_ID not set — skipping Instagram post');
    return false;
  }

  // Instagram requires creating a media container first, then publishing it
  // For text-only posts, we'll skip Instagram (Instagram requires images/video)
  // If you want Instagram posts, you'll need to add image URLs to blog-schedule.json
  
  console.log('[blog-scheduler] Instagram posting skipped (requires image — add image_url to blog-schedule.json if desired)');
  return true; // Return true to not block the flow
}

// ── Main scheduler function ──
async function checkAndPublish() {
  console.log('[blog-scheduler] Running check...');

  // Check if it's Thursday
  if (!isThursday()) {
    console.log('[blog-scheduler] Not Thursday — skipping');
    return;
  }

  // Get current week
  const currentWeek = getCurrentWeek();
  console.log('[blog-scheduler] Current week:', currentWeek);

  // Check if this week's post has already been published
  if (publishedPosts.has(currentWeek)) {
    console.log('[blog-scheduler] Week', currentWeek, 'already published — skipping');
    return;
  }

  // Load blog schedule
  const schedule = loadBlogSchedule();
  if (schedule.length === 0) {
    console.error('[blog-scheduler] No blog posts in schedule');
    return;
  }

  // Find this week's post
  const post = schedule.find(p => p.week === currentWeek);
  if (!post) {
    console.log('[blog-scheduler] No post found for week', currentWeek);
    return;
  }

  console.log('[blog-scheduler] Publishing week', currentWeek, ':', post.title);

  // Post to Facebook
  const fbSuccess = await postToFacebook(post);

  // Post to Instagram (currently skipped - needs images)
  const igSuccess = await postToInstagram(post);

  // If at least Facebook succeeded, mark as published and send email
  if (fbSuccess) {
    publishedPosts.add(currentWeek);
    console.log('[blog-scheduler] Post published successfully. Sending notification email...');

    // Send admin email notification
    try {
      await sendBlogPostNotificationEmail(post.title, post.url);
      console.log('[blog-scheduler] Notification email sent');
    } catch (err) {
      console.error('[blog-scheduler] Failed to send notification email:', err.message);
    }
  } else {
    console.error('[blog-scheduler] Post failed to publish');
  }
}

// ── Initialize scheduler ──
function initBlogScheduler() {
  console.log('[blog-scheduler] Initializing blog scheduler — checking every hour');

  // Run immediately on startup (for testing)
  checkAndPublish().catch(err => console.error('[blog-scheduler] Initial check error:', err));

  // Then run every hour
  setInterval(() => {
    checkAndPublish().catch(err => console.error('[blog-scheduler] Scheduled check error:', err));
  }, 60 * 60 * 1000); // 1 hour
}

// ── Start scheduler ──
initBlogScheduler();

console.log('[module] lib/blog-scheduler.js loaded');

module.exports = { initBlogScheduler };
