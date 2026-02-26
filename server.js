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

// ── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'TurnkeyAI Backend Running', time: new Date().toISOString() });
});

// ── SERVE INTAKE FORM ────────────────────────────────────────────────────
const INTAKE_FORM_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Client Intake | TurnkeyAI Services</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --primary: #0066FF;
            --primary-dark: #0052CC;
            --accent: #00D68F;
            --dark: #1a1a2e;
            --gray-900: #1F2937;
            --gray-700: #374151;
            --gray-500: #6B7280;
            --gray-300: #D1D5DB;
            --gray-100: #F3F4F6;
            --white: #FFFFFF;
            --error: #EF4444;
            --success: #10B981;
        }
        body { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); min-height: 100vh; color: var(--gray-900); line-height: 1.6; }
        .header { background: var(--white); box-shadow: 0 2px 20px rgba(0,0,0,0.08); padding: 20px 0; position: sticky; top: 0; z-index: 100; }
        .header-content { max-width: 900px; margin: 0 auto; padding: 0 24px; display: flex; justify-content: space-between; align-items: center; }
        .logo { display: flex; align-items: baseline; gap: 4px; font-size: 28px; font-weight: 700; color: var(--dark); text-decoration: none; }
        .logo span { color: var(--accent); }
        .progress-container { display: flex; align-items: center; gap: 8px; }
        .progress-bar { width: 200px; height: 8px; background: var(--gray-100); border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius: 4px; transition: width 0.5s ease; width: 0%; }
        .progress-text { font-size: 14px; color: var(--gray-500); font-weight: 500; }
        .container { max-width: 900px; margin: 0 auto; padding: 40px 24px 80px; }
        .welcome { text-align: center; margin-bottom: 48px; }
        .welcome h1 { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: var(--dark); margin-bottom: 16px; }
        .welcome p { font-size: 18px; color: var(--gray-500); max-width: 600px; margin: 0 auto; }
        .form-section { background: var(--white); border-radius: 16px; padding: 32px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); display: none; }
        .form-section.active { display: block; animation: fadeIn 0.4s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid var(--gray-100); }
        .section-number { width: 48px; height: 48px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: var(--white); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; }
        .section-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 600; color: var(--dark); }
        .section-subtitle { font-size: 14px; color: var(--gray-500); margin-top: 4px; }
        .form-group { margin-bottom: 24px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 600px) { .form-row { grid-template-columns: 1fr; } }
        label { display: block; font-weight: 600; color: var(--gray-700); margin-bottom: 8px; font-size: 15px; }
        label .required { color: var(--error); margin-left: 2px; }
        input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], textarea, select { width: 100%; padding: 14px 16px; border: 2px solid var(--gray-300); border-radius: 10px; font-size: 16px; font-family: inherit; transition: all 0.2s ease; background: var(--white); }
        input:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 4px rgba(0, 102, 255, 0.1); }
        textarea { min-height: 120px; resize: vertical; }
        .help-text { font-size: 13px; color: var(--gray-500); margin-top: 6px; }
        .checkbox-group { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
        .checkbox-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--gray-100); border-radius: 10px; cursor: pointer; transition: all 0.2s ease; border: 2px solid transparent; }
        .checkbox-item:hover { background: #e8f0fe; }
        .checkbox-item.checked { background: #e8f4ff; border-color: var(--primary); }
        .checkbox-item input[type="checkbox"], .checkbox-item input[type="radio"] { width: 20px; height: 20px; accent-color: var(--primary); cursor: pointer; }
        .checkbox-item span { font-size: 15px; color: var(--gray-700); }
        .radio-group { display: flex; flex-direction: column; gap: 12px; }
        .radio-item { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--gray-100); border-radius: 10px; cursor: pointer; transition: all 0.2s ease; border: 2px solid transparent; }
        .radio-item:hover { background: #e8f0fe; }
        .radio-item.checked { background: #e8f4ff; border-color: var(--primary); }
        .radio-item input[type="radio"] { width: 20px; height: 20px; accent-color: var(--primary); cursor: pointer; }
        .service-grid { display: grid; gap: 12px; }
        .service-item { display: grid; grid-template-columns: 1fr 120px; gap: 12px; align-items: center; padding: 12px 16px; background: var(--gray-100); border-radius: 10px; }
        .service-item.checked { background: #e8f4ff; }
        .service-item label { display: flex; align-items: center; gap: 10px; margin: 0; cursor: pointer; }
        .service-item input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--primary); }
        .service-item input[type="text"] { padding: 10px 12px; font-size: 14px; }
        .nav-buttons { display: flex; justify-content: space-between; gap: 16px; margin-top: 32px; padding-top: 24px; border-top: 2px solid var(--gray-100); }
        .btn { padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; border: none; display: flex; align-items: center; gap: 8px; }
        .btn-secondary { background: var(--gray-100); color: var(--gray-700); }
        .btn-secondary:hover { background: var(--gray-300); }
        .btn-primary { background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: var(--white); box-shadow: 0 4px 14px rgba(0, 102, 255, 0.3); }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 102, 255, 0.4); }
        .btn-success { background: linear-gradient(135deg, var(--accent), #00b377); color: var(--white); box-shadow: 0 4px 14px rgba(0, 214, 143, 0.3); }
        .btn-success:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 214, 143, 0.4); }
        .info-box { background: linear-gradient(135deg, #e0f2fe, #bae6fd); border-left: 4px solid var(--primary); padding: 16px 20px; border-radius: 0 12px 12px 0; margin-bottom: 24px; }
        .info-box p { color: #075985; font-size: 15px; }
        .success-screen { text-align: center; padding: 60px 24px; display: none; }
        .success-screen.active { display: block; }
        .success-icon { width: 100px; height: 100px; background: linear-gradient(135deg, var(--accent), #00b377); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 32px; font-size: 48px; color: white; animation: scaleIn 0.5s ease; }
        @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
        .success-screen h2 { font-family: 'Playfair Display', serif; font-size: 36px; color: var(--dark); margin-bottom: 16px; }
        .success-screen p { font-size: 18px; color: var(--gray-500); max-width: 500px; margin: 0 auto 32px; }
        .category-header { font-size: 16px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--gray-100); }
        .category-header:first-of-type { margin-top: 0; }
        .industry-select-wrapper select { font-size: 18px; padding: 18px 20px; font-weight: 600; background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border: 2px solid var(--primary); color: var(--dark); cursor: pointer; }
        .industry-badge { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <a href="/" class="logo">TurnkeyAI<span>Services</span></a>
            <div class="progress-container">
                <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
                <span class="progress-text" id="progressText">Step 1 of 10</span>
            </div>
        </div>
    </header>

    <div class="container">
        <div id="updateModeBanner" style="display:none;background:linear-gradient(135deg,#1e3a5f,#2563eb);border-radius:16px;padding:32px 40px;margin-bottom:40px;box-shadow:0 8px 32px rgba(37,99,235,.25);">
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
                <div style="font-size:36px;">🔄</div>
                <div>
                    <h2 style="font-family:'Playfair Display',serif;font-size:28px;font-weight:700;color:#ffffff;margin:0 0 4px;">Update Your Business Information</h2>
                    <p style="color:rgba(255,255,255,.75);font-size:15px;margin:0;">Your current information is pre-loaded below. Change anything and resubmit.</p>
                </div>
            </div>
        </div>

        <div class="welcome" id="newClientWelcome">
            <h1 id="welcomeTitle">Let's Build Your Website</h1>
            <p id="welcomeSubtitle">Select your industry below and we'll customize this questionnaire for your business. Takes about 10-15 minutes.</p>
        </div>

        <form id="intakeForm" name="client-intake">
            <input type="hidden" name="form-name" value="client-intake">
            <input type="hidden" name="operator_id" id="operatorId" value="">
            <input type="hidden" name="operator_name" id="operatorName" value="">

            <!-- SECTION 1 -->
            <div class="form-section active" data-section="1">
                <div class="section-header">
                    <div class="section-number">1</div>
                    <div><div class="section-title">Business Information</div><div class="section-subtitle">Tell us about your business</div></div>
                </div>
                <div class="form-group">
                    <label>Select Your Industry <span class="required">*</span></label>
                    <div class="industry-select-wrapper">
                        <select name="industry" id="industrySelect" required onchange="handleIndustryChange()">
                            <option value="">— Choose Your Industry —</option>
                            <optgroup label="Agriculture & Food">
                                <option value="agriculture">🌾 Agriculture / Farming</option>
                                <option value="restaurant">🍽️ Restaurant / Food Service</option>
                                <option value="catering">🍴 Catering</option>
                                <option value="food_truck">🚚 Food Truck</option>
                                <option value="bakery">🧁 Bakery</option>
                                <option value="coffee_shop">☕ Coffee Shop</option>
                            </optgroup>
                            <optgroup label="Home Services">
                                <option value="cleaning">🧹 House Cleaning</option>
                                <option value="plumbing">🔧 Plumbing</option>
                                <option value="electrical">⚡ Electrical</option>
                                <option value="hvac">❄️ HVAC / Heating & Cooling</option>
                                <option value="roofing">🏠 Roofing</option>
                                <option value="painting">🎨 Painting</option>
                                <option value="landscaping">🌿 Landscaping / Lawn Care</option>
                                <option value="pest_control">🐛 Pest Control</option>
                                <option value="handyman">🛠️ Handyman / General Repair</option>
                                <option value="flooring">🪵 Flooring / Tile</option>
                                <option value="fencing">🏗️ Fencing</option>
                                <option value="pressure_washing">💦 Pressure Washing</option>
                                <option value="pool_service">🏊 Pool Service</option>
                                <option value="moving">📦 Moving / Hauling</option>
                                <option value="junk_removal">🗑️ Junk Removal</option>
                                <option value="carpet_upholstery">🧽 Carpet & Upholstery Cleaning</option>
                                <option value="garage_doors">🚪 Garage Doors</option>
                            </optgroup>
                            <optgroup label="Automotive">
                                <option value="auto_repair">🚗 Auto Repair</option>
                                <option value="auto_detailing">✨ Auto Detailing</option>
                                <option value="towing">🚛 Towing</option>
                                <option value="auto_body">🔩 Auto Body / Collision</option>
                            </optgroup>
                            <optgroup label="Beauty & Wellness">
                                <option value="salon">💇 Hair Salon / Barbershop</option>
                                <option value="nail_salon">💅 Nail Salon</option>
                                <option value="spa_massage">💆 Spa / Massage</option>
                                <option value="fitness">💪 Fitness / Personal Training</option>
                                <option value="chiropractic">🦴 Chiropractic</option>
                                <option value="dental">🦷 Dental</option>
                            </optgroup>
                            <optgroup label="Care Services">
                                <option value="daycare">👶 Daycare / Childcare</option>
                                <option value="pet_services">🐕 Pet Services / Grooming</option>
                                <option value="veterinary">🐾 Veterinary</option>
                                <option value="senior_care">🤝 Senior Care / Home Health</option>
                            </optgroup>
                            <optgroup label="Professional Services">
                                <option value="real_estate">🏡 Real Estate</option>
                                <option value="photography">📸 Photography / Videography</option>
                                <option value="tutoring">📚 Tutoring / Education</option>
                                <option value="legal">⚖️ Legal Services</option>
                                <option value="accounting">📊 Accounting / Tax Prep</option>
                                <option value="insurance">🛡️ Insurance</option>
                                <option value="it_support">💻 IT / Tech Support</option>
                                <option value="event_planning">🎉 Event Planning</option>
                                <option value="security">🔒 Security Services</option>
                            </optgroup>
                            <optgroup label="Construction & Development">
                                <option value="construction">🏗️ General Construction</option>
                                <option value="demolition">💥 Demolition</option>
                                <option value="community_revitalization">🏘️ Community Revitalization</option>
                                <option value="trade_school">🎓 Trade School Development</option>
                            </optgroup>
                            <optgroup label="Other">
                                <option value="other">📋 Other</option>
                            </optgroup>
                        </select>
                    </div>
                </div>
                <div id="industryBadge" style="display:none;"></div>
                <div class="form-row">
                    <div class="form-group"><label>Business Name <span class="required">*</span></label><input type="text" name="businessName" required placeholder="e.g., Jazzy's House Cleaning"></div>
                    <div class="form-group"><label>Your Name <span class="required">*</span></label><input type="text" name="ownerName" required placeholder="Your full name"></div>
                </div>
                <div class="form-group"><label>Business Address <span class="required">*</span></label><input type="text" name="address" required placeholder="Street address"></div>
                <div class="form-row">
                    <div class="form-group"><label>City <span class="required">*</span></label><input type="text" name="city" required placeholder="City"></div>
                    <div class="form-group"><label>State <span class="required">*</span></label><input type="text" name="state" required placeholder="State"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>ZIP Code <span class="required">*</span></label><input type="text" name="zip" required placeholder="ZIP"></div>
                    <div class="form-group"><label>Years in Business</label><input type="number" name="yearsInBusiness" placeholder="e.g., 5"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Business Phone <span class="required">*</span></label><input type="tel" name="phone" required placeholder="(555) 123-4567"></div>
                    <div class="form-group"><label>Email Address <span class="required">*</span></label><input type="email" name="email" required placeholder="you@email.com"></div>
                </div>
                <div id="businessTypeContainer"></div>
                <div class="nav-buttons"><div></div><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 2 -->
            <div class="form-section" data-section="2">
                <div class="section-header"><div class="section-number">2</div><div><div class="section-title">Current Online Presence</div><div class="section-subtitle">Where can customers find you now?</div></div></div>
                <div class="form-group"><label>Current Website (if any)</label><input type="url" name="currentWebsite" placeholder="https://yoursite.com"></div>
                <div class="form-row">
                    <div class="form-group"><label>Facebook Page</label><input type="url" name="facebook" placeholder="https://facebook.com/yourpage"></div>
                    <div class="form-group"><label>Instagram Handle</label><input type="text" name="instagram" placeholder="@yourusername"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Google Business Profile</label><input type="url" name="googleBusiness" placeholder="Link to your Google listing"></div>
                    <div class="form-group"><label>Other Social Media</label><input type="text" name="otherSocial" placeholder="TikTok, LinkedIn, YouTube, etc."></div>
                </div>
                <div class="form-group">
                    <label>Do you have a logo file you can send us?</label>
                    <div class="checkbox-group">
                        <label class="checkbox-item"><input type="radio" name="hasLogo" value="yes"><span>Yes, I'll email it</span></label>
                        <label class="checkbox-item"><input type="radio" name="hasLogo" value="no"><span>No, I need one</span></label>
                        <label class="checkbox-item"><input type="radio" name="hasLogo" value="text_only"><span>Just use text/name</span></label>
                    </div>
                </div>
                <div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 3 -->
            <div class="form-section" data-section="3">
                <div class="section-header"><div class="section-number">3</div><div><div class="section-title" id="servicesTitle">Services & Pricing</div><div class="section-subtitle" id="servicesSubtitle">Check services you offer and add your prices</div></div></div>
                <div id="servicesContainer"><div class="info-box"><p>Please select an industry in Step 1 to see your services list.</p></div></div>
                <div class="form-group" style="margin-top:24px;"><label>Additional services not listed above:</label><textarea name="additionalServices" placeholder="List any other services or products you offer with pricing..."></textarea></div>
                <div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 4 -->
            <div class="form-section" data-section="4">
                <div class="section-header"><div class="section-number">4</div><div><div class="section-title">Hours & Availability</div><div class="section-subtitle">When are you available?</div></div></div>
                <div class="form-group">
                    <label>Business Hours</label>
                    <div class="service-grid">
                        <div class="service-item"><label><input type="checkbox" name="day_monday"> Monday</label><input type="text" name="hours_monday" placeholder="8am - 5pm"></div>
                        <div class="service-item"><label><input type="checkbox" name="day_tuesday"> Tuesday</label><input type="text" name="hours_tuesday" placeholder="8am - 5pm"></div>
                        <div class="service-item"><label><input type="checkbox" name="day_wednesday"> Wednesday</label><input type="text" name="hours_wednesday" placeholder="8am - 5pm"></div>
                        <div class="service-item"><label><input type="checkbox" name="day_thursday"> Thursday</label><input type="text" name="hours_thursday" placeholder="8am - 5pm"></div>
                        <div class="service-item"><label><input type="checkbox" name="day_friday"> Friday</label><input type="text" name="hours_friday" placeholder="8am - 5pm"></div>
                        <div class="service-item"><label><input type="checkbox" name="day_saturday"> Saturday</label><input type="text" name="hours_saturday" placeholder="8am - 5pm"></div>
                        <div class="service-item"><label><input type="checkbox" name="day_sunday"> Sunday</label><input type="text" name="hours_sunday" placeholder="Closed"></div>
                    </div>
                </div>
                <div id="schedulingContainer"></div>
                <div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 5 -->
            <div class="form-section" data-section="5">
                <div class="section-header"><div class="section-number">5</div><div><div class="section-title" id="industryQTitle">Industry Details</div><div class="section-subtitle" id="industryQSubtitle">Questions specific to your business</div></div></div>
                <div id="industryQuestionsContainer"><div class="info-box"><p>Please select an industry in Step 1 to see your custom questions.</p></div></div>
                <div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 6 -->
            <div class="form-section" data-section="6">
                <div class="section-header"><div class="section-number">6</div><div><div class="section-title">Target Market</div><div class="section-subtitle">Who are your ideal customers?</div></div></div>
                <div id="targetMarketContainer"></div>
                <div class="form-row">
                    <div class="form-group"><label>Primary City/Area You Serve <span class="required">*</span></label><input type="text" name="targetCity" required placeholder="e.g., Bay St. Louis, MS"></div>
                    <div class="form-group"><label>Service Radius (miles)</label><input type="text" name="targetRadius" placeholder="e.g., 25 miles"></div>
                </div>
                <div class="form-group"><label>What makes you BETTER than your competition?</label><textarea name="competitiveAdvantage" placeholder="Why should customers choose YOU?"></textarea></div>
                <div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 7 -->
            <div class="form-section" data-section="7">
                <div class="section-header"><div class="section-number">7</div><div><div class="section-title">AI Chat Assistant Setup</div><div class="section-subtitle">Your 24/7 virtual receptionist</div></div></div>
                <div class="info-box"><p>Your website will include a 24/7 AI chat assistant that answers questions, captures leads, and books appointments — even while you sleep.</p></div>
                <div class="form-group"><label>What questions do customers frequently ask you?</label><textarea name="faqQuestions" id="faqSuggestions" placeholder="e.g., How much does it cost? Do you offer free estimates?"></textarea></div>
                <div class="form-group">
                    <label>What should the AI tell customers about pricing?</label>
                    <div class="radio-group">
                        <label class="radio-item"><input type="radio" name="pricingDisplay" value="all"><span>Show all prices on website</span></label>
                        <label class="radio-item"><input type="radio" name="pricingDisplay" value="ranges"><span>General ranges only ("Starting at $XX")</span></label>
                        <label class="radio-item"><input type="radio" name="pricingDisplay" value="consult"><span>"Contact us for a free estimate"</span></label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Preferred AI Chat Personality</label>
                    <div class="checkbox-group">
                        <label class="checkbox-item"><input type="radio" name="chatPersonality" value="professional"><span>Professional & Formal</span></label>
                        <label class="checkbox-item"><input type="radio" name="chatPersonality" value="friendly"><span>Friendly & Casual</span></label>
                        <label class="checkbox-item"><input type="radio" name="chatPersonality" value="warm"><span>Warm & Supportive</span></label>
                        <label class="checkbox-item"><input type="radio" name="chatPersonality" value="confident"><span>Confident & Expert</span></label>
                    </div>
                </div>
                <div class="form-group"><label>AI Chat Name (optional)</label><input type="text" name="chatName" placeholder="e.g., Ask Sarah, Chat with Mike"></div>
                <div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 8 -->
            <div class="form-section" data-section="8">
                <div class="section-header"><div class="section-number">8</div><div><div class="section-title">About Your Business</div><div class="section-subtitle">Your story builds trust and sets you apart</div></div></div>
                <div class="form-group"><label>Your Business Story <span class="required">*</span></label><textarea name="aboutUs" rows="5" placeholder="Tell us how you got started. Why did you start this business?"></textarea></div>
                <div class="form-group"><label>Owner / Founder Name(s) and Background</label><textarea name="ownerBackground" rows="3" placeholder="e.g., Founded by John and Maria Santos..."></textarea></div>
                <div class="form-group"><label>Years in Business & Key Milestones</label><input type="text" name="milestones" placeholder="e.g., In business since 2015. Expanded to second location in 2019."></div>
                <div class="form-group"><label>Community Involvement (if any)</label><input type="text" name="communityInvolvement" placeholder="e.g., We sponsor Little League, donate to food bank..."></div>
                <div class="form-group"><label>Awards, Certifications, or Recognition</label><input type="text" name="awards" placeholder="e.g., BBB A+ Rating, Licensed & Insured, 4.9 stars on Google..."></div>
                <div class="form-group"><label>Your Mission Statement or Tagline</label><input type="text" name="missionStatement" placeholder="e.g., 'Fresh Gulf seafood, family recipes, Southern hospitality.'"></div>
                <div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 9 -->
            <div class="form-section" data-section="9">
                <div class="section-header"><div class="section-number">9</div><div><div class="section-title">Business Photos</div><div class="section-subtitle">Photos help your site look professional and build trust</div></div></div>
                <div class="form-group">
                    <label>Owner / Team Photo</label>
                    <div onclick="document.getElementById('ownerPhotoInput').click()" style="border:2px dashed #ccc;border-radius:12px;padding:30px;text-align:center;cursor:pointer;background:#fafafa;">
                        <div id="ownerPhotoPreview" style="display:none;margin-bottom:10px;"><img id="ownerPhotoImg" style="max-width:200px;max-height:200px;border-radius:8px;"></div>
                        <div id="ownerPhotoPrompt">📸 Click to upload owner/team photo<br><span style="font-size:12px;color:#999;">JPG, PNG — max 5MB</span></div>
                    </div>
                    <input type="file" id="ownerPhotoInput" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this,'ownerPhoto')">
                    <input type="hidden" name="ownerPhoto" id="ownerPhotoData" value="">
                </div>
                <div class="form-group">
                    <label>Work / Service Photos</label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div onclick="document.getElementById('workPhoto1Input').click()" style="border:2px dashed #ccc;border-radius:12px;padding:20px;text-align:center;cursor:pointer;background:#fafafa;">
                            <div id="workPhoto1Preview" style="display:none;margin-bottom:8px;"><img id="workPhoto1Img" style="max-width:150px;max-height:150px;border-radius:8px;"></div>
                            <div id="workPhoto1Prompt">📷 Work photo 1</div>
                        </div>
                        <div onclick="document.getElementById('workPhoto2Input').click()" style="border:2px dashed #ccc;border-radius:12px;padding:20px;text-align:center;cursor:pointer;background:#fafafa;">
                            <div id="workPhoto2Preview" style="display:none;margin-bottom:8px;"><img id="workPhoto2Img" style="max-width:150px;max-height:150px;border-radius:8px;"></div>
                            <div id="workPhoto2Prompt">📷 Work photo 2</div>
                        </div>
                    </div>
                    <input type="file" id="workPhoto1Input" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this,'workPhoto1')">
                    <input type="file" id="workPhoto2Input" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this,'workPhoto2')">
                    <input type="hidden" name="workPhoto1" id="workPhoto1Data" value="">
                    <input type="hidden" name="workPhoto2" id="workPhoto2Data" value="">
                </div>
                <div class="form-group" style="margin-top:16px;padding:16px;background:#fff3cd;border:1px solid #ffc107;border-radius:10px;">
                    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin:0;">
                        <input type="checkbox" id="skipPhotosCheckbox" name="skipPhotos" value="yes" onchange="updatePhotoRequirement()" style="width:18px;height:18px;margin-top:2px;">
                        <span style="font-size:13px;"><strong>Skip photos for now</strong> — I can email photos later to <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="4829213a2d3b273d3a2b2d3b7071082f25292124662b2725">[email&#160;protected]</a></span>
                    </label>
                </div>
                <div id="photoValidationMsg" style="display:none;color:#dc2626;font-size:13px;font-weight:600;margin-top:10px;padding:10px;background:#fef2f2;border-radius:8px;">⚠️ Please upload at least an owner photo and one work photo, or check the box above to skip.</div>
                <div class="nav-buttons"><button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button><button type="button" class="btn btn-primary" onclick="nextSection()">Continue <span>→</span></button></div>
            </div>

            <!-- SECTION 10 -->
            <div class="form-section" data-section="10">
                <div class="section-header"><div class="section-number">10</div><div><div class="section-title">Final Details</div><div class="section-subtitle">Almost done!</div></div></div>
                <div class="form-group">
                    <label>Payment Methods You Accept</label>
                    <div class="checkbox-group">
                        <label class="checkbox-item"><input type="checkbox" name="pay_cash" value="cash"><span>Cash</span></label>
                        <label class="checkbox-item"><input type="checkbox" name="pay_card" value="card"><span>Credit/Debit Cards</span></label>
                        <label class="checkbox-item"><input type="checkbox" name="pay_check" value="check"><span>Check</span></label>
                        <label class="checkbox-item"><input type="checkbox" name="pay_venmo" value="venmo"><span>Venmo</span></label>
                        <label class="checkbox-item"><input type="checkbox" name="pay_cashapp" value="cashapp"><span>CashApp</span></label>
                        <label class="checkbox-item"><input type="checkbox" name="pay_zelle" value="zelle"><span>Zelle</span></label>
                    </div>
                </div>
                <div class="form-group"><label>Anything else we should know?</label><textarea name="additionalNotes" placeholder="Any special features you want, things you DON'T want, or other notes..."></textarea></div>
                <div class="form-group"><label>How did you hear about TurnkeyAI Services?</label><input type="text" name="referralSource" placeholder="e.g., Google, referral from friend, social media"></div>
                <div class="nav-buttons">
                    <button type="button" class="btn btn-secondary" onclick="prevSection()"><span>←</span> Back</button>
                    <button type="submit" class="btn btn-success">🚀 Submit & Build My Website</button>
                </div>
            </div>
        </form>

        <!-- Success Screen -->
        <div class="success-screen" id="successScreen">
            <div class="success-icon">✓</div>
            <h2>You're All Set!</h2>
            <p>We've received your information and will start building your website right away!</p>
            <div style="background:linear-gradient(135deg,#0066FF,#0052CC);color:white;padding:28px;border-radius:16px;max-width:500px;margin:24px auto;text-align:center;">
                <p style="font-size:18px;font-weight:700;margin-bottom:8px;">Activate & Pay Now</p>
                <p style="opacity:.9;margin-bottom:20px;font-size:14px;">$0 setup • $99/month • Cancel anytime</p>
                <div style="display:flex;flex-direction:column;gap:12px;align-items:center;">
                    <a href="https://buy.stripe.com/dRm3cx0PY13J6Wu4DrfnO05" target="_blank" style="display:inline-block;background:#00D68F;color:white;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;width:280px;">💳 Pay with Credit Card</a>
                    <a href="https://www.paypal.com/paypalme/airesources89" target="_blank" style="display:inline-block;background:#FFC439;color:#003087;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;width:280px;">🅿️ Pay with PayPal</a>
                    <a href="#" onclick="showCashAppInfo();return false;" style="display:inline-block;background:#00D632;color:white;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;width:280px;">💲 Pay with CashApp</a>
                </div>
                <div id="cashAppInfo" style="display:none;background:rgba(255,255,255,.15);padding:14px;border-radius:8px;margin-top:12px;">
                    <p style="font-size:14px;font-weight:600;">Send $99 to <span style="font-size:16px;">$AIResources89</span></p>
                    <p style="font-size:12px;opacity:.8;margin-top:4px;">Include your business name in the note</p>
                </div>
            </div>
            <div style="background:var(--gray-100);padding:24px;border-radius:12px;text-align:left;max-width:500px;margin:16px auto 0;">
                <p style="font-weight:600;margin-bottom:12px;">What happens next:</p>
                <ul style="padding-left:20px;color:var(--gray-500);line-height:2;">
                    <li>We build your AI-powered website (typically within 24 hours)</li>
                    <li>You'll receive a preview link by email to review and approve</li>
                    <li>Once approved, your site goes live with AI chat, booking, and lead capture</li>
                    <li>Send your logo and photos to <strong>airesources89@gmail.com</strong></li>
                </ul>
            </div>
            <p style="margin-top:24px;font-size:14px;color:var(--gray-500);">Questions? Call us at (603) 922-2004</p>
        </div>
    </div>

    <script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script><script>
        // ── OPERATOR DETECTION ──
        (function(){
            var p=new URLSearchParams(window.location.search);
            var opId=p.get("operator")||p.get("op")||"";
            var opName=p.get("operator_name")||p.get("opname")||"";
            if(opId){
                document.getElementById("operatorId").value=opId;
                document.getElementById("operatorName").value=opName;
            }
        })();

        let currentSection = 1;
        const totalSections = 10;

        const industryData = {
            cleaning: {
                businessTypes:[{value:'solo',label:'Solo Cleaner'},{value:'small_team',label:'Small Team (2-5)'},{value:'company',label:'Cleaning Company (6+)'},{value:'residential_only',label:'Residential Only'},{value:'commercial_only',label:'Commercial Only'},{value:'both',label:'Both'}],
                services:{'Residential Cleaning':[{name:'general_clean',label:'General / Standard Cleaning',pricePlaceholder:'$/visit'},{name:'deep_clean',label:'Deep Cleaning',pricePlaceholder:'$/visit'},{name:'move_inout',label:'Move In / Move Out Cleaning',pricePlaceholder:'$/visit'},{name:'recurring_weekly',label:'Weekly Recurring',pricePlaceholder:'$/visit'},{name:'recurring_biweekly',label:'Bi-Weekly',pricePlaceholder:'$/visit'},{name:'recurring_monthly',label:'Monthly',pricePlaceholder:'$/visit'}],'Specialty':[{name:'carpet_clean',label:'Carpet Cleaning',pricePlaceholder:'$/room'},{name:'window_clean',label:'Window Cleaning',pricePlaceholder:'$/window'},{name:'organizing',label:'Organizing / Decluttering',pricePlaceholder:'$/hour'}],'Commercial':[{name:'office_clean',label:'Office Cleaning',pricePlaceholder:'$/visit'},{name:'airbnb',label:'Airbnb / Vacation Rental Turnover',pricePlaceholder:'$/turnover'}]},
                scheduling:'<div class="form-group"><label>How do you handle booking?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="bookingMethod" value="phone"><span>Phone calls only</span></label><label class="checkbox-item"><input type="radio" name="bookingMethod" value="online"><span>Want online booking</span></label><label class="checkbox-item"><input type="radio" name="bookingMethod" value="any"><span>All methods</span></label></div></div><div class="form-group"><label>Do you offer same-day or emergency cleaning?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="sameDay" value="yes"><span>Yes</span></label><label class="checkbox-item"><input type="radio" name="sameDay" value="no"><span>No, scheduled only</span></label></div></div>',
                industryQuestions:'<div class="form-group"><label>How do you price your services?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="pricingModel" value="flat"><span>Flat rate per visit</span></label><label class="checkbox-item"><input type="radio" name="pricingModel" value="sqft"><span>By square footage</span></label><label class="checkbox-item"><input type="radio" name="pricingModel" value="hourly"><span>Hourly rate</span></label></div></div><div class="form-group"><label>Do you provide your own supplies?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="supplies" value="all"><span>Yes, everything included</span></label><label class="checkbox-item"><input type="radio" name="supplies" value="client"><span>Client provides all</span></label></div></div><div class="form-group"><label>Are you insured and bonded?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="insured" value="both"><span>Yes, insured & bonded</span></label><label class="checkbox-item"><input type="radio" name="insured" value="no"><span>Not yet</span></label></div></div><div class="form-group"><label>What sets your cleaning apart?</label><textarea name="cleaningSpecialty" placeholder="e.g., hospital-grade disinfectants, always clean baseboards..."></textarea></div>',
                targetMarket:'<div class="form-group"><label>Who are your ideal customers?</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="cust_homeowners" value="homeowners"><span>Homeowners</span></label><label class="checkbox-item"><input type="checkbox" name="cust_renters" value="renters"><span>Renters</span></label><label class="checkbox-item"><input type="checkbox" name="cust_busy_pros" value="busy_pros"><span>Busy Professionals</span></label><label class="checkbox-item"><input type="checkbox" name="cust_seniors" value="seniors"><span>Seniors</span></label><label class="checkbox-item"><input type="checkbox" name="cust_airbnb" value="airbnb"><span>Airbnb Hosts</span></label></div></div>',
                faqSuggestions:'e.g., How much does a cleaning cost? Do you bring your own supplies? Are you insured? Do you do deep cleans? What areas do you serve?',
                sectionTitle:'Services & Pricing',sectionSubtitle:'Check services you offer and add your prices',industryQTitle:'Cleaning Business Details',industryQSubtitle:'Help us understand how you operate'
            },
            agriculture: {
                businessTypes:[{value:'specialty_crop',label:'Specialty Crops (herbs, microgreens, mushrooms)'},{value:'aquaponics',label:'Aquaponics / Aquaculture'},{value:'market_garden',label:'Market Garden / Urban Farm'},{value:'mixed',label:'Mixed / Regenerative / Integrated'},{value:'csa',label:'CSA / Subscription Box Farm'}],
                services:{'Products':[{name:'fresh_produce',label:'Fresh Produce / Vegetables',pricePlaceholder:'$/lb'},{name:'microgreens',label:'Microgreens',pricePlaceholder:'$/tray'},{name:'herbs',label:'Fresh & Dried Herbs',pricePlaceholder:'$/bunch'},{name:'mushrooms',label:'Specialty Mushrooms',pricePlaceholder:'$/lb'},{name:'fish',label:'Farm-Raised Fish / Catfish',pricePlaceholder:'$/lb'},{name:'eggs',label:'Farm Eggs',pricePlaceholder:'$/dozen'}],'Services':[{name:'csa_box',label:'CSA / Weekly Subscription Box',pricePlaceholder:'$/week'},{name:'farm_tours',label:'Farm Tours',pricePlaceholder:'$/person'},{name:'workshops',label:'Workshops & Classes',pricePlaceholder:'$/class'},{name:'delivery',label:'Home Delivery',pricePlaceholder:'$/delivery'}]},
                scheduling:'<div class="form-group"><label>Seasonal Availability</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="season_spring" value="spring"><span>Spring</span></label><label class="checkbox-item"><input type="checkbox" name="season_summer" value="summer"><span>Summer</span></label><label class="checkbox-item"><input type="checkbox" name="season_fall" value="fall"><span>Fall</span></label><label class="checkbox-item"><input type="checkbox" name="season_yearround" value="yearround"><span>Year-Round</span></label></div></div><div class="form-group"><label>Do you attend farmers markets?</label><input type="text" name="farmersMarkets" placeholder="Which markets, what days?"></div>',
                industryQuestions:'<div class="form-group"><label>Farm / Property Size</label><input type="text" name="farmSize" placeholder="e.g., 2.5 acres"></div><div class="form-group"><label>Growing Methods</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="method_organic" value="organic"><span>Organic</span></label><label class="checkbox-item"><input type="checkbox" name="method_regenerative" value="regenerative"><span>Regenerative</span></label><label class="checkbox-item"><input type="checkbox" name="method_aquaponics" value="aquaponics"><span>Aquaponics</span></label><label class="checkbox-item"><input type="checkbox" name="method_indoor" value="indoor"><span>Indoor / Controlled Environment</span></label></div></div><div class="form-group"><label>Your farm story</label><textarea name="farmStory" placeholder="What drives you? Your mission and passion for agriculture..."></textarea></div>',
                targetMarket:'<div class="form-group"><label>Primary customers</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="cust_families" value="families"><span>Local Families</span></label><label class="checkbox-item"><input type="checkbox" name="cust_restaurants" value="restaurants"><span>Restaurants / Chefs</span></label><label class="checkbox-item"><input type="checkbox" name="cust_health" value="health"><span>Health-Conscious Consumers</span></label></div></div>',
                faqSuggestions:'e.g., Do you deliver? Are your products organic? When is harvest season? Can I visit the farm? What fish do you raise?',
                sectionTitle:'Products & Services',sectionSubtitle:'Check what you sell and add pricing',industryQTitle:'Farm & Agriculture Details',industryQSubtitle:'Tell us about your operation'
            },
            plumbing:{businessTypes:[{value:'solo_plumber',label:'Solo Plumber'},{value:'small_company',label:'Small Company (2-5)'},{value:'both_plumb',label:'Residential & Commercial'}],services:{'Emergency & Repair':[{name:'emergency_plumb',label:'24/7 Emergency Service',pricePlaceholder:'$/call'},{name:'leak_repair',label:'Leak Detection & Repair',pricePlaceholder:'Starting $'},{name:'drain_clearing',label:'Drain Clearing',pricePlaceholder:'Starting $'}],'Installation':[{name:'water_heater',label:'Water Heater Install / Repair',pricePlaceholder:'Starting $'},{name:'faucet_fixture',label:'Faucet & Fixture Install',pricePlaceholder:'$/install'},{name:'toilet_install',label:'Toilet Install / Repair',pricePlaceholder:'Starting $'}]},scheduling:'<div class="form-group"><label>Emergency Availability</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="emergencyAvail" value="24_7"><span>24/7 Emergency Service</span></label><label class="checkbox-item"><input type="radio" name="emergencyAvail" value="business"><span>Business Hours Only</span></label></div></div><div class="form-group"><label>Free estimates?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="freeEstimates" value="yes"><span>Yes, always free</span></label><label class="checkbox-item"><input type="radio" name="freeEstimates" value="diagnostic"><span>Diagnostic fee applies</span></label></div></div>',industryQuestions:'<div class="form-group"><label>Licenses & Certifications</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="lic_master" value="master"><span>Master Plumber</span></label><label class="checkbox-item"><input type="checkbox" name="lic_insured" value="insured"><span>Licensed & Insured</span></label></div></div><div class="form-group"><label>What sets you apart?</label><textarea name="plumbingAdvantage" placeholder="e.g., Same-day service, flat-rate pricing..."></textarea></div>',targetMarket:'<div class="form-group"><label>Ideal customers</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="cust_homeowners_p" value="homeowners"><span>Homeowners</span></label><label class="checkbox-item"><input type="checkbox" name="cust_landlords" value="landlords"><span>Landlords</span></label></div></div>',faqSuggestions:'e.g., Do you offer free estimates? Are you available for emergencies? How much does it cost to fix a leak?',sectionTitle:'Services & Pricing',sectionSubtitle:'Check services and add starting prices',industryQTitle:'Plumbing Business Details',industryQSubtitle:'Tell us about your credentials'},
            restaurant:{businessTypes:[{value:'full_service',label:'Full-Service Restaurant'},{value:'fast_casual',label:'Fast Casual'},{value:'seafood',label:'Seafood Restaurant'},{value:'bbq',label:'BBQ / Smokehouse'},{value:'bar_grill',label:'Bar & Grill'}],services:{'Dining':[{name:'dine_in',label:'Dine In',pricePlaceholder:'avg. $/person'},{name:'takeout',label:'Takeout',pricePlaceholder:'avg. $/order'},{name:'delivery',label:'Delivery',pricePlaceholder:'delivery fee'},{name:'catering',label:'Catering',pricePlaceholder:'$/person'}],'Meals':[{name:'breakfast',label:'Breakfast',pricePlaceholder:'avg. $/person'},{name:'lunch',label:'Lunch',pricePlaceholder:'avg. $/person'},{name:'dinner',label:'Dinner',pricePlaceholder:'avg. $/person'}]},scheduling:'<div class="form-group"><label>Do you take reservations?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="reservations" value="yes"><span>Yes</span></label><label class="checkbox-item"><input type="radio" name="reservations" value="no"><span>Walk-in only</span></label></div></div>',industryQuestions:'<div class="form-group"><label>Cuisine Type</label><input type="text" name="cuisineType" placeholder="e.g., Southern comfort, Cajun seafood..."></div><div class="form-group"><label>Signature Dishes</label><textarea name="signatureDishes" placeholder="Your must-order items..."></textarea></div><div class="form-group"><label>Dietary Options</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="diet_vegetarian" value="vegetarian"><span>Vegetarian</span></label><label class="checkbox-item"><input type="checkbox" name="diet_glutenfree" value="glutenfree"><span>Gluten-Free</span></label></div></div><div class="form-group"><label>Seating Capacity</label><input type="text" name="seatingCapacity" placeholder="e.g., 60 inside, 20 on patio"></div>',targetMarket:'<div class="form-group"><label>Primary customers</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="cust_families_r" value="families"><span>Families</span></label><label class="checkbox-item"><input type="checkbox" name="cust_tourists_r" value="tourists"><span>Tourists</span></label><label class="checkbox-item"><input type="checkbox" name="cust_locals_r" value="locals"><span>Local Regulars</span></label></div></div>',faqSuggestions:'e.g., Are you open on Sundays? Do you take reservations? Do you have gluten-free options?',sectionTitle:'Menu & Services',sectionSubtitle:'Check what you offer and add pricing',industryQTitle:'Restaurant Details',industryQSubtitle:'Tell us what makes your restaurant special'}
        };

        // Add generic fallback for all other industries
        ['hvac','electrical','roofing','painting','landscaping','pest_control','handyman','flooring','fencing','pressure_washing','pool_service','moving','junk_removal','carpet_upholstery','garage_doors','auto_repair','auto_detailing','towing','auto_body','salon','nail_salon','spa_massage','fitness','chiropractic','dental','daycare','pet_services','veterinary','senior_care','real_estate','photography','tutoring','legal','accounting','insurance','it_support','event_planning','security','construction','demolition','community_revitalization','trade_school','catering','food_truck','bakery','coffee_shop','other'].forEach(function(ind) {
            if (!industryData[ind]) {
                industryData[ind] = {
                    businessTypes: [{value:'solo',label:'Solo / Owner-Operator'},{value:'small',label:'Small Team'},{value:'company',label:'Company'}],
                    services: {'Services': [{name:'service1',label:'Primary Service',pricePlaceholder:'Starting $'},{name:'service2',label:'Secondary Service',pricePlaceholder:'Starting $'},{name:'service3',label:'Additional Service',pricePlaceholder:'Starting $'}]},
                    scheduling: '<div class="form-group"><label>How do customers book?</label><div class="checkbox-group"><label class="checkbox-item"><input type="radio" name="bookingMethod" value="phone"><span>Phone</span></label><label class="checkbox-item"><input type="radio" name="bookingMethod" value="online"><span>Online</span></label></div></div>',
                    industryQuestions: '<div class="form-group"><label>Licenses & Insurance</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" name="lic_insured_g" value="insured"><span>Licensed & Insured</span></label></div></div><div class="form-group"><label>What sets you apart?</label><textarea name="advantage" placeholder="What makes your business better than the competition?"></textarea></div>',
                    targetMarket: '<div class="form-group"><label>Ideal customers</label><textarea name="idealCustomer" placeholder="Describe your typical customer..."></textarea></div>',
                    faqSuggestions: 'e.g., How much does it cost? Are you licensed? Do you offer free estimates? What areas do you serve?',
                    sectionTitle: 'Services & Pricing', sectionSubtitle: 'Check services you offer and add prices',
                    industryQTitle: 'Business Details', industryQSubtitle: 'Tell us about your operations'
                };
            }
        });

        function handleIndustryChange() {
            var industry = document.getElementById('industrySelect').value;
            var data = industryData[industry];
            document.getElementById('industrySelect').style.borderColor = '';
            var badge = document.getElementById('industryBadge');
            if (industry) {
                var option = document.getElementById('industrySelect').selectedOptions[0];
                badge.innerHTML = '<div class="industry-badge">' + option.textContent.trim() + ' — Loaded ✓</div>';
                badge.style.display = 'block';
            } else { badge.style.display = 'none'; }
            var btContainer = document.getElementById('businessTypeContainer');
            if (data && data.businessTypes) {
                var html = '<div class="form-group"><label>Business Type</label><div class="checkbox-group">';
                data.businessTypes.forEach(function(bt) { html += '<label class="checkbox-item"><input type="radio" name="businessType" value="' + bt.value + '"><span>' + bt.label + '</span></label>'; });
                html += '</div></div>';
                btContainer.innerHTML = html;
            }
            var svcContainer = document.getElementById('servicesContainer');
            document.getElementById('servicesTitle').textContent = (data && data.sectionTitle) ? data.sectionTitle : 'Services & Pricing';
            document.getElementById('servicesSubtitle').textContent = (data && data.sectionSubtitle) ? data.sectionSubtitle : 'Check services you offer';
            if (data && data.services) {
                var html = '';
                for (var cat in data.services) {
                    html += '<p class="category-header">' + cat + '</p><div class="service-grid">';
                    data.services[cat].forEach(function(svc) { html += '<div class="service-item"><label><input type="checkbox" name="service_' + svc.name + '"> ' + svc.label + '</label><input type="text" name="price_' + svc.name + '" placeholder="' + svc.pricePlaceholder + '"></div>'; });
                    html += '</div>';
                }
                svcContainer.innerHTML = html;
            }
            document.getElementById('schedulingContainer').innerHTML = (data && data.scheduling) ? data.scheduling : '';
            document.getElementById('industryQTitle').textContent = (data && data.industryQTitle) ? data.industryQTitle : 'Industry Details';
            document.getElementById('industryQSubtitle').textContent = (data && data.industryQSubtitle) ? data.industryQSubtitle : 'Questions specific to your business';
            document.getElementById('industryQuestionsContainer').innerHTML = (data && data.industryQuestions) ? data.industryQuestions : '';
            document.getElementById('targetMarketContainer').innerHTML = (data && data.targetMarket) ? data.targetMarket : '';
            if (data && data.faqSuggestions) document.getElementById('faqSuggestions').placeholder = data.faqSuggestions;
            bindCheckboxStyles();
        }

        function bindCheckboxStyles() {
            document.querySelectorAll('.checkbox-item input, .radio-item input').forEach(function(input) {
                input.addEventListener('change', function() {
                    if (this.type === 'radio') {
                        var group = this.closest('.checkbox-group,.radio-group');
                        if (group) group.querySelectorAll('.checkbox-item,.radio-item').forEach(function(i) { i.classList.remove('checked'); });
                    }
                    var parent = this.closest('.checkbox-item,.radio-item');
                    if (parent) parent.classList.toggle('checked', this.checked);
                });
            });
        }

        function updateProgress() {
            document.getElementById('progressFill').style.width = (currentSection / totalSections * 100) + '%';
            document.getElementById('progressText').textContent = 'Step ' + currentSection + ' of ' + totalSections;
        }

        function showSection(num) {
            document.querySelectorAll('.form-section').forEach(function(s) { s.classList.remove('active'); });
            var target = document.querySelector('[data-section="' + num + '"]');
            if (target) target.classList.add('active');
            currentSection = num;
            updateProgress();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function nextSection() {
            if (currentSection === 1 && !document.getElementById('industrySelect').value) {
                document.getElementById('industrySelect').style.borderColor = '#EF4444';
                document.getElementById('industrySelect').focus();
                return;
            }
            if (currentSection === 9 && !validatePhotos()) return;
            if (currentSection < totalSections) showSection(currentSection + 1);
        }

        function prevSection() { if (currentSection > 1) showSection(currentSection - 1); }

        bindCheckboxStyles();
        updateProgress();

        // ── FORM SUBMISSION — SENDS TO RAILWAY ──
        document.getElementById('intakeForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            var submitBtn = this.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ Submitting...'; }

            var formData = new FormData(this);
            var data = Object.fromEntries(formData.entries());
            data.submittedAt = new Date().toISOString();
            data.id = 'client_' + Date.now();

            try {
                var response = await fetch('https://turnkeyai-backend-production.up.railway.app/api/submission-created', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (!response.ok) console.error('Submission error:', await response.text());
            } catch (err) {
                console.error('Submission failed:', err);
            }

            document.getElementById('intakeForm').style.display = 'none';
            document.getElementById('successScreen').classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        function showCashAppInfo() { document.getElementById('cashAppInfo').style.display = 'block'; }

        function handlePhotoUpload(input, fieldName) {
            if (!input.files || !input.files[0]) return;
            var file = input.files[0];
            if (file.size > 5 * 1024 * 1024) { alert('Photo must be under 5MB.'); return; }
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var canvas = document.createElement('canvas');
                    var maxW = 800, w = img.width, h = img.height;
                    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    var compressed = canvas.toDataURL('image/jpeg', 0.7);
                    document.getElementById(fieldName + 'Data').value = compressed;
                    var previewDiv = document.getElementById(fieldName + 'Preview');
                    var previewImg = document.getElementById(fieldName + 'Img');
                    if (previewDiv && previewImg) { previewImg.src = compressed; previewDiv.style.display = 'block'; }
                    var prompt = document.getElementById(fieldName + 'Prompt');
                    if (prompt) prompt.innerHTML = '✅ Uploaded! Click to replace.';
                    document.getElementById('photoValidationMsg').style.display = 'none';
                };
                img.src = e.target.result;
                 };
            reader.readAsDataURL(file);
        }

        function validatePhotos() {
            var skipPhotos = document.getElementById('skipPhotosCheckbox') && document.getElementById('skipPhotosCheckbox').checked;
            if (skipPhotos) return true;
            var ownerPhoto = document.getElementById('ownerPhotoData').value;
            var workPhoto1 = document.getElementById('workPhoto1Data').value;
            if (!ownerPhoto || !workPhoto1) {
                document.getElementById('photoValidationMsg').style.display = 'block';
            `;

app.get('/intake.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(INTAKE_FORM_HTML);
});

app.get('/intake', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(INTAKE_FORM_HTML);
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

// ── SUBMISSION CREATED ─────────────────────────────────────────────────────
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

    // Territory partner
    if (formName === 'territory-partner') {
      const name = ((data.firstName || '') + ' ' + (data.lastName || '')).trim();
      await notifyAdmin(`New Territory Partner Application: ${name}`, `
        <div style="font-family:Arial,sans-serif;max-width:600px;">
          <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:24px;color:white;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">New Territory Partner Application</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${data.email || ''}</p>
            <p><strong>Phone:</strong> ${data.phone || ''}</p>
            <p><strong>Market:</strong> ${data.market || data.territory || ''}</p>
            <p><strong>ZIP Codes:</strong> ${data.zipCodes || ''}</p>
            <p><strong>Industries:</strong> ${data.selectedIndustries || data.industry || ''}</p>
            <p><strong>Tier:</strong> ${data.selectedTier || ''}</p>
          </div>
        </div>`);
      return res.json({ handled: true, type: 'territory-partner' });
    }

    if (formName !== 'client-intake') {
      return res.json({ skipped: true, formName });
    }

    // Parse client intake data
    function ue(s) { return s ? s.replace(/\\'/g, "'").replace(/\\"/g, '"') : s; }
    const businessName = ue(data.businessName || data['Business Name'] || data.business_name || 'New Business');
    const ownerName = ue(data.ownerName || data['Owner Name'] || data.owner_name || 'Client');
    const email = data.email || data.Email || '';
    const phone = data.phone || data.Phone || '';
    const area = data.serviceArea || data.service_area || data.city || '';
    const location = [data.city, data.state].filter(Boolean).join(', ') || area;
    const payments = data.payments || data.paymentMethods || 'Cash, Credit Card';

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dh = [];
    days.forEach(d => {
      const v = data['hours_' + d] || data[d + '_hours'];
      if (v && v.toLowerCase() !== 'closed') dh.push(d.slice(0, 1).toUpperCase() + d.slice(1, 2) + ': ' + v);
    });
    const hours = dh.length > 0 ? dh.join(' | ') : (data.hours || 'Mon-Fri 8AM-6PM');

    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 30);
    const siteName = data.siteName || (slug + '-' + Date.now().toString(36));
    const previewName = 'preview-' + siteName;
    const reviewUrl = `${SITE_BASE_URL}/client-review.html?site=${previewName}&biz=${encodeURIComponent(businessName)}&email=${encodeURIComponent(email)}&final=${encodeURIComponent(siteName)}`;

    console.log('[TurnkeyAI] Business:', businessName, '| Email:', email);

    // ── SEND ADMIN EMAIL ──
    await notifyAdmin(`📥 NEW SUBMISSION: ${businessName}`, `
      <div style="font-family:Arial,sans-serif;max-width:600px;">
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px;color:white;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;">👀 New Client Submission</h2>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
          <p><strong>Business:</strong> ${businessName}</p>
          <p><strong>Owner:</strong> ${ownerName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Area:</strong> ${area}</p>
          <p><strong>Review URL:</strong> <a href="${reviewUrl}">${reviewUrl}</a></p>
          <p><a href="${SITE_BASE_URL}/turnkeyai-admin-v3.html" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Open Admin Dashboard →</a></p>
        </div>
      </div>`);

    // ── SEND CLIENT EMAIL ──
    if (email) {
      await sendEmail({
        to: email,
        subject: `👀 Your Website is Ready to Review — ${businessName}`,
        html: `
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0066FF,#0052CC);padding:40px 24px;text-align:center;border-radius:12px 12px 0 0;">
            <h1 style="color:white;margin:0;">Your Website is Ready! 🎉</h1>
          </div>
          <div style="padding:32px;background:white;border:1px solid #e2e8f0;">
            <p>Hi ${ownerName}, your AI-powered website for <strong>${businessName}</strong> is ready to review.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="https://${previewName}.pages.dev" style="display:inline-block;padding:16px 40px;background:#0066FF;color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:18px;">👀 Preview Your Website</a>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${reviewUrl}" style="display:inline-block;padding:14px 36px;background:#10B981;color:white;border-radius:10px;text-decoration:none;font-weight:700;margin-right:8px;">✅ Approve & Go Live</a>
              <a href="${reviewUrl}&action=changes" style="display:inline-block;padding:14px 36px;background:#f59e0b;color:white;border-radius:10px;text-decoration:none;font-weight:700;">✏️ Request Changes</a>
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
      console.warn('[TurnkeyAI] No email address in submission - cannot send client email');
    }

    return res.json({ success: true, businessName, email, reviewUrl });

  } catch (e) {
    console.error('[TurnkeyAI] Submission error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── CLIENT REVIEW ACTION ───────────────────────────────────────────────────
app.post('/api/client-review-action', async (req, res) => {
  try {
    const { action, previewSite, finalSite, email, businessName, ownerName, changeType, currentInfo, correctedInfo, additionalNotes } = req.body;

    if (action === 'approve') {
      await notifyAdmin(`✅ CLIENT APPROVED: ${businessName}`, `
        <p><strong>Business:</strong> ${businessName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Preview:</strong> <a href="https://${previewSite}.pages.dev">https://${previewSite}.pages.dev</a></p>
        <p><strong>Action needed:</strong> Deploy the live site manually from Cloudflare Pages.</p>`);
      return res.json({ success: true, action: 'approve' });

    } else if (action === 'changes') {
      await notifyAdmin(`✏️ Change Request: ${businessName}`, `
        <p><strong>Business:</strong> ${businessName}</p>
        <p><strong>Email:</strong> ${email}</p>
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
          subject: `🔄 Updated Preview: ${businessName}`,
          html: `
            <p>Hi ${ownerName || 'there'}, your updated preview is ready.</p>
            <p><a href="https://${previewSite}.pages.dev" style="display:inline-block;padding:12px 24px;background:#0066FF;color:white;border-radius:8px;text-decoration:none;">👀 Preview</a></p>
            <p><a href="${reviewUrl}" style="display:inline-block;padding:12px 24px;background:#10B981;color:white;border-radius:8px;text-decoration:none;">✅ Approve</a></p>`
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

// ── PARTNER ACTION ─────────────────────────────────────────────────────────
app.post('/api/partner-action', async (req, res) => {
  try {
    const { action, partner } = req.body;
    let subject, html;

    if (action === 'approve') {
      subject = "🎉 Welcome to TurnkeyAI — You're Approved!";
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px;">
        <h2>🎉 You're Approved, ${partner.name}!</h2>
        <p><strong>Territory:</strong> ${partner.territory}</p>
        <p><strong>License Level:</strong> ${partner.tier}</p>
        <p>Next steps: Pay your license fee, your site goes live in 24 hours, then start selling at $99/month per client (you keep 60%).</p>
        <p>Questions? Call (603) 922-2004</p>
      </div>`;
    } else if (action === 'decline') {
      subject = 'TurnkeyAI Territory Partner Application Update';
      html = `<p>Hi ${partner.name}, thank you for your interest. We've decided not to move forward at this time.<br><br>— George Dickson, TurnkeyAI Services</p>`;
    } else {
      subject = '🎉 TurnkeyAI — Approved with Modifications';
      html = `<p>Hi ${partner.name}, your application was approved with modifications. Approved ZIPs: ${partner.approvedZips || '-'}. Contact us to confirm. (603) 922-2004</p>`;
    }

    await sendEmail({ to: partner.email, subject, html, replyTo: ADMIN_EMAIL });
    await notifyAdmin(`✅ Partner ${action}: ${partner.name}`, `<p>${partner.name} — ${action} | Territory: ${partner.territory}</p>`);
    return res.json({ sent: true });

  } catch (e) {
    console.error('[TurnkeyAI] Partner action error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── START SERVER ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[TurnkeyAI] Backend running on port ${PORT}`);
});
