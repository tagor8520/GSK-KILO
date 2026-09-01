const { sanitizeText } = require('./sanitize');

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const CURRENT_LEVEL = process.env.GSK_KILO_LOG_LEVEL
  ? LOG_LEVELS[process.env.GSK_KILO_LOG_LEVEL.toLowerCase()] || LOG_LEVELS.info
  : LOG_LEVELS.info;

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const safeMessage = sanitizeText(String(message));
  const safeMeta = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${safeMessage} ${safeMeta}`.trim();
}

const logger = {
  debug(msg, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.debug) {
      console.debug(formatLog('debug', msg, meta));
    }
  },
  info(msg, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.info) {
      console.info(formatLog('info', msg, meta));
    }
  },
  warn(msg, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.warn) {
      console.warn(formatLog('warn', msg, meta));
    }
  },
  error(msg, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.error) {
      console.error(formatLog('error', msg, meta));
    }
  }
};

module.exports = logger;
