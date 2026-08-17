// IMPORTANT: Sentry must be imported first, before any other code, so it
// can catch errors from everything that follows.
require('./instrument');

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const authRoutes = require('./src/auth/routes');
const storageRoutes = require('./src/routes/storage');
const recommendRoutes = require('./src/routes/recommend');
const photoRoutes = require('./src/routes/photos');
const placesRoutes = require('./src/routes/places');
const statsRoutes = require('./src/routes/stats');
const { generalLimiter } = require('./src/middleware/rate-limit');
const app = express();
app.use(helmet({ contentSecurityPolicy: false })); // CSP off by default since the frontend is a single inline-script HTML file; tighten later if desired
app.use(express.json({ limit: '10mb' })); // generous limit for photo data URLs
app.use(cookieParser());
app.use('/api', generalLimiter); // per-IP backstop across all API routes; specific routes (signup, AI) layer tighter limits on top
app.use('/api/auth', authRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/stats', statsRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));
// Serve the frontend (index.html + the compatibility client) as static files.
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Sentry's error handler must be registered after all routes/controllers,
// but before any other error-handling middleware, so it sees every error
// that reaches this point before Express's default handler swallows it.
const Sentry = require('./instrument');
Sentry.setupExpressErrorHandler(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`nate-worthy backend listening on :${PORT}`));
