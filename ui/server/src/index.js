const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getDb } = require('./database/init');
const configsRouter = require('./routes/configs');
const githubRouter = require('./routes/github');
const tapsRouter = require('./routes/taps');
const mockRouter = require('./routes/mock');

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

// HTTP security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // allow loading React assets
}));

// CORS — restrict to known origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || `http://localhost:${PORT}`)
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, same-origin)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true,
}));

// Global rate limit: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Stricter limit for tap execution (expensive operations)
const tapLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tap execution requests, please try again later' },
});

// Body parsing with reduced limit
app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------------------
// API routes (with rate limiting)
// ---------------------------------------------------------------------------
app.use('/api/configs', apiLimiter, configsRouter);
app.use('/api/github', apiLimiter, githubRouter);
app.use('/api/taps/discover', tapLimiter);
app.use('/api/taps/run', tapLimiter);
app.use('/api/taps', apiLimiter, tapsRouter);

// Mock API — built-in test endpoints for tap development
if (process.env.MOCK_API_ENABLED !== 'false') {
  const mockLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Mock API rate limit exceeded' },
  });
  // Support URL-encoded body for OAuth2 token endpoint
  app.use('/api/mock/oauth2/token', express.urlencoded({ extended: false }));
  app.use('/api/mock', mockLimiter, mockRouter);
  console.log('Mock API enabled at /api/mock');
}

// Mock status endpoint (always available so UI can check)
app.get('/api/mock-status', (req, res) => {
  res.json({
    enabled: process.env.MOCK_API_ENABLED !== 'false',
    base_url: `${req.protocol}://${req.get('host')}/api/mock`,
  });
});

// Health check (no rate limit)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Serve static React build in production
// ---------------------------------------------------------------------------
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  }
});

// ---------------------------------------------------------------------------
// Global error handler — never expose internals
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Initialize database and start server
// ---------------------------------------------------------------------------
async function start() {
  try {
    await getDb();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`Tap Config Builder server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
