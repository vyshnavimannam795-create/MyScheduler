// ============================================================
//  MyScheduler — Configuration
// ============================================================

const CONFIG = {
  SUPABASE_URL: 'https://kmspzdffiwqklnysjcto.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imttc3B6ZGZmaXdxa2xueXNqY3RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzIxNjMsImV4cCI6MjA5OTMwODE2M30.7q2uWQfxI6-_xodHfE-mqHcmGvOt1WLDkrJkSad9s68',


  OWNER_EMAIL: 'vyshnavimannam795@gmail.com',

  // Email notifications via EmailJS (Free for both Visitor & Owner emails)
  // Setup steps:
  // 1. Go to https://www.emailjs.com and create a free account
  // 2. Add an Email Service (Gmail / Outlook) to get your SERVICE_ID
  // 3. Create an Email Template with subject: {{subject}} and body: {{message}} to get your TEMPLATE_ID
  // 4. Copy your Public Key from Account settings
  EMAILJS_SERVICE_ID: 'service_rs2xmu8', // ← Paste EmailJS Service ID here
  EMAILJS_TEMPLATE_ID_VISITOR: 'template_l1vwec6', // Template for visitor emails
  EMAILJS_TEMPLATE_ID_OWNER: 'template_anwow39', // Template for owner notifications
  EMAILJS_PUBLIC_KEY: '7PtWUw7mxp1fRlLb6', // ← Paste EmailJS Public Key here

  OWNER_NAME: 'Vyshnavi Mannam',
  OWNER_INITIALS: 'VM',

  // AI (Google Gemini) — powers open-ended answers in the chatbot & voicebot
  // Setup steps:
  // 1. Go to https://aistudio.google.com/apikey and create a free API key
  // 2. Paste it below. NOTE: this key is used directly from the browser,
  //    so it will be visible in devtools — fine for a demo/college project,
  //    but for production use a Supabase Edge Function proxy instead.
  GEMINI_API_KEY: 'AQ.Ab8RN6I-TmZzdAhb2F8Uugcq1UgyZbJQ3z2zKJHTzyZDyg6PrQ', // ← Paste your Gemini API key here
  GEMINI_MODEL: 'gemini-2.0-flash',

  // Default hourly time slots (24-h format)
  DEFAULT_SLOT_TIMES: [
    { start: '09:00', end: '10:00' },
    { start: '10:00', end: '11:00' },
    { start: '11:00', end: '12:00' },
    { start: '12:00', end: '13:00' },
    { start: '13:00', end: '14:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' },
    { start: '16:00', end: '17:00' },
    { start: '17:00', end: '18:00' },
    { start: '18:00', end: '19:00' },
  ],

  BOOKING_POLICY: `
Booking Policy:
- Meetings can be requested for available time slots shown on the left.
- The owner (Vyshnavi Mannam) will review and respond within 24 hours.
- Meeting description must be at least 25 characters.
- Cancellations must be requested before the meeting starts.
- A slot becomes unavailable once an approved meeting exists for that time.
- Rescheduling requests are sent as suggestions — the owner must approve.
  `.trim(),
};
