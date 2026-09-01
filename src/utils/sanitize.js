/**
 * Sanitization and Redaction Utilities
 * Prevents accidental leaking of API keys, tokens, and authorization headers.
 */

const SECRET_PATTERNS = [
  {
    regex: /gsk_[a-zA-Z0-9_\-]{16,}/g,
    replace: '[REDACTED_SECRET]'
  },
  {
    regex: /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
    replace: 'Bearer [REDACTED_TOKEN]'
  },
  {
    regex: /(["']?(?:apiKey|api_key|token|secret|authorization|password)["']?\s*[:=]\s*["']?)([^"',\s\}]+)(["']?)/gi,
    replace: '$1[REDACTED]$3'
  }
];

/**
 * Sanitize text string by masking known secret patterns
 * @param {string} text 
 * @returns {string}
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const { regex, replace } of SECRET_PATTERNS) {
    result = result.replace(regex, replace);
  }
  return result;
}

/**
 * Recursively sanitize objects by masking sensitive keys
 * @param {any} obj 
 * @returns {any}
 */
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') return sanitizeText(obj);
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  const sensitiveKeys = ['apikey', 'api_key', 'token', 'secret', 'authorization', 'password', 'cookie', 'cookies', 'x-api-key'];

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeText(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Universal redact helper
 * @param {any} val 
 * @returns {any}
 */
function redact(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') return sanitizeObject(val);
  return sanitizeText(String(val));
}

module.exports = {
  sanitizeText,
  sanitizeObject,
  redact
};
