const http = require('http');
const config = require('../config/config');
const { initDatabase, closeDatabase } = require('./database/init');
const { createApp } = require('./app/createApp');
const logger = require('./lib/logger');

async function startServer() {
  const db = initDatabase();
  const app = createApp(db);
  const server = http.createServer(app);

  server.listen(config.port, () => {
    logger.info('dashboard_started', { port: config.port, env: config.env });
  });

  const graceful = () => {
    logger.info('dashboard_stopping');
    server.close(() => {
      closeDatabase();
      logger.info('dashboard_stopped');
      process.exit(0);
    });
  };

  process.on('SIGINT', graceful);
  process.on('SIGTERM', graceful);

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('dashboard_start_failed', { message: error.message });
    process.exit(1);
  });
}

module.exports = { startServer };
