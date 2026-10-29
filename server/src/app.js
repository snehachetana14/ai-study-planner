// Builds the Express application. Kept separate from index.js so tests can create an app in memory.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp({ store, config, aiClient = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  // Allow a separately hosted frontend (e.g. Vercel) to call this API.
  if (config.clientOrigin) {
    app.use((req, res, next) => {
      res.set('Access-Control-Allow-Origin', config.clientOrigin);
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') return res.status(204).end();
      return next();
    });
  }

  app.use((req, res, next) => {
    req.ctx = { store, config, aiClient };
    next();
  });

  app.use('/api', apiRoutes);
  app.use('/api', notFound);

  // Serve the built React app (client/dist) when it exists, so one server runs everything.
  if (config.clientDist && fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      return res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
