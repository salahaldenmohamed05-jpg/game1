/**
 * Calendar Routes - Google & Outlook integration
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

// GET /calendar — used by frontend calendarAPI.getEvents and Flutter
router.get('/', async (req, res) => {
  res.json({
    success: true,
    message: 'Calendar integration - يحتاج Google OAuth credentials',
    data: {
      integration: {
        google: { url: `/api/v1/calendar/google/auth`, status: 'not_connected' },
        outlook: { url: `/api/v1/calendar/outlook/auth`, status: 'not_connected' },
      },
      mock_events: [
        { id: '1', title: 'اجتماع فريق العمل', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString(), source: 'google' },
        { id: '2', title: 'مراجعة المشروع', start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now() + 90000000).toISOString(), source: 'google' },
      ],
    },
  });
});

router.get('/events', async (req, res) => {
  res.json({
    success: true,
    message: 'Calendar integration - يحتاج Google OAuth credentials',
    data: {
      integration: {
        google: { url: `/api/v1/calendar/google/auth`, status: 'not_connected' },
        outlook: { url: `/api/v1/calendar/outlook/auth`, status: 'not_connected' },
      },
      mock_events: [
        { id: '1', title: 'اجتماع فريق العمل', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString(), source: 'google' },
        { id: '2', title: 'مراجعة المشروع', start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now() + 90000000).toISOString(), source: 'google' },
      ],
    },
  });
});

router.get('/google/auth', async (req, res) => {
  // In production: redirect to Google OAuth
  res.json({ success: true, message: 'يحتاج Google OAuth Client ID & Secret', setup_url: 'https://console.cloud.google.com/' });
});

router.get('/outlook/auth', async (req, res) => {
  res.json({ success: true, message: 'يحتاج Microsoft Azure App Registration', setup_url: 'https://portal.azure.com/' });
});

module.exports = router;
