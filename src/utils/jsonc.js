/**
 * Lightweight JSONC (JSON with comments and trailing commas) parser
 * Standard stdlib-only implementation without external dependencies
 */

function stripComments(text) {
  let insideString = false;
  let stringChar = '';
  let isEscaped = false;
  let result = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === stringChar) {
        insideString = false;
      }
      i++;
      continue;
    }

    // Check for string start
    if (char === '"' || char === "'") {
      insideString = true;
      stringChar = char;
      result += char;
      i++;
      continue;
    }

    // Check for single-line comment
    if (char === '/' && nextChar === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
        i++;
      }
      continue;
    }

    // Check for multi-line block comment
    if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i++;
      }
      i += 2; // skip */
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

function stripTrailingCommas(text) {
  return text.replace(/,(\s*[\]}])/g, '$1');
}

function parseJsonc(text) {
  if (!text || typeof text !== 'string') return {};
  const trimmed = text.trim();
  if (!trimmed) return {};
  const clean = stripTrailingCommas(stripComments(trimmed));
  return JSON.parse(clean);
}

module.exports = {
  parseJsonc,
  stripComments,
  stripTrailingCommas
};
