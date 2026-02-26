require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_EMAIL = 'airesources89@gmail.com';
const FROM_EMAIL = 'noreply@turnkeyaiservices.com';
const SITE_BASE_URL = 'https://turnkeyai-backend-production.up.railway.app';
const PORT = process.env.PORT || 3000;

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.get('/', (req, res) => {
  res.json({ status: 'TurnkeyAI Backend Running', time: new Date().toISOString() });
});

// ── INTAKE FORM HTML ──────────────────────────────────────────────────────
function getIntakeHTML() {
  const lines = [];
  const h = (s) => lines.push(s);

  h('<!DOCTYPE html>');
  h('<html lang="en">');
  h('<head>');
  h('<meta charset="UTF-8">');
  h('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  h('<title>New Client Intake | TurnkeyAI Services</title>');
  h('<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">');
  h('<style>');
  h('* { margin: 0; padding: 0; box-sizing: border-box; }');
  h(':root { --primary: #0066FF; --primary-dark: #0052CC; --accent: #00D68F; --dark: #1a1a2e; --gray-900: #1F2937; --gray-700: #374151; --gray-500: #6B7280; --gray-300: #D1D5DB; --gray-100: #F3F4F6; --white: #FFFFFF; --error: #EF4444; --success: #10B981; }');
  h("body { font-family: 'DM Sans', -apple-system, sans-serif; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); min-height: 100vh; color: var(--gray-900); line-height: 1.6; }");
  h('.header { background: var(--white); box-shadow: 0 2px 20px rgba(0,0,0,0.08); padding: 20px 0; position: sticky; top: 0; z-index: 100; }');
  h('.header-content { max-width: 900px; margin: 0 auto; padding: 0 24px; display: flex; justify-content: space-between; align-items: center; }');
  h(".logo { display: flex; align-items: baseline; gap: 4px; font-size: 28px; font-weight: 700; color: var(--dark); text-decoration: none; }");
  h('.logo span { color: var(--accent); }');
  h('.progress-container { display: flex; align-items: center; gap: 8px; }');
  h('.progress-bar { width: 200px; height: 8px; background: var(--gray-100); border-radius: 4px; overflow: hidden; }');
  h('.progress-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius: 4px; transition: width 0.5s ease; width: 0%; }');
  h('.progress-text { font-size: 14px; color: var(--gray-500); font-weight: 500; }');
  h('.container { max-width: 900px; margin: 0 auto; padding: 40px 24px 80px; }');
  h('.welcome { text-align: center; margin-bottom: 48px; }');
  h(".welcome h1 { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: var(--dark); margin-bottom: 16px; }");
  h('.welcome p { font-size: 18px; color: var(--gray-500); max-width: 600px; margin: 0 auto; }');
  h('.form-section { background: var(--white); border-radius: 16px; padding: 32px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); display: none; }');
  h('.form-section.active { display: block; animation: fadeIn 0.4s ease; }');
  h('@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }');
  h('.section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid var(--gray-100); }');
  h('.section-number { width: 48px; height: 48px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: var(--white); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; }');
  h(".section-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 600; color: var(--dark); }");
  h('.section-subtitle { font-size: 14px; color: var(--gray-500); margin-top: 4px; }');
  h('.form-group { margin-bottom: 24px; }');
  h('.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }');
  h('@media (max-width: 600px) { .form-row { grid-template-columns: 1fr; } }');
  h('label { display: block; font-weight: 600; color: var(--gray-700); margin-bottom: 8px; font-size: 15px; }');
  h('label .required { color: var(--error); margin-left: 2px; }');
  h('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], textarea, select { width: 100%; padding: 14px 16px; border: 2px solid var(--gray-300); border-radius: 10px; font-size: 16px; font-family: inherit; transition: all 0.2s ease; background: var(--white); }');
  h('input:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 4px rgba(0,102,255,0.1); }');
  h('textarea { min-height: 120px; resize: vertical; }');
  h('.checkbox-group { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }');
  h('.checkbox-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--gray-100); border-radius: 10px; cursor: pointer; transition: all 0.2s ease; border: 2px solid transparent; }');
  h('.checkbox-item:hover { background: #e8f0fe; }');
  h('.checkbox-item.checked { background: #e8f4ff; border-color: var(--primary); }');
  h('.checkbox-item input[type="checkbox"], .checkbox-item input[type="radio"] { width: 20px; height: 20px; accent-color: var(--primary); cursor: pointer; }');
  h('.checkbox-item span { font-size: 15px; color: var(--gray-700); }');
  h('.radio-group { display: flex; flex-direction: column; gap: 12px; }');
  h('.radio-item { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--gray-100); border-radius: 10px; cursor: pointer; transition: all 0.2s ease; border: 2px solid transparent; }');
  h('.radio-item:hover { background: #e8f0fe; }');
  h('.radio-item.checked { background: #e8f4ff; border-color: var(--primary); }');
  h('.radio-item input[type="radio"] { width: 20px; height: 20px; accent-color: var(--primary); cursor: pointer; }');
  h('.service-grid { display: grid; gap: 12px; }');
  h('.service-item { display: grid; grid-template-columns: 1fr 120px; gap: 12px; align-items: center; padding: 12px 16px; background: var(--gray-100); border-radius: 10px; }');
  h('.service-item.checked { background: #e8f4ff; }');
  h('.service-item label { display: flex; align-items: center; gap: 10px; margin: 0; cursor: pointer; }');
  h('.service-item input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--primary); }');
  h('.service-item input[type="text"] { padding: 10px 12px; font-size: 14px; }');
  h('.nav-buttons { display: flex; justify-content: space-between; gap: 16px; margin-top: 32px; padding-top: 24px; border-top: 2px solid var(--gray-100); }');
  h('.btn { padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; border: none; display: flex; align-items: center; gap: 8px; }');
  h('.btn-secondary { background: var(--gray-100); color: var(--gray-700); }');
  h('.btn-secondary:hover { background: var(--gray-300); }');
  h('.btn-primary { background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: var(--white); box-shadow: 0 4px 14px rgba(0,102,255,0.3); }');
  h('.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,102,255,0.4); }');
  h('.btn-success { background: linear-gradient(135deg, var(--accent), #00b377); color: var(--white); box-shadow: 0 4px 14px rgba(0,214,143,0.3); }');
  h('.btn-success:hover { transform: translateY(-2px); }');
  h('.info-box { background: linear-gradient(135deg, #e0f2fe, #bae6fd); border-left: 4px solid var(--primary); padding: 16px 20px; border-radius: 0 12px 12px 0; margin-bottom: 24px; }');
  h('.info-box p { color: #075985; font-size: 15px; }');
  h('.success-screen { text-align: center; padding: 60px 24px; display: none; }');
  h('.success-screen.active { display: block; }');
  h('.success-icon { width: 100px; height: 100px; background: linear-gradient(135deg, var(--accent), #00b377); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 32px; font-size: 48px; color: white; }');
  h(".success-screen h2 { font-family: 'Playfair Display', serif; font-size: 36px; color: var(--dark); margin-bottom: 16px; }");
  h('.success-screen p { font-size: 18px; color: var(--gray-500); max-width: 500px; margin: 0 auto 32px; }');
  h('.category-header { font-size: 16px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--gray-100); }');
  h('.category-header:first-of-type { margin-top: 0; }');
  h('.industry-select-wrapper select { font-size: 18px; padding: 18px 20px; font-weight: 600; background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border: 2px solid var(--primary); color: var(--dark); cursor: pointer; }');
  h('.industry-badge { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }');
  h('</style>');
  h('</head>');
  h('<body>');
  h('<header class="header"><div class="header-content">');
  h('<a href="/" class="logo">TurnkeyAI<span>Services</span></a>');
  h('<div class="progress-container"><div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div><span class="progress-text" id="progressText">Step 1 of 10</span></div>');
  h('</div></header>');
  h('<div class="container">');
  h('<div class="welcome" id="newClientWelcome">');
  h("<h1 id=\"welcomeTitle\">Let's Build Your Website</h1>");
  h("<p id=\"welcomeSubtitle\">Select your industry below and we'll customize this questionnaire for your business. Takes about 10-15 minutes.</p>");
  h('</div>');
  h('<form id="intakeForm" name="client-intake">');
  h('<input type="hidden" name="form-name" value="client-intake">');
  h('<input type="hidden" name="operator_id" id="operatorId" value="">');
  h('<input type="hidden" name="operator_name" id="operatorName" value="">');

  // SECTION 1
  h('<div class="form-section active" data-section="1">');
  h('<div class="section-header"><div class="section-number">1</div><div><div class="section-title">Business Information</div><div class="section-subtitle">Tell us about your business</div></div></div>');
  h('<div class="form-group"><label>Select Your Industry <span class="required">*</span></label>');
  h('<div class="industry-select-wrapper">');
  h('<select name="industry" id="industrySelect" required onchange="handleIndustryChange()">');
  h('<option value="">-- Choose Your Industry --</option>');
  h('<optgroup label="Agriculture &amp; Food">');
  h('<option value="agriculture">Agriculture / Farming</option>');
  h('<option value="restaurant">Restaurant / Food Service</option>');
  h('<option value="catering">Catering</option>');
  h('<option value="food_truck">Food Truck</option>');
  h('<option value="bakery">Bakery</option>');
  h('<option value="coffee_shop">Coffee Shop</option>');
  h('</optgroup>');
  h('<optgroup label="Home Services">');
  h('<option value="cleaning">House Cleaning</option>');
  h('<option value="plumbing">Plumbing</option>');
  h('<option value="electrical">Electrical</option>');
  h('<option value="hvac">HVAC / Heating &amp; Cooling</option>');
  h('<option value="roofing">Roofing</option>');
  h('<option value="painting">Painting</option>');
  h('<option value="landscaping">Landscaping / Lawn Care</option>');
  h('<option value="pest_control">Pest Control</option>');
  h('<option value="handyman">Handyman / General Repair</option>');
  h('<option value="flooring">Flooring / Tile</option>');
  h('<option value="fencing">Fencing</option>');
  h('<option value="pressure_washing">Pressure Washing</option>');
  h('<option value="pool_service">Pool Service</option>');
  h('<option value="moving">Moving / Hauling</option>');
  h('<option value="junk_removal">Junk Removal</option>');
  h('<option value="carpet_upholstery">Carpet &amp; Upholstery Cleaning</option>');
  h('<option value="garage_doors">Garage Doors</option>');
  h('</optgroup>');
  h('<optgroup label="Automotive">');
  h('<option value="auto_repair">Auto Repair</option>');
  h('<option value="auto_detailing">Auto Detailing</option>');
  h('<option value="towing">Towing</option>');
  h('<option value="auto_body">Auto Body / Collision</option>');
  h('</optgroup>');
  h('<optgroup label="Beauty &amp; Wellness">');
  h('<option value="salon">Hair Salon / Barbershop</option>');
  h('<option value="nail_salon">Nail Salon</option>');
  h('<option value="spa_massage">Spa / Massage</option>');
  h('<option value="fitness">Fitness / Personal Training</option>');
  h('<option value="chiropractic">Chiropractic</option>');
  h('<option value="dental">Dental</option>');
  h('</optgroup>');
  h('<optgroup label="Care Services">');
  h('<option value="daycare">Daycare / Childcare</option>');
  h('<option value="pet_services">Pet Services / Grooming</option>');
  h('<option value="veterinary">Veterinary</option>');
  h('<option value="senior_care">Senior Care / Home Health</option>');
  h('</optgroup>');
  h('<optgroup label="Professional Services">');
  h('<option value="real_estate">Real Estate</option>');
  h('<option value="photography">Photography / Videography</option>');
  h('<option value="tutoring">Tutoring / Education</option>');
  h('<option value="legal">Legal Services</option>');
  h('<option value="accounting">Accounting / Tax Prep</option>');
  h('<option value="insurance">Insurance</option>');
  h('<option value="it_support">IT / Tech Support</option>');
  h('<option value="event_planning">Event Planning</option>');
  h('<option value="security">Security Services</option>');
  h('</optgroup>');
  h('<optgroup label="Construction &amp; Development">');
  h('<option value="construction">General Construction</option>');
  h('<option value="demolition">Demolition</option>');
  h('<option value="community_revitalization">Community Revitalization</option>');
  h('<option value="trade_school">Trade School Development</option>');
  h('</optgroup>');
  h('<optgroup label="Other"><option value="other">Other</option></optgroup>');
  h('</select></div></div>');
  h('<div id="industryBadge" style="display:none;"></div>');
  h('<div class="form-row">');
  h('<div class="form-group"><label>Business Name <span class="required">*</span></label><input type="text" name="businessName" required placeholder="e.g., Jazzy\'s House Cleaning"></div>');
  h('<div class="form-group"><label>Your Name <span class="required">*</span></label><input type="text" name="ownerName" required placeholder="Your full name"></div>');
  h('</div>');
  h('<div class="form-group"><label>Business Address <span class="required">*</span></label><input type="text" name="address" required placeholder="Street address"></div>');
  h('<div class="form-row">');
  h('<div class="form-group"><label>City <span class="required">*</span></label><input type="text" name="city" required placeholder="City"></div>');
  h('<div class="form-group"><label>State <span class="required">*</span></label><input type="text" name="state" required placeholder="State"></div>');
  h('</div>');
  h('<div class="form-row">');
  h('<div class="form-group"><label>ZIP Code <span class="required">*</span></label><input type="text" name="zip" required placeholder="ZIP"></div>');
  h('<div class="form-group"><label>Years in Business</label><input type="number" name="yearsInBusiness" placeholder="e.g., 5"></div>');
  h('</div>');
  h('<div class="form-row">');
  h('<div class="form-group"><label>Business Phone <span class="required">*</span></label><input type="tel" name="phone" required placeholder="(555) 123-4567"></div>');
  h('<div class="form-group"><label>Email Address <span class="required">*</span></label><input type="email" name="email" required placeholder="you@email.com"></div>');
  h('</div>');
  h('<div id="businessTypeContainer"></div>');
  h('<div class="nav-buttons"><div></div><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 2
  h('<div class="form-section" data-section="2">');
  h('<div class="section-header"><div class="section-number">2</div><div><div class="section-title">Current Online Presence</div><div class="section-subtitle">Where can customers find you now?</div></div></div>');
  h('<div class="form-group"><label>Current Website (if any)</label><input type="url" name="currentWebsite" placeholder="https://yoursite.com"></div>');
  h('<div class="form-row"><div class="form-group"><label>Facebook Page</label><input type="url" name="facebook" placeholder="https://facebook.com/yourpage"></div><div class="form-group"><label>Instagram Handle</label><input type="text" name="instagram" placeholder="@yourusername"></div></div>');
  h('<div class="form-row"><div class="form-group"><label>Google Business Profile</label><input type="url" name="googleBusiness" placeholder="Link to your Google listing"></div><div class="form-group"><label>Other Social Media</label><input type="text" name="otherSocial" placeholder="TikTok, LinkedIn, YouTube, etc."></div></div>');
  h('<div class="form-group"><label>Do you have a logo file you can send us?</label><div class="checkbox-group">');
  h('<label class="checkbox-item"><input type="radio" name="hasLogo" value="yes"><span>Yes, I\'ll email it</span></label>');
  h('<label class="checkbox-item"><input type="radio" name="hasLogo" value="no"><span>No, I need one</span></label>');
  h('<label class="checkbox-item"><input type="radio" name="hasLogo" value="text_only"><span>Just use text/name</span></label>');
  h('</div></div>');
  h('<div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 3
  h('<div class="form-section" data-section="3">');
  h('<div class="section-header"><div class="section-number">3</div><div><div class="section-title" id="servicesTitle">Services &amp; Pricing</div><div class="section-subtitle" id="servicesSubtitle">Check services you offer and add your prices</div></div></div>');
  h('<div id="servicesContainer"><div class="info-box"><p>Please select an industry in Step 1 to see your services list.</p></div></div>');
  h('<div class="form-group" style="margin-top:24px;"><label>Additional services not listed above:</label><textarea name="additionalServices" placeholder="List any other services or products you offer with pricing..."></textarea></div>');
  h('<div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 4
  h('<div class="form-section" data-section="4">');
  h('<div class="section-header"><div class="section-number">4</div><div><div class="section-title">Hours &amp; Availability</div><div class="section-subtitle">When are you available?</div></div></div>');
  h('<div class="form-group"><label>Business Hours</label><div class="service-grid">');
  for (const day of ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) {
    const cap = day.charAt(0).toUpperCase() + day.slice(1);
    h(`<div class="service-item"><label><input type="checkbox" name="day_${day}"> ${cap}</label><input type="text" name="hours_${day}" placeholder="8am - 5pm"></div>`);
  }
  h('</div></div>');
  h('<div id="schedulingContainer"></div>');
  h('<div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 5
  h('<div class="form-section" data-section="5">');
  h('<div class="section-header"><div class="section-number">5</div><div><div class="section-title" id="industryQTitle">Industry Details</div><div class="section-subtitle" id="industryQSubtitle">Questions specific to your business</div></div></div>');
  h('<div id="industryQuestionsContainer"><div class="info-box"><p>Please select an industry in Step 1 to see your custom questions.</p></div></div>');
  h('<div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 6
  h('<div class="form-section" data-section="6">');
  h('<div class="section-header"><div class="section-number">6</div><div><div class="section-title">Target Market</div><div class="section-subtitle">Who are your ideal customers?</div></div></div>');
  h('<div id="targetMarketContainer"></div>');
  h('<div class="form-row"><div class="form-group"><label>Primary City/Area You Serve <span class="required">*</span></label><input type="text" name="targetCity" required placeholder="e.g., Bay St. Louis, MS"></div><div class="form-group"><label>Service Radius (miles)</label><input type="text" name="targetRadius" placeholder="e.g., 25 miles"></div></div>');
  h('<div class="form-group"><label>What makes you BETTER than your competition?</label><textarea name="competitiveAdvantage" placeholder="Why should customers choose YOU?"></textarea></div>');
  h('<div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 7
  h('<div class="form-section" data-section="7">');
  h('<div class="section-header"><div class="section-number">7</div><div><div class="section-title">AI Chat Assistant Setup</div><div class="section-subtitle">Your 24/7 virtual receptionist</div></div></div>');
  h('<div class="info-box"><p>Your website will include a 24/7 AI chat assistant that answers questions, captures leads, and books appointments &mdash; even while you sleep.</p></div>');
  h('<div class="form-group"><label>What questions do customers frequently ask you?</label><textarea name="faqQuestions" id="faqSuggestions" placeholder="e.g., How much does it cost? Do you offer free estimates?"></textarea></div>');
  h('<div class="form-group"><label>What should the AI tell customers about pricing?</label><div class="radio-group">');
  h('<label class="radio-item"><input type="radio" name="pricingDisplay" value="all"><span>Show all prices on website</span></label>');
  h('<label class="radio-item"><input type="radio" name="pricingDisplay" value="ranges"><span>General ranges only ("Starting at $XX")</span></label>');
  h('<label class="radio-item"><input type="radio" name="pricingDisplay" value="consult"><span>"Contact us for a free estimate"</span></label>');
  h('</div></div>');
  h('<div class="form-group"><label>Preferred AI Chat Personality</label><div class="checkbox-group">');
  h('<label class="checkbox-item"><input type="radio" name="chatPersonality" value="professional"><span>Professional &amp; Formal</span></label>');
  h('<label class="checkbox-item"><input type="radio" name="chatPersonality" value="friendly"><span>Friendly &amp; Casual</span></label>');
  h('<label class="checkbox-item"><input type="radio" name="chatPersonality" value="warm"><span>Warm &amp; Supportive</span></label>');
  h('<label class="checkbox-item"><input type="radio" name="chatPersonality" value="confident"><span>Confident &amp; Expert</span></label>');
  h('</div></div>');
  h('<div class="form-group"><label>AI Chat Name (optional)</label><input type="text" name="chatName" placeholder="e.g., Ask Sarah, Chat with Mike"></div>');
  h('<div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 8
  h('<div class="form-section" data-section="8">');
  h('<div class="section-header"><div class="section-number">8</div><div><div class="section-title">About Your Business</div><div class="section-subtitle">Your story builds trust and sets you apart</div></div></div>');
  h('<div class="form-group"><label>Your Business Story <span class="required">*</span></label><textarea name="aboutUs" rows="5" placeholder="Tell us how you got started. Why did you start this business?"></textarea></div>');
  h('<div class="form-group"><label>Owner / Founder Name(s) and Background</label><textarea name="ownerBackground" rows="3" placeholder="e.g., Founded by John and Maria Santos..."></textarea></div>');
  h('<div class="form-group"><label>Years in Business &amp; Key Milestones</label><input type="text" name="milestones" placeholder="e.g., In business since 2015. Expanded to second location in 2019."></div>');
  h('<div class="form-group"><label>Community Involvement (if any)</label><input type="text" name="communityInvolvement" placeholder="e.g., We sponsor Little League, donate to food bank..."></div>');
  h('<div class="form-group"><label>Awards, Certifications, or Recognition</label><input type="text" name="awards" placeholder="e.g., BBB A+ Rating, Licensed &amp; Insured, 4.9 stars on Google..."></div>');
  h('<div class="form-group"><label>Your Mission Statement or Tagline</label><input type="text" name="missionStatement" placeholder="e.g., Fresh Gulf seafood, family recipes, Southern hospitality."></div>');
  h('<div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 9
  h('<div class="form-section" data-section="9">');
  h('<div class="section-header"><div class="section-number">9</div><div><div class="section-title">Business Photos</div><div class="section-subtitle">Photos help your site look professional and build trust</div></div></div>');
  h('<div class="form-group"><label>Owner / Team Photo</label>');
  h('<div onclick="document.getElementById(\'ownerPhotoInput\').click()" style="border:2px dashed #ccc;border-radius:12px;padding:30px;text-align:center;cursor:pointer;background:#fafafa;">');
  h('<div id="ownerPhotoPreview" style="display:none;margin-bottom:10px;"><img id="ownerPhotoImg" style="max-width:200px;max-height:200px;border-radius:8px;"></div>');
  h('<div id="ownerPhotoPrompt">Click to upload owner/team photo<br><span style="font-size:12px;color:#999;">JPG, PNG max 5MB</span></div>');
  h('</div>');
  h('<input type="file" id="ownerPhotoInput" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this,\'ownerPhoto\')">');
  h('<input type="hidden" name="ownerPhoto" id="ownerPhotoData" value="">');
  h('</div>');
  h('<div class="form-group"><label>Work / Service Photos</label>');
  h('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">');
  h('<div onclick="document.getElementById(\'workPhoto1Input\').click()" style="border:2px dashed #ccc;border-radius:12px;padding:20px;text-align:center;cursor:pointer;background:#fafafa;"><div id="workPhoto1Preview" style="display:none;margin-bottom:8px;"><img id="workPhoto1Img" style="max-width:150px;max-height:150px;border-radius:8px;"></div><div id="workPhoto1Prompt">Work photo 1</div></div>');
  h('<div onclick="document.getElementById(\'workPhoto2Input\').click()" style="border:2px dashed #ccc;border-radius:12px;padding:20px;text-align:center;cursor:pointer;background:#fafafa;"><div id="workPhoto2Preview" style="display:none;margin-bottom:8px;"><img id="workPhoto2Img" style="max-width:150px;max-height:150px;border-radius:8px;"></div><div id="workPhoto2Prompt">Work photo 2</div></div>');
  h('</div>');
  h('<input type="file" id="workPhoto1Input" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this,\'workPhoto1\')">');
  h('<input type="file" id="workPhoto2Input" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this,\'workPhoto2\')">');
  h('<input type="hidden" name="workPhoto1" id="workPhoto1Data" value="">');
  h('<input type="hidden" name="workPhoto2" id="workPhoto2Data" value="">');
  h('</div>');
  h('<div class="form-group" style="margin-top:16px;padding:16px;background:#fff3cd;border:1px solid #ffc107;border-radius:10px;">');
  h('<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:0;">');
  h('<input type="checkbox" id="skipPhotosCheckbox" name="skipPhotos" value="yes" onchange="updatePhotoRequirement()" style="width:18px;height:18px;margin-top:2px;">');
  h('<span style="font-size:13px;"><strong>Skip photos for now</strong> &mdash; I can email photos later to airesources89@gmail.com</span>');
  h('</label></div>');
  h('<div id="photoValidationMsg" style="display:none;color:#dc2626;font-size:13px;font-weight:600;margin-top:10px;padding:10px;background:#fef2f2;border-radius:8px;">Please upload at least an owner photo and one work photo, or check the box above to skip.</div>');
  h('<div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue &rarr;</button></div>');
  h('</div>');

  // SECTION 10
  h('<div class="form-section" data-section="10">');
  h('<div class="section-header"><div class="section-number">10</div><div><div class="section-title">Final Details</div><div class="section-subtitle">Almost done!</div></div></div>');
  h('<div class="form-group"><label>Payment Methods You Accept</label><div class="checkbox-group">');
  h('<label class="checkbox-item"><input type="checkbox" name="pay_cash" value="cash"><span>Cash</span></label>');
  h('<label class="checkbox-item"><input type="checkbox" name="pay_card" value="card"><span>Credit/Debit Cards</span></label>');
  h('<label class="checkbox-item"><input type="checkbox" name="pay_check" value="check"><span>Check</span></label>');
  h('<label class="checkbox-item"><input type="checkbox" name="pay_venmo" value="venmo"><span>Venmo</span></label>');
  h('<label class="checkbox-item"><input type="checkbox" name="pay_cashapp" value="cashapp"><span>CashApp</span></label>');
  h('<label class="checkbox-item"><input type="checkbox" name="pay_zelle" value="zelle"><span>Zelle</span></label>');
  h('</div></div>');
  h('<div class="form-group"><label>Anything else we should know?</label><textarea name="additionalNotes" placeholder="Any special features you want, things you DON\'T want, or other notes..."></textarea></div>');
  h('<div class="form-group"><label>How did you hear about TurnkeyAI Services?</label><input type="text" name="referralSource" placeholder="e.g., Google, referral from friend, social media"></div>');
  h('<div class="nav-buttons">');
  h('<button type="button" class="btn btn-secondary" onclick="prevSection()">&larr; Back</button>');
  h('<button type="submit" class="btn btn-success">Submit &amp; Build My Website</button>');
  h('</div></div>');

  h('</form>');

  // SUCCESS SCREEN
  h('<div class="success-screen" id="successScreen">');
  h('<div class="success-icon">&#10003;</div>');
  h("<h2>You're All Set!</h2>");
  h("<p>We've received your information and will start building your website right away!</p>");
  h('<div style="background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:28px;border-radius:16px;max-width:500px;margin:24px auto;text-align:center;">');
  h('<p style="font-size:18px;font-weight:700;margin-bottom:8px;">Activate &amp; Pay Now</p>');
  h('<p style="opacity:.9;margin-bottom:20px;font-size:14px;">$0 setup &bull; $99/month &bull; Cancel anytime</p>');
  h('<div style="display:flex;flex-direction:column;gap:12px;align-items:center;">');
  h('<a href="https://buy.stripe.com/dRm3cx0PY13J6Wu4DrfnO05" target="_blank" style="display:inline-block;background:#00D68F;color:white;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;width:280px;">Pay with Credit Card</a>');
  h('<a href="https://www.paypal.com/paypalme/airesources89" target="_blank" style="display:inline-block;background:#FFC439;color:#003087;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;width:280px;">Pay with PayPal</a>');
  h('<a href="#" onclick="showCashAppInfo();return false;" style="display:inline-block;background:#00D632;color:white;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;width:280px;">Pay with CashApp</a>');
  h('</div>');
  h('<div id="cashAppInfo" style="display:none;background:rgba(255,255,255,.15);padding:14px;border-radius:8px;margin-top:12px;">');
  h('<p style="font-size:14px;font-weight:600;">Send $99 to <span style="font-size:16px;">$AIResources89</span></p>');
  h('<p style="font-size:12px;opacity:.8;margin-top:4px;">Include your business name in the note</p>');
  h('</div></div>');
  h('<div style="background:var(--gray-100);padding:24px;border-radius:12px;text-align:left;max-width:500px;margin:16px auto 0;">');
  h('<p style="font-weight:600;margin-bottom:12px;">What happens next:</p>');
  h('<ul style="padding-left:20px;color:var(--gray-500);line-height:2;">');
  h('<li>We build your AI-powered website (typically within 24 hours)</li>');
  h('<li>You\'ll receive a preview link by email to review and approve</li>');
  h('<li>Once approved, your site goes live with AI chat, booking, and lead capture</li>');
  h('<li>Send your logo and photos to <strong>airesources89@gmail.com</strong></li>');
  h('</ul></div>');
  h('<p style="margin-top:24px;font-size:14px;color:var(--gray-500);">Questions? Call us at (603) 922-2004</p>');
  h('</div>'); // end success-screen
  h('</div>'); // end container

  // JAVASCRIPT
  h('<script>');
  h('(function(){');
  h('  var p=new URLSearchParams(window.location.search);');
  h('  var opId=p.get("operator")||p.get("op")||"";');
  h('  var opName=p.get("operator_name")||p.get("opname")||"";');
  h('  if(opId){document.getElementById("operatorId").value=opId;document.getElementById("operatorName").value=opName;}');
  h('})();');
  h('');
  h('let currentSection = 1;');
  h('const totalSections = 10;');
  h('');
  h('const industryData = {');
  h('  cleaning: {');
  h('    businessTypes:[{value:"solo",label:"Solo Cleaner"},{value:"small_team",label:"Small Team (2-5)"},{value:"company",label:"Cleaning Company (6+)"},{value:"residential_only",label:"Residential Only"},{value:"commercial_only",label:"Commercial Only"},{value:"both",label:"Both"}],');
  h('    services:{"Residential Cleaning":[{name:"general_clean",label:"General / Standard Cleaning",pricePlaceholder:"$/visit"},{name:"deep_clean",label:"Deep Cleaning",pricePlaceholder:"$/visit"},{name:"move_inout",label:"Move In / Move Out Cleaning",pricePlaceholder:"$/visit"},{name:"recurring_weekly",label:"Weekly Recurring",pricePlaceholder:"$/visit"},{name:"recurring_biweekly",label:"Bi-Weekly",pricePlaceholder:"$/visit"},{name:"recurring_monthly",label:"Monthly",pricePlaceholder:"$/visit"}],"Specialty":[{name:"carpet_clean",label:"Carpet Cleaning",pricePlaceholder:"$/room"},{name:"window_clean",label:"Window Cleaning",pricePlaceholder:"$/window"},{name:"organizing",label:"Organizing / Decluttering",pricePlaceholder:"$/hour"}],"Commercial":[{name:"office_clean",label:"Office Cleaning",pricePlaceholder:"$/visit"},{name:"airbnb",label:"Airbnb / Vacation Rental Turnover",pricePlaceholder:"$/turnover"}]},');
  h('    scheduling:\'<div class="form-group"><label>How do you handle booking?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="bookingMethod" value="phone"><span>Phone calls only</span></label><label class="checkbox-item"><input type="radio" name="bookingMethod" value="online"><span>Want online booking</span></label><label class="checkbox-item"><input type="radio" name="bookingMethod" value="any"><span>All methods</span></label></div></div><div class="form-group"><label>Do you offer same-day or emergency cleaning?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="sameDay" value="yes"><span>Yes</span></label><label class="checkbox-item"><input type="radio" name="sameDay" value="no"><span>No, scheduled only</span></label></div></div>\',');
  h('    industryQuestions:\'<div class="form-group"><label>How do you price your services?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="pricingModel" value="flat"><span>Flat rate per visit</span></label><label class="checkbox-item"><input type="radio" name="pricingModel" value="sqft"><span>By square footage</span></label><label class="checkbox-item"><input type="radio" name="pricingModel" value="hourly"><span>Hourly rate</span></label></div></div><div class="form-group"><label>Do you provide your own supplies?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="supplies" value="all"><span>Yes, everything included</span></label><label class="checkbox-item"><input type="radio" name="supplies" value="client"><span>Client provides all</span></label></div></div><div class="form-group"><label>Are you insured and bonded?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="insured" value="both"><span>Yes, insured &amp; bonded</span></label><label class="checkbox-item"><input type="radio" name="insured" value="no"><span>Not yet</span></label></div></div><div class="form-group"><label>What sets your cleaning apart?</label><textarea name="cleaningSpecialty" placeholder="e.g., hospital-grade disinfectants, always clean baseboards..."></textarea></div>\',');
  h('    targetMarket:\'<div class="form-group"><label>Who are your ideal customers?</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="cust_homeowners" value="homeowners"><span>Homeowners</span></label><label class="checkbox-item"><input type="checkbox" name="cust_renters" value="renters"><span>Renters</span></label><label class="checkbox-item"><input type="checkbox" name="cust_busy_pros" value="busy_pros"><span>Busy Professionals</span></label><label class="checkbox-item"><input type="checkbox" name="cust_seniors" value="seniors"><span>Seniors</span></label><label class="checkbox-item"><input type="checkbox" name="cust_airbnb" value="airbnb"><span>Airbnb Hosts</span></label></div></div>\',');
  h('    faqSuggestions:"e.g., How much does a cleaning cost? Do you bring your own supplies? Are you insured?",');
  h('    sectionTitle:"Services & Pricing",sectionSubtitle:"Check services you offer and add your prices",industryQTitle:"Cleaning Business Details",industryQSubtitle:"Help us understand how you operate"');
  h('  },');
  h('  agriculture: {');
  h('    businessTypes:[{value:"specialty_crop",label:"Specialty Crops (herbs, microgreens, mushrooms)"},{value:"aquaponics",label:"Aquaponics / Aquaculture"},{value:"market_garden",label:"Market Garden / Urban Farm"},{value:"mixed",label:"Mixed / Regenerative / Integrated"},{value:"csa",label:"CSA / Subscription Box Farm"}],');
  h('    services:{"Products":[{name:"fresh_produce",label:"Fresh Produce / Vegetables",pricePlaceholder:"$/lb"},{name:"microgreens",label:"Microgreens",pricePlaceholder:"$/tray"},{name:"herbs",label:"Fresh & Dried Herbs",pricePlaceholder:"$/bunch"},{name:"mushrooms",label:"Specialty Mushrooms",pricePlaceholder:"$/lb"},{name:"fish",label:"Farm-Raised Fish / Catfish",pricePlaceholder:"$/lb"},{name:"eggs",label:"Farm Eggs",pricePlaceholder:"$/dozen"}],"Services":[{name:"csa_box",label:"CSA / Weekly Subscription Box",pricePlaceholder:"$/week"},{name:"farm_tours",label:"Farm Tours",pricePlaceholder:"$/person"},{name:"workshops",label:"Workshops & Classes",pricePlaceholder:"$/class"},{name:"delivery",label:"Home Delivery",pricePlaceholder:"$/delivery"}]},');
  h('    scheduling:\'<div class="form-group"><label>Seasonal Availability</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="season_spring" value="spring"><span>Spring</span></label><label class="checkbox-item"><input type="checkbox" name="season_summer" value="summer"><span>Summer</span></label><label class="checkbox-item"><input type="checkbox" name="season_fall" value="fall"><span>Fall</span></label><label class="checkbox-item"><input type="checkbox" name="season_yearround" value="yearround"><span>Year-Round</span></label></div></div><div class="form-group"><label>Do you attend farmers markets?</label><input type="text" name="farmersMarkets" placeholder="Which markets, what days?"></div>\',');
  h('    industryQuestions:\'<div class="form-group"><label>Farm / Property Size</label><input type="text" name="farmSize" placeholder="e.g., 2.5 acres"></div><div class="form-group"><label>Growing Methods</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="method_organic" value="organic"><span>Organic</span></label><label class="checkbox-item"><input type="checkbox" name="method_regenerative" value="regenerative"><span>Regenerative</span></label><label class="checkbox-item"><input type="checkbox" name="method_aquaponics" value="aquaponics"><span>Aquaponics</span></label><label class="checkbox-item"><input type="checkbox" name="method_indoor" value="indoor"><span>Indoor / Controlled Environment</span></label></div></div><div class="form-group"><label>Your farm story</label><textarea name="farmStory" placeholder="What drives you? Your mission and passion for agriculture..."></textarea></div>\',');
  h('    targetMarket:\'<div class="form-group"><label>Primary customers</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="cust_families" value="families"><span>Local Families</span></label><label class="checkbox-item"><input type="checkbox" name="cust_restaurants" value="restaurants"><span>Restaurants / Chefs</span></label><label class="checkbox-item"><input type="checkbox" name="cust_health" value="health"><span>Health-Conscious Consumers</span></label></div></div>\',');
  h('    faqSuggestions:"e.g., Do you deliver? Are your products organic? When is harvest season?",');
  h('    sectionTitle:"Products & Services",sectionSubtitle:"Check what you sell and add pricing",industryQTitle:"Farm & Agriculture Details",industryQSubtitle:"Tell us about your operation"');
  h('  },');
  h('  restaurant: {');
  h('    businessTypes:[{value:"full_service",label:"Full-Service Restaurant"},{value:"fast_casual",label:"Fast Casual"},{value:"seafood",label:"Seafood Restaurant"},{value:"bbq",label:"BBQ / Smokehouse"},{value:"bar_grill",label:"Bar & Grill"}],');
  h('    services:{"Dining":[{name:"dine_in",label:"Dine In",pricePlaceholder:"avg. $/person"},{name:"takeout",label:"Takeout",pricePlaceholder:"avg. $/order"},{name:"delivery",label:"Delivery",pricePlaceholder:"delivery fee"},{name:"catering",label:"Catering",pricePlaceholder:"$/person"}],"Meals":[{name:"breakfast",label:"Breakfast",pricePlaceholder:"avg. $/person"},{name:"lunch",label:"Lunch",pricePlaceholder:"avg. $/person"},{name:"dinner",label:"Dinner",pricePlaceholder:"avg. $/person"}]},');
  h('    scheduling:\'<div class="form-group"><label>Do you take reservations?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="reservations" value="yes"><span>Yes</span></label><label class="checkbox-item"><input type="radio" name="reservations" value="no"><span>Walk-in only</span></label></div></div>\',');
  h('    industryQuestions:\'<div class="form-group"><label>Cuisine Type</label><input type="text" name="cuisineType" placeholder="e.g., Southern comfort, Cajun seafood..."></div><div class="form-group"><label>Signature Dishes</label><textarea name="signatureDishes" placeholder="Your must-order items..."></textarea></div><div class="form-group"><label>Dietary Options</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="diet_vegetarian" value="vegetarian"><span>Vegetarian</span></label><label class="checkbox-item"><input type="checkbox" name="diet_glutenfree" value="glutenfree"><span>Gluten-Free</span></label></div></div><div class="form-group"><label>Seating Capacity</label><input type="text" name="seatingCapacity" placeholder="e.g., 60 inside, 20 on patio"></div>\',');
  h('    targetMarket:\'<div class="form-group"><label>Primary customers</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="cust_families_r" value="families"><span>Families</span></label><label class="checkbox-item"><input type="checkbox" name="cust_tourists_r" value="tourists"><span>Tourists</span></label><label class="checkbox-item"><input type="checkbox" name="cust_locals_r" value="locals"><span>Local Regulars</span></label></div></div>\',');
  h('    faqSuggestions:"e.g., Are you open on Sundays? Do you take reservations? Do you have gluten-free options?",');
  h('    sectionTitle:"Menu & Services",sectionSubtitle:"Check what you offer and add pricing",industryQTitle:"Restaurant Details",industryQSubtitle:"Tell us what makes your restaurant special"');
  h('  },');
  h('  plumbing: {');
  h('    businessTypes:[{value:"solo_plumber",label:"Solo Plumber"},{value:"small_company",label:"Small Company (2-5)"},{value:"both_plumb",label:"Residential & Commercial"}],');
  h('    services:{"Emergency & Repair":[{name:"emergency_plumb",label:"24/7 Emergency Service",pricePlaceholder:"$/call"},{name:"leak_repair",label:"Leak Detection & Repair",pricePlaceholder:"Starting $"},{name:"drain_clearing",label:"Drain Clearing",pricePlaceholder:"Starting $"}],"Installation":[{name:"water_heater",label:"Water Heater Install / Repair",pricePlaceholder:"Starting $"},{name:"faucet_fixture",label:"Faucet & Fixture Install",pricePlaceholder:"$/install"},{name:"toilet_install",label:"Toilet Install / Repair",pricePlaceholder:"Starting $"}]},');
  h('    scheduling:\'<div class="form-group"><label>Emergency Availability</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="emergencyAvail" value="24_7"><span>24/7 Emergency Service</span></label><label class="checkbox-item"><input type="radio" name="emergencyAvail" value="business"><span>Business Hours Only</span></label></div></div>\',');
  h('    industryQuestions:\'<div class="form-group"><label>Licenses & Certifications</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="lic_master" value="master"><span>Master Plumber</span></label><label class="checkbox-item"><input type="checkbox" name="lic_insured" value="insured"><span>Licensed & Insured</span></label></div></div><div class="form-group"><label>What sets you apart?</label><textarea name="plumbingAdvantage" placeholder="e.g., Same-day service, flat-rate pricing..."></textarea></div>\',');
  h('    targetMarket:\'<div class="form-group"><label>Ideal customers</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="cust_homeowners_p" value="homeowners"><span>Homeowners</span></label><label class="checkbox-item"><input type="checkbox" name="cust_landlords" value="landlords"><span>Landlords</span></label></div></div>\',');
  h('    faqSuggestions:"e.g., Do you offer free estimates? Are you available for emergencies?",');
  h('    sectionTitle:"Services & Pricing",sectionSubtitle:"Check services and add starting prices",industryQTitle:"Plumbing Business Details",industryQSubtitle:"Tell us about your credentials"');
  h('  }');
  h('};');
  h('');
  h('// Generic fallback for all other industries');
  h('["hvac","electrical","roofing","painting","landscaping","pest_control","handyman","flooring","fencing","pressure_washing","pool_service","moving","junk_removal","carpet_upholstery","garage_doors","auto_repair","auto_detailing","towing","auto_body","salon","nail_salon","spa_massage","fitness","chiropractic","dental","daycare","pet_services","veterinary","senior_care","real_estate","photography","tutoring","legal","accounting","insurance","it_support","event_planning","security","construction","demolition","community_revitalization","trade_school","catering","food_truck","bakery","coffee_shop","other"].forEach(function(ind){');
  h('  if(!industryData[ind]){');
  h('    industryData[ind]={');
  h('      businessTypes:[{value:"solo",label:"Solo / Owner-Operator"},{value:"small",label:"Small Team"},{value:"company",label:"Company"}],');
  h('      services:{"Services":[{name:"service1",label:"Primary Service",pricePlaceholder:"Starting $"},{name:"service2",label:"Secondary Service",pricePlaceholder:"Starting $"},{name:"service3",label:"Additional Service",pricePlaceholder:"Starting $"}]},');
  h('      scheduling:\'<div class="form-group"><label>How do customers book?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="bookingMethod" value="phone"><span>Phone</span></label><label class="checkbox-item"><input type="radio" name="bookingMethod" value="online"><span>Online</span></label></div></div>\',');
  h('      industryQuestions:\'<div class="form-group"><label>Licenses & Insurance</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="lic_insured_g" value="insured"><span>Licensed & Insured</span></label></div></div><div class="form-group"><label>What sets you apart?</label><textarea name="advantage" placeholder="What makes your business better than the competition?"></textarea></div>\',');
  h('      targetMarket:\'<div class="form-group"><label>Ideal customers</label><textarea name="idealCustomer" placeholder="Describe your typical customer..."></textarea></div>\',');
  h('      faqSuggestions:"e.g., How much does it cost? Are you licensed? Do you offer free estimates?",');
  h('      sectionTitle:"Services & Pricing",sectionSubtitle:"Check services you offer and add prices",');
  h('      industryQTitle:"Business Details",industryQSubtitle:"Tell us about your operations"');
  h('    };');
  h('  }');
  h('});');
  h('');
  h('function handleIndustryChange(){');
  h('  var industry=document.getElementById("industrySelect").value;');
  h('  var data=industryData[industry];');
  h('  document.getElementById("industrySelect").style.borderColor="";');
  h('  var badge=document.getElementById("industryBadge");');
  h('  if(industry){');
  h('    var option=document.getElementById("industrySelect").selectedOptions[0];');
  h('    badge.innerHTML=\'<div class="industry-badge">\'+option.textContent.trim()+\' -- Loaded</div>\';');
  h('    badge.style.display="block";');
  h('  } else { badge.style.display="none"; }');
  h('  var btContainer=document.getElementById("businessTypeContainer");');
  h('  if(data && data.businessTypes){');
  h('    var html=\'<div class="form-group"><label>Business Type</label><div class="checkbox-group">\';');
  h('    data.businessTypes.forEach(function(bt){ html+=\'<label class="checkbox-item"><input type="radio" name="businessType" value="\'+bt.value+\'"><span>\'+bt.label+\'</span></label>\'; });');
  h('    html+=\'</div></div>\';');
  h('    btContainer.innerHTML=html;');
  h('  }');
  h('  document.getElementById("servicesTitle").textContent=(data&&data.sectionTitle)?data.sectionTitle:"Services & Pricing";');
  h('  document.getElementById("servicesSubtitle").textContent=(data&&data.sectionSubtitle)?data.sectionSubtitle:"Check services you offer";');
  h('  var svcContainer=document.getElementById("servicesContainer");');
  h('  if(data && data.services){');
  h('    var html="";');
  h('    for(var cat in data.services){');
  h('      html+=\'<p class="category-header">\'+cat+\'</p><div class="service-grid">\';');
  h('      data.services[cat].forEach(function(svc){ html+=\'<div class="service-item"><label><input type="checkbox" name="service_\'+svc.name+\'"> \'+svc.label+\'</label><input type="text" name="price_\'+svc.name+\'" placeholder="\'+svc.pricePlaceholder+\'"></div>\'; });');
  h('      html+=\'</div>\';');
  h('    }');
  h('    svcContainer.innerHTML=html;');
  h('  }');
  h('  document.getElementById("schedulingContainer").innerHTML=(data&&data.scheduling)?data.scheduling:"";');
  h('  document.getElementById("industryQTitle").textContent=(data&&data.industryQTitle)?data.industryQTitle:"Industry Details";');
  h('  document.getElementById("industryQSubtitle").textContent=(data&&data.industryQSubtitle)?data.industryQSubtitle:"Questions specific to your business";');
  h('  document.getElementById("industryQuestionsContainer").innerHTML=(data&&data.industryQuestions)?data.industryQuestions:"";');
  h('  document.getElementById("targetMarketContainer").innerHTML=(data&&data.targetMarket)?data.targetMarket:"";');
  h('  if(data&&data.faqSuggestions) document.getElementById("faqSuggestions").placeholder=data.faqSuggestions;');
  h('  bindCheckboxStyles();');
  h('}');
  h('');
  h('function bindCheckboxStyles(){');
  h('  document.querySelectorAll(".checkbox-item input, .radio-item input").forEach(function(input){');
  h('    input.addEventListener("change",function(){');
  h('      if(this.type==="radio"){');
  h('        var group=this.closest(".checkbox-group,.radio-group");');
  h('        if(group) group.querySelectorAll(".checkbox-item,.radio-item").forEach(function(i){ i.classList.remove("checked"); });');
  h('      }');
  h('      var parent=this.closest(".checkbox-item,.radio-item");');
  h('      if(parent) parent.classList.toggle("checked",this.checked);');
  h('    });');
  h('  });');
  h('}');
  h('');
  h('function updateProgress(){');
  h('  document.getElementById("progressFill").style.width=(currentSection/totalSections*100)+"%";');
  h('  document.getElementById("progressText").textContent="Step "+currentSection+" of "+totalSections;');
  h('}');
  h('');
  h('function showSection(num){');
  h('  document.querySelectorAll(".form-section").forEach(function(s){ s.classList.remove("active"); });');
  h('  var target=document.querySelector(\'[data-section="\'+num+\'"]\');');
  h('  if(target) target.classList.add("active");');
  h('  currentSection=num;');
  h('  updateProgress();');
  h('  window.scrollTo({top:0,behavior:"smooth"});');
  h('}');
  h('');
  h('function nextSection(){');
  h('  if(currentSection===1 && !document.getElementById("industrySelect").value){');
  h('    document.getElementById("industrySelect").style.borderColor="#EF4444";');
  h('    document.getElementById("industrySelect").focus();');
  h('    return;');
  h('  }');
  h('  if(currentSection===9 && !validatePhotos()) return;');
  h('  if(currentSection<totalSections) showSection(currentSection+1);');
  h('}');
  h('');
  h('function prevSection(){ if(currentSection>1) showSection(currentSection-1); }');
  h('');
  h('function updatePhotoRequirement(){}');
  h('');
  h('function validatePhotos(){');
  h('  var skip=document.getElementById("skipPhotosCheckbox") && document.getElementById("skipPhotosCheckbox").checked;');
  h('  if(skip) return true;');
  h('  var ownerPhoto=document.getElementById("ownerPhotoData").value;');
  h('  var workPhoto1=document.getElementById("workPhoto1Data").value;');
  h('  if(!ownerPhoto || !workPhoto1){');
  h('    document.getElementById("photoValidationMsg").style.display="block";');
  h('    return false;');
  h('  }');
  h('  return true;');
  h('}');
  h('');
  h('bindCheckboxStyles();');
  h('updateProgress();');
  h('');
  h('document.getElementById("intakeForm").addEventListener("submit",async function(e){');
  h('  e.preventDefault();');
  h('  var submitBtn=this.querySelector("button[type=\'submit\']");');
  h('  if(submitBtn){ submitBtn.disabled=true; submitBtn.textContent="Submitting..."; }');
  h('  var formData=new FormData(this);');
  h('  var data=Object.fromEntries(formData.entries());');
  h('  data.submittedAt=new Date().toISOString();');
  h('  data.id="client_"+Date.now();');
  h('  try{');
  h('    var response=await fetch("https://turnkeyai-backend-production.up.railway.app/api/submission-created",{');
  h('      method:"POST",');
  h('      headers:{"Content-Type":"application/json"},');
  h('      body:JSON.stringify(data)');
  h('    });');
  h('    if(!response.ok) console.error("Submission error:",await response.text());');
  h('  } catch(err){ console.error("Submission failed:",err); }');
  h('  document.getElementById("intakeForm").style.display="none";');
  h('  document.getElementById("successScreen").classList.add("active");');
  h('  window.scrollTo({top:0,behavior:"smooth"});');
  h('});');
  h('');
  h('function showCashAppInfo(){ document.getElementById("cashAppInfo").style.display="block"; }');
  h('');
  h('function handlePhotoUpload(input,fieldName){');
  h('  if(!input.files||!input.files[0]) return;');
  h('  var file=input.files[0];');
  h('  if(file.size>5*1024*1024){ alert("Photo must be under 5MB."); return; }');
  h('  var reader=new FileReader();');
  h('  reader.onload=function(e){');
  h('    var img=new Image();');
  h('    img.onload=function(){');
  h('      var canvas=document.createElement("canvas");');
  h('      var maxW=800,w=img.width,h2=img.height;');
  h('      if(w>maxW){ h2=Math.round(h2*maxW/w); w=maxW; }');
  h('      canvas.width=w; canvas.height=h2;');
  h('      canvas.getContext("2d").drawImage(img,0,0,w,h2);');
  h('      var compressed=canvas.toDataURL("image/jpeg",0.7);');
  h('      document.getElementById(fieldName+"Data").value=compressed;');
  h('      var previewDiv=document.getElementById(fieldName+"Preview");');
  h('      var previewImg=document.getElementById(fieldName+"Img");');
  h('      if(previewDiv&&previewImg){ previewImg.src=compressed; previewDiv.style.display="block"; }');
  h('      var prompt=document.getElementById(fieldName+"Prompt");');
  h('      if(prompt) prompt.innerHTML="Uploaded! Click to replace.";');
  h('      document.getElementById("photoValidationMsg").style.display="none";');
  h('    };');
  h('    img.src=e.target.result;');
  h('  };');
  h('  reader.readAsDataURL(file);');
  h('}');
  h('</script>');
  h('</body>');
  h('</html>');

  return lines.join('\n');
}

app.get('/intake.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getIntakeHTML());
});
app.get('/intake', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getIntakeHTML());
});

// ── SEND EMAIL HELPER ─────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, replyTo = null }) {
  const msg = {
    to,
    from: { email: FROM_EMAIL, name: 'TurnkeyAI Services' },
    subject,
    html
  };
  if (replyTo) msg.replyTo = replyTo;
  try {
    await sgMail.send(msg);
    console.log('[TurnkeyAI] Email sent to', to);
    return true;
  } catch (e) {
    console.error('[TurnkeyAI] SendGrid error:', e.response?.body || e.message);
    return false;
  }
}

async function notifyAdmin(subject, html) {
  return sendEmail({ to: ADMIN_EMAIL, subject, html });
}

// ── SUBMISSION CREATED ────────────────────────────────────────────────────
app.post('/api/submission-created', async (req, res) => {
  try {
    let data = {};
    let formName = '';
    const body = req.body;
    if (body && body.payload) {
      data = body.payload.data || body.payload || {};
      formName = body.payload.form_name || data['form-name'] || 'client-intake';
    } else {
      data = body || {};
      formName = data['form-name'] || data.form_name || 'client-intake';
    }

    console.log('[TurnkeyAI] Submission received, form:', formName);
    console.log('[TurnkeyAI] Email field:', data.email || data.Email || 'NOT FOUND');

    if (formName === 'territory-partner') {
      const name = ((data.firstName || '') + ' ' + (data.lastName || '')).trim();
      await notifyAdmin(`New Territory Partner Application: ${name}`, `
        <div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:24px;color:white;border-radius:12px 12px 0 0;"><h2 style="margin:0;">New Territory Partner Application</h2></div>
          <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${data.email || ''}</p>
            <p><strong>Phone:</strong> ${data.phone || ''}</p><p><strong>Market:</strong> ${data.market || data.territory || ''}</p>
            <p><strong>ZIP Codes:</strong> ${data.zipCodes || ''}</p><p><strong>Industries:</strong> ${data.selectedIndustries || data.industry || ''}</p>
            <p><strong>Tier:</strong> ${data.selectedTier || ''}</p>
          </div>
        </div>`);
      return res.json({ handled: true, type: 'territory-partner' });
    }

    if (formName !== 'client-intake') {
      return res.json({ skipped: true, formName });
    }

    function ue(s) { return s ? s.replace(/\\'/g, "'").replace(/\\"/g, '"') : s; }
    const businessName = ue(data.businessName || data['Business Name'] || data.business_name || 'New Business');
    const ownerName = ue(data.ownerName || data['Owner Name'] || data.owner_name || 'Client');
    const email = data.email || data.Email || '';
    const phone = data.phone || data.Phone || '';
    const area = data.serviceArea || data.service_area || data.city || '';

    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const dh = [];
    days.forEach(d => {
      const v = data['hours_' + d] || data[d + '_hours'];
      if (v && v.toLowerCase() !== 'closed') dh.push(d.slice(0,1).toUpperCase()+d.slice(1,2)+': '+v);
    });

    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,30);
    const siteName = data.siteName || (slug + '-' + Date.now().toString(36));
    const previewName = 'preview-' + siteName;
    const reviewUrl = `${SITE_BASE_URL}/client-review.html?site=${previewName}&biz=${encodeURIComponent(businessName)}&email=${encodeURIComponent(email)}&final=${encodeURIComponent(siteName)}`;

    console.log('[TurnkeyAI] Business:', businessName, '| Email:', email);

    await notifyAdmin(`NEW SUBMISSION: ${businessName}`, `
      <div style="font-family:Arial,sans-serif;max-width:600px;">
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px;color:white;border-radius:12px 12px 0 0;"><h2 style="margin:0;">New Client Submission</h2></div>
        <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <p><strong>Business:</strong> ${businessName}</p><p><strong>Owner:</strong> ${ownerName}</p>
          <p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Area:</strong> ${area}</p>
          <p><strong>Review URL:</strong> <a href="${reviewUrl}">${reviewUrl}</a></p>
          <p><a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Open Admin Dashboard</a></p>
        </div>
      </div>`);

    if (email) {
      await sendEmail({
        to: email,
        subject: `Your Website is Ready to Review -- ${businessName}`,
        html: `
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:40px 24px;text-align:center;border-radius:12px 12px 0 0;">
            <h1 style="color:white;margin:0;">Your Website is Ready!</h1>
          </div>
          <div style="padding:32px;background:white;border:1px solid #e2e8f0;">
            <p>Hi ${ownerName}, your AI-powered website for <strong>${businessName}</strong> is ready to review.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="https://${previewName}.pages.dev" style="display:inline-block;padding:16px 40px;background:#0066FF;color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:18px;">Preview Your Website</a>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${reviewUrl}" style="display:inline-block;padding:14px 36px;background:#10B981;color:white;border-radius:10px;text-decoration:none;font-weight:700;margin-right:8px;">Approve &amp; Go Live</a>
              <a href="${reviewUrl}&action=changes" style="display:inline-block;padding:14px 36px;background:#f59e0b;color:white;border-radius:10px;text-decoration:none;font-weight:700;">Request Changes</a>
            </div>
            <p style="color:#92400E;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:16px;font-size:14px;">If we don't hear from you within 72 hours, we'll go ahead and make your site live.</p>
          </div>
          <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#6B7280;border-radius:0 0 12px 12px;">
            TurnkeyAI Services | (603) 922-2004 | airesources89@gmail.com
          </div>
        </div>`
      });
      console.log('[TurnkeyAI] Client email sent to', email);
    } else {
      console.warn('[TurnkeyAI] No email address -- cannot send client email');
    }

    return res.json({ success: true, businessName, email, reviewUrl });

  } catch (e) {
    console.error('[TurnkeyAI] Submission error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── CLIENT REVIEW ACTION ──────────────────────────────────────────────────
app.post('/api/client-review-action', async (req, res) => {
  try {
    const { action, previewSite, finalSite, email, businessName, ownerName, changeType, currentInfo, correctedInfo, additionalNotes } = req.body;

    if (action === 'approve') {
      await notifyAdmin(`CLIENT APPROVED: ${businessName}`, `
        <p><strong>Business:</strong> ${businessName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Preview:</strong> <a href="https://${previewSite}.pages.dev">https://${previewSite}.pages.dev</a></p>
        <p><strong>Action needed:</strong> Deploy the live site manually from Cloudflare Pages.</p>`);
      return res.json({ success: true, action: 'approve' });

    } else if (action === 'changes') {
      await notifyAdmin(`Change Request: ${businessName}`, `
        <p><strong>Business:</strong> ${businessName}</p><p><strong>Email:</strong> ${email}</p>
        <p><strong>Change type:</strong> ${changeType || ''}</p>
        <p><strong>Current:</strong> ${currentInfo || ''}</p>
        <p><strong>Should be:</strong> ${correctedInfo || ''}</p>
        <p><strong>Notes:</strong> ${additionalNotes || 'None'}</p>`);
      return res.json({ success: true, action: 'changes_received' });

    } else if (action === 'resend-review') {
      if (email) {
        const reviewUrl = `${SITE_BASE_URL}/client-review.html?site=${previewSite}&biz=${encodeURIComponent(businessName)}&email=${encodeURIComponent(email)}&final=${encodeURIComponent(finalSite)}`;
        await sendEmail({
          to: email,
          subject: `Updated Preview: ${businessName}`,
          html: `<p>Hi ${ownerName || 'there'}, your updated preview is ready.</p>
            <p><a href="https://${previewSite}.pages.dev" style="display:inline-block;padding:12px 24px;background:#0066FF;color:white;border-radius:8px;text-decoration:none;">Preview</a></p>
            <p><a href="${reviewUrl}" style="display:inline-block;padding:12px 24px;background:#10B981;color:white;border-radius:8px;text-decoration:none;">Approve</a></p>`
        });
      }
      return res.json({ success: true, action: 'review_resent' });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (e) {
    console.error('[TurnkeyAI] Review action error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── PARTNER ACTION ────────────────────────────────────────────────────────
app.post('/api/partner-action', async (req, res) => {
  try {
    const { action, partner } = req.body;
    let subject, html;

    if (action === 'approve') {
      subject = "Welcome to TurnkeyAI -- You're Approved!";
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px;">
        <h2>You're Approved, ${partner.name}!</h2>
        <p><strong>Territory:</strong> ${partner.territory}</p>
        <p><strong>License Level:</strong> ${partner.tier}</p>
        <p>Next steps: Pay your license fee, your site goes live in 24 hours, then start selling at $99/month per client (you keep 60%).</p>
        <p>Questions? Call (603) 922-2004</p>
      </div>`;
    } else if (action === 'decline') {
      subject = 'TurnkeyAI Territory Partner Application Update';
      html = `<p>Hi ${partner.name}, thank you for your interest. We've decided not to move forward at this time.<br><br>-- George Dickson, TurnkeyAI Services</p>`;
    } else {
      subject = 'TurnkeyAI -- Approved with Modifications';
      html = `<p>Hi ${partner.name}, your application was approved with modifications. Approved ZIPs: ${partner.approvedZips || '-'}. Contact us to confirm. (603) 922-2004</p>`;
    }

    await sendEmail({ to: partner.email, subject, html, replyTo: ADMIN_EMAIL });
    await notifyAdmin(`Partner ${action}: ${partner.name}`, `<p>${partner.name} -- ${action} | Territory: ${partner.territory}</p>`);
    return res.json({ sent: true });

  } catch (e) {
    console.error('[TurnkeyAI] Partner action error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── START SERVER ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[TurnkeyAI] Backend running on port ${PORT}`);
});
