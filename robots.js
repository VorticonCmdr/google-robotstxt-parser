'use strict';

// Copyright 1999 Google LLC
// Licensed under the Apache License, Version 2.0
// JavaScript port of robots.cc / robots.h

const HEX_DIGITS = '0123456789ABCDEF';
// BOM bytes as char codes so that '\xEF\xBB\xBF' (JS string) can be detected.
const UTF_BOM = [0xEF, 0xBB, 0xBF];
const MAX_LINE_LEN = 2083 * 8;
const ALLOW_FREQUENT_TYPOS = true;
const NO_MATCH_PRIORITY = -1;

// ── Utility ──────────────────────────────────────────────────────────────────

function isAsciiAlphaOrDash(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '-' || ch === '_';
}

function isHexDigit(ch) {
  return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

function indexOfAny(str, chars, start) {
  for (let i = start; i < str.length; i++) {
    if (chars.includes(str[i])) return i;
  }
  return -1;
}

// ── Pattern matching ──────────────────────────────────────────────────────────

// Returns true if path matches pattern. '$' special only at end; '*' matches any sequence.
function matches(path, pattern) {
  const pathlen = path.length;
  let pos = [0];

  for (let pi = 0; pi < pattern.length; pi++) {
    const ch = pattern[pi];
    if (ch === '$' && pi === pattern.length - 1) {
      return pos[pos.length - 1] === pathlen;
    }
    if (ch === '*') {
      // After '*', valid positions are [pos[0], pos[0]+1, ..., pathlen]
      const start = pos[0];
      const count = pathlen - start + 1;
      if (count <= 0) return false;
      pos = Array.from({ length: count }, (_, i) => start + i);
    } else {
      const newpos = [];
      for (const p of pos) {
        if (p < pathlen && path[p] === ch) newpos.push(p + 1);
      }
      pos = newpos;
      if (pos.length === 0) return false;
    }
  }
  return true;
}

// ── Path extraction ───────────────────────────────────────────────────────────

// Extracts path+params+query from URL, removing scheme, authority, and fragment.
// Result always starts with "/". Returns "/" for invalid or empty URLs.
function getPathParamsQuery(url) {
  let searchStart = 0;
  if (url.length >= 2 && url[0] === '/' && url[1] === '/') searchStart = 2;

  const earlyPath = indexOfAny(url, '/?;', searchStart);
  let protocolEnd = url.indexOf('://', searchStart);

  if (earlyPath !== -1 && (protocolEnd === -1 || earlyPath < protocolEnd)) {
    protocolEnd = -1;
  }
  protocolEnd = protocolEnd === -1 ? searchStart : protocolEnd + 3;

  const pathStart = indexOfAny(url, '/?;', protocolEnd);
  if (pathStart !== -1) {
    const hashPos = url.indexOf('#', searchStart);
    if (hashPos !== -1 && hashPos < pathStart) return '/';
    const pathEnd = hashPos === -1 ? url.length : hashPos;
    if (url[pathStart] !== '/') return '/' + url.slice(pathStart, pathEnd);
    return url.slice(pathStart, pathEnd);
  }
  return '/';
}

// ── Pattern escaping ──────────────────────────────────────────────────────────

// Converts src string to its UTF-8 byte representation.
function toUtf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
    } else if (code < 0x10000) {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    } else {
      bytes.push(
        0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F),
        0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F)
      );
      i++; // skip low surrogate
    }
  }
  return bytes;
}

// Canonicalizes allow/disallow paths:
//   /SanJoséSellers → /Sanjos%C3%A9Sellers,  %aa → %AA
function maybeEscapePattern(src) {
  let needEscape = false;
  let needCapitalize = false;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '%' && i + 2 < src.length && isHexDigit(src[i + 1]) && isHexDigit(src[i + 2])) {
      if ((src[i + 1] >= 'a' && src[i + 1] <= 'f') || (src[i + 2] >= 'a' && src[i + 2] <= 'f')) {
        needCapitalize = true;
      }
      i += 2;
    } else if (src.charCodeAt(i) & 0x80) {
      needEscape = true;
    }
  }
  if (!needEscape && !needCapitalize) return src;

  const bytes = toUtf8Bytes(src);
  let result = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b === 0x25 && i + 2 < bytes.length &&
        isHexDigit(String.fromCharCode(bytes[i + 1])) &&
        isHexDigit(String.fromCharCode(bytes[i + 2]))) {
      result += '%' + String.fromCharCode(bytes[i + 1]).toUpperCase() +
                      String.fromCharCode(bytes[i + 2]).toUpperCase();
      i += 3;
    } else if (b & 0x80) {
      result += '%' + HEX_DIGITS[(b >> 4) & 0xF] + HEX_DIGITS[b & 0xF];
      i++;
    } else {
      result += String.fromCharCode(b);
      i++;
    }
  }
  return result;
}

// ── Key recognition ───────────────────────────────────────────────────────────

const KeyType = Object.freeze({
  USER_AGENT: 0, SITEMAP: 1, ALLOW: 2, DISALLOW: 3, UNKNOWN: 128,
});

function getKeyType(key) {
  const lk = key.toLowerCase();
  if (lk.startsWith('user-agent'))
    return { type: KeyType.USER_AGENT, isTypo: false };
  if (ALLOW_FREQUENT_TYPOS && (lk.startsWith('useragent') || lk.startsWith('user agent')))
    return { type: KeyType.USER_AGENT, isTypo: true };
  if (lk.startsWith('allow'))
    return { type: KeyType.ALLOW, isTypo: false };
  if (lk.startsWith('disallow'))
    return { type: KeyType.DISALLOW, isTypo: false };
  if (ALLOW_FREQUENT_TYPOS && (
      lk.startsWith('dissallow') || lk.startsWith('dissalow') ||
      lk.startsWith('disalow')   || lk.startsWith('diasllow') ||
      lk.startsWith('disallaw')))
    return { type: KeyType.DISALLOW, isTypo: true };
  if (lk.startsWith('sitemap'))
    return { type: KeyType.SITEMAP, isTypo: false };
  if (ALLOW_FREQUENT_TYPOS && lk.startsWith('site-map'))
    return { type: KeyType.SITEMAP, isTypo: true };
  return { type: KeyType.UNKNOWN, isTypo: false };
}

function needEscapeValueForKey(keyType) {
  return keyType !== KeyType.USER_AGENT && keyType !== KeyType.SITEMAP;
}

// ── Parse handler base ────────────────────────────────────────────────────────

class RobotsParseHandler {
  handleRobotsStart() {}
  handleRobotsEnd() {}
  handleUserAgent(lineNum, value) {}
  handleAllow(lineNum, value) {}
  handleDisallow(lineNum, value) {}
  handleSitemap(lineNum, value) {}
  handleUnknownAction(lineNum, action, value) {}
  reportLineMetadata(lineNum, metadata) {}
}

// ── Line parser helpers ───────────────────────────────────────────────────────

function stripWhitespace(s) {
  return s.replace(/^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g, '');
}

function getKeyAndValueFrom(line) {
  const meta = {
    is_empty: false, has_comment: false, is_comment: false,
    has_directive: false, is_acceptable_typo: false,
    is_line_too_long: false, is_missing_colon_separator: false,
  };

  const ci = line.indexOf('#');
  if (ci !== -1) { meta.has_comment = true; line = line.slice(0, ci); }
  line = stripWhitespace(line);

  if (line.length === 0) {
    if (meta.has_comment) meta.is_comment = true; else meta.is_empty = true;
    return { key: null, value: null, meta };
  }

  let sepIdx = line.indexOf(':');
  if (sepIdx === -1) {
    // Google-specific: accept single-whitespace separator if exactly two tokens
    const m = line.match(/^(\S+)([ \t]+)(\S+)$/);
    if (m) {
      const key = stripWhitespace(m[1]);
      if (key.length > 0) {
        meta.is_missing_colon_separator = true;
        meta.has_directive = true;
        return { key, value: stripWhitespace(m[3]), meta };
      }
    }
    return { key: null, value: null, meta };
  }

  const key = stripWhitespace(line.slice(0, sepIdx));
  if (key.length === 0) return { key: null, value: null, meta };
  meta.has_directive = true;
  return { key, value: stripWhitespace(line.slice(sepIdx + 1)), meta };
}

function emitKeyValue(lineNum, keyType, key, value, handler) {
  switch (keyType) {
    case KeyType.USER_AGENT: handler.handleUserAgent(lineNum, value); break;
    case KeyType.ALLOW:      handler.handleAllow(lineNum, value); break;
    case KeyType.DISALLOW:   handler.handleDisallow(lineNum, value); break;
    case KeyType.SITEMAP:    handler.handleSitemap(lineNum, value); break;
    case KeyType.UNKNOWN:    handler.handleUnknownAction(lineNum, key, value); break;
  }
}

function parseAndEmitLine(lineNum, line, lineTooLong, handler) {
  const { key, value, meta } = getKeyAndValueFrom(line);
  meta.is_line_too_long = lineTooLong;
  if (!meta.has_directive) {
    handler.reportLineMetadata(lineNum, meta);
    return;
  }
  const { type: keyType, isTypo } = getKeyType(key);
  meta.is_acceptable_typo = isTypo;
  const emitValue = needEscapeValueForKey(keyType) ? maybeEscapePattern(value) : value;
  emitKeyValue(lineNum, keyType, key, emitValue, handler);
  handler.reportLineMetadata(lineNum, meta);
}

// ── Parser ────────────────────────────────────────────────────────────────────

// Parses robots.txt body and calls handler callbacks for each directive.
// Processes the input as a JavaScript string character-by-character so that
// the UTF-8 BOM byte sequence (represented as '\xEF\xBB\xBF' in JS strings)
// is correctly detected using charCodeAt.
function parseRobotsTxt(robotsBody, handler) {
  let lineChars = [];
  let lineNum = 0;
  let bomPos = 0;
  let lastWasCarriageReturn = false;
  let lineTooLong = false;

  handler.handleRobotsStart();

  function flushLine(skip) {
    if (!skip) {
      parseAndEmitLine(++lineNum, lineChars.join(''), lineTooLong, handler);
      lineTooLong = false;
    }
    lineChars = [];
  }

  for (let i = 0; i < robotsBody.length; i++) {
    const ch = robotsBody.charCodeAt(i);

    // Skip UTF-8 BOM prefix at the very start of the file
    if (bomPos < UTF_BOM.length) {
      if (ch === UTF_BOM[bomPos]) {
        bomPos++;
        continue;
      }
      bomPos = UTF_BOM.length; // stop BOM checking after first mismatch
    }

    if (ch !== 0x0A && ch !== 0x0D) {
      if (lineChars.length < MAX_LINE_LEN - 1) {
        lineChars.push(robotsBody[i]);
      } else {
        lineTooLong = true;
      }
    } else {
      // Skip the LF of a CRLF sequence (don't emit an extra empty line)
      const isCRLF = lineChars.length === 0 && lastWasCarriageReturn && ch === 0x0A;
      flushLine(isCRLF);
      lastWasCarriageReturn = (ch === 0x0D);
    }
  }
  // Flush final line (may lack a trailing newline)
  flushLine(false);
  handler.handleRobotsEnd();
}

// ── Match priority tracker ────────────────────────────────────────────────────

class Match {
  constructor() { this.priority = NO_MATCH_PRIORITY; this.line = 0; }
  set(priority, line) { this.priority = priority; this.line = line; }
  clear() { this.priority = NO_MATCH_PRIORITY; this.line = 0; }
  static higher(a, b) { return a.priority > b.priority ? a : b; }
}

class MatchHierarchy {
  constructor() { this.global = new Match(); this.specific = new Match(); }
  clear() { this.global.clear(); this.specific.clear(); }
}

// ── Matcher ───────────────────────────────────────────────────────────────────

class RobotsMatcher extends RobotsParseHandler {
  constructor() {
    super();
    this._allow = new MatchHierarchy();
    this._disallow = new MatchHierarchy();
    this._seenGlobalAgent = false;
    this._seenSpecificAgent = false;
    this._everSeenSpecificAgent = false;
    this._seenSeparator = false;
    this._path = null;
    this._userAgents = null;
  }

  // Valid user-agent strings only contain [a-zA-Z_-].
  static isValidUserAgentToObey(ua) {
    if (!ua || ua.length === 0) return false;
    return /^[a-zA-Z_-]+$/.test(ua);
  }

  static extractUserAgent(ua) {
    let end = 0;
    while (end < ua.length && isAsciiAlphaOrDash(ua[end])) end++;
    return ua.slice(0, end);
  }

  allowedByRobots(robotsBody, userAgents, url) {
    const path = getPathParamsQuery(url);
    this._path = path;
    this._userAgents = userAgents;
    parseRobotsTxt(robotsBody, this);
    return !this.disallow();
  }

  oneAgentAllowedByRobots(robotsTxt, userAgent, url) {
    return this.allowedByRobots(robotsTxt, [userAgent], url);
  }

  disallow() {
    const as = this._allow.specific, ds = this._disallow.specific;
    if (as.priority > 0 || ds.priority > 0) return ds.priority > as.priority;
    if (this._everSeenSpecificAgent) return false;
    const ag = this._allow.global, dg = this._disallow.global;
    if (dg.priority > 0 || ag.priority > 0) return dg.priority > ag.priority;
    return false;
  }

  disallowIgnoreGlobal() {
    const as = this._allow.specific, ds = this._disallow.specific;
    if (as.priority > 0 || ds.priority > 0) return ds.priority > as.priority;
    return false;
  }

  everSeenSpecificAgent() { return this._everSeenSpecificAgent; }

  matchingLine() {
    if (this._everSeenSpecificAgent) {
      return Match.higher(this._disallow.specific, this._allow.specific).line;
    }
    return Match.higher(this._disallow.global, this._allow.global).line;
  }

  _seenAnyAgent() { return this._seenGlobalAgent || this._seenSpecificAgent; }

  // ── Parse handler callbacks ─────────────────────────────────────────────────

  handleRobotsStart() {
    this._allow.clear();
    this._disallow.clear();
    this._seenGlobalAgent = false;
    this._seenSpecificAgent = false;
    this._everSeenSpecificAgent = false;
    this._seenSeparator = false;
  }

  handleRobotsEnd() {}

  handleUserAgent(lineNum, userAgent) {
    if (this._seenSeparator) {
      this._seenSpecificAgent = this._seenGlobalAgent = this._seenSeparator = false;
    }
    // '*' followed by whitespace or alone is the global wildcard agent.
    if (userAgent.length >= 1 && userAgent[0] === '*' &&
        (userAgent.length === 1 || /\s/.test(userAgent[1]))) {
      this._seenGlobalAgent = true;
    } else {
      const extracted = RobotsMatcher.extractUserAgent(userAgent);
      for (const agent of this._userAgents) {
        if (extracted.toLowerCase() === agent.toLowerCase()) {
          this._everSeenSpecificAgent = this._seenSpecificAgent = true;
          break;
        }
      }
    }
  }

  handleAllow(lineNum, value) {
    if (!this._seenAnyAgent()) return;
    this._seenSeparator = true;
    const priority = matches(this._path, value) ? value.length : -1;
    if (priority >= 0) {
      if (this._seenSpecificAgent) {
        if (this._allow.specific.priority < priority)
          this._allow.specific.set(priority, lineNum);
      } else {
        if (this._allow.global.priority < priority)
          this._allow.global.set(priority, lineNum);
      }
    } else {
      // Google-specific: /index.html at end of pattern is equivalent to /<dir>/
      const slashPos = value.lastIndexOf('/');
      if (slashPos !== -1 && value.slice(slashPos).startsWith('/index.htm')) {
        this.handleAllow(lineNum, value.slice(0, slashPos + 1) + '$');
      }
    }
  }

  handleDisallow(lineNum, value) {
    if (!this._seenAnyAgent()) return;
    this._seenSeparator = true;
    const priority = matches(this._path, value) ? value.length : -1;
    if (priority >= 0) {
      if (this._seenSpecificAgent) {
        if (this._disallow.specific.priority < priority)
          this._disallow.specific.set(priority, lineNum);
      } else {
        if (this._disallow.global.priority < priority)
          this._disallow.global.set(priority, lineNum);
      }
    }
  }

  handleSitemap(lineNum, value) {}
  handleUnknownAction(lineNum, action, value) {}
}

// ── Exports ───────────────────────────────────────────────────────────────────

export {
  RobotsParseHandler,
  RobotsMatcher,
  parseRobotsTxt,
  getPathParamsQuery,
  maybeEscapePattern,
  KeyType,
};
