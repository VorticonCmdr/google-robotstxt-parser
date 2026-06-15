'use strict';

// Copyright 1999 Google LLC
// Licensed under the Apache License, Version 2.0
// JavaScript port of reporting_robots.cc / reporting_robots.h

import { RobotsParseHandler } from './robots.js';

const RobotsTagName = Object.freeze({
  UNKNOWN: 0,
  USER_AGENT: 1,
  ALLOW: 2,
  DISALLOW: 3,
  SITEMAP: 4,
  UNUSED: 5,
});

// Popular tags found in robots.txt files that Google does not use but other
// search engines may. Callers can use these to surface informational warnings.
const UNSUPPORTED_TAGS = new Set([
  'clean-param', 'content-signal', 'content-usage', 'crawl-delay',
  'domain', 'host', 'noarchive', 'nofollow',
  'noindex', 'request-rate', 'revisit-after', 'visit-time',
]);

class RobotsParsingReporter extends RobotsParseHandler {
  constructor() {
    super();
    this._results = new Map(); // lineNum → { lineNum, tagName, isTypo, metadata }
    this._lastLineSeen = 0;
    this._validDirectives = 0;
    this._unusedDirectives = 0;
  }

  _getOrCreate(lineNum) {
    if (!this._results.has(lineNum)) {
      this._results.set(lineNum, {
        lineNum,
        tagName: RobotsTagName.UNKNOWN,
        isTypo: false,
        metadata: null,
      });
    }
    return this._results.get(lineNum);
  }

  _digest(lineNum, tagName) {
    if (lineNum > this._lastLineSeen) this._lastLineSeen = lineNum;
    if (tagName !== RobotsTagName.UNKNOWN && tagName !== RobotsTagName.UNUSED) {
      this._validDirectives++;
    }
    this._getOrCreate(lineNum).tagName = tagName;
  }

  handleRobotsStart() {
    this._results.clear();
    this._lastLineSeen = 0;
    this._validDirectives = 0;
    this._unusedDirectives = 0;
  }

  handleRobotsEnd() {}

  handleUserAgent(lineNum) { this._digest(lineNum, RobotsTagName.USER_AGENT); }
  handleAllow(lineNum)     { this._digest(lineNum, RobotsTagName.ALLOW); }
  handleDisallow(lineNum)  { this._digest(lineNum, RobotsTagName.DISALLOW); }
  handleSitemap(lineNum)   { this._digest(lineNum, RobotsTagName.SITEMAP); }

  handleUnknownAction(lineNum, action) {
    const tagName = UNSUPPORTED_TAGS.has(action.toLowerCase())
      ? RobotsTagName.UNUSED
      : RobotsTagName.UNKNOWN;
    this._unusedDirectives++;
    this._digest(lineNum, tagName);
  }

  reportLineMetadata(lineNum, metadata) {
    if (lineNum > this._lastLineSeen) this._lastLineSeen = lineNum;
    const line = this._getOrCreate(lineNum);
    line.isTypo = metadata.is_acceptable_typo;
    line.metadata = { ...metadata };
  }

  lastLineSeen()     { return this._lastLineSeen; }
  validDirectives()  { return this._validDirectives; }
  unusedDirectives() { return this._unusedDirectives; }

  // Returns all parsed lines sorted by line number, one entry per line.
  parseResults() {
    return [...this._results.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v);
  }
}

export { RobotsTagName, RobotsParsingReporter };
