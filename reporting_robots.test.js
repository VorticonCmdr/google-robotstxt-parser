'use strict';

import { parseRobotsTxt } from './robots.js';
import { RobotsTagName, RobotsParsingReporter } from './reporting_robots.js';

// Build a metadata object with all fields, defaulting unspecified ones to false.
function mkMeta({
  is_empty = false, has_comment = false, is_comment = false,
  has_directive = false, is_acceptable_typo = false,
  is_line_too_long = false, is_missing_colon_separator = false,
} = {}) {
  return {
    is_empty, has_comment, is_comment, has_directive,
    is_acceptable_typo, is_line_too_long, is_missing_colon_separator,
  };
}

function expectLine(results, lineNum, { tagName, isTypo, metadata }) {
  const actual = results[lineNum - 1];
  expect(actual.lineNum).toBe(lineNum);
  expect(actual.tagName).toBe(tagName);
  expect(actual.isTypo).toBe(isTypo);
  expect(actual.metadata).toEqual(metadata);
}

// ── LinesNumbersAreCountedCorrectly ──────────────────────────────────────────

test('LinesNumbersAreCountedCorrectly', () => {
  const report = new RobotsParsingReporter();

  const kSimpleFile =
    'User-Agent: foo\n' +                     // 1
    'Allow: /some/path\n' +                   // 2
    'User-Agent bar # no\n' +                 // 3
    'absolutely random line\n' +              // 4
    '#so comment, much wow\n' +               // 5
    '\n' +                                    // 6
    'unicorns: /extinct\n' +                  // 7
    'noarchive: /some\n' +                    // 8
    'Disallow: /\n' +                         // 9
    'Error #and comment\n' +                  // 10
    'useragent: baz\n' +                      // 11
    'disallaw: /some\n' +                     // 12
    'site-map: https://e/s.xml #comment\n' +  // 13
    'sitemap: https://e/t.xml\n' +            // 14
    'Noarchive: /someCapital\n';              // 15
                                              // 16 (empty line from final \n)

  parseRobotsTxt(kSimpleFile, report);
  expect(report.validDirectives()).toBe(8);
  expect(report.lastLineSeen()).toBe(16);
  const results = report.parseResults();
  expect(results).toHaveLength(report.lastLineSeen());

  // 1: User-Agent: foo
  expectLine(results, 1, {
    tagName: RobotsTagName.USER_AGENT, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
  // 2: Allow: /some/path
  expectLine(results, 2, {
    tagName: RobotsTagName.ALLOW, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
  // 3: User-Agent bar # no  (missing colon, has comment)
  expectLine(results, 3, {
    tagName: RobotsTagName.USER_AGENT, isTypo: false,
    metadata: mkMeta({ has_directive: true, has_comment: true, is_missing_colon_separator: true }),
  });
  // 4: absolutely random line  (no colon, 3 tokens — not parseable)
  expectLine(results, 4, {
    tagName: RobotsTagName.UNKNOWN, isTypo: false,
    metadata: mkMeta({ has_directive: false }),
  });
  // 5: #so comment, much wow
  expectLine(results, 5, {
    tagName: RobotsTagName.UNKNOWN, isTypo: false,
    metadata: mkMeta({ has_comment: true, is_comment: true }),
  });
  // 6: (empty line)
  expectLine(results, 6, {
    tagName: RobotsTagName.UNKNOWN, isTypo: false,
    metadata: mkMeta({ is_empty: true }),
  });
  // 7: unicorns: /extinct  (unrecognised key)
  expectLine(results, 7, {
    tagName: RobotsTagName.UNKNOWN, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
  // 8: noarchive: /some  (known-but-unsupported key → UNUSED)
  expectLine(results, 8, {
    tagName: RobotsTagName.UNUSED, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
  // 9: Disallow: /
  expectLine(results, 9, {
    tagName: RobotsTagName.DISALLOW, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
  // 10: Error #and comment  (single token before comment — not parseable)
  expectLine(results, 10, {
    tagName: RobotsTagName.UNKNOWN, isTypo: false,
    metadata: mkMeta({ has_comment: true }),
  });
  // 11: useragent: baz  (typo for user-agent)
  expectLine(results, 11, {
    tagName: RobotsTagName.USER_AGENT, isTypo: true,
    metadata: mkMeta({ has_directive: true, is_acceptable_typo: true }),
  });
  // 12: disallaw: /some  (typo for disallow)
  expectLine(results, 12, {
    tagName: RobotsTagName.DISALLOW, isTypo: true,
    metadata: mkMeta({ has_directive: true, is_acceptable_typo: true }),
  });
  // 13: site-map: https://e/s.xml #comment  (typo for sitemap, has comment)
  expectLine(results, 13, {
    tagName: RobotsTagName.SITEMAP, isTypo: true,
    metadata: mkMeta({ has_directive: true, has_comment: true, is_acceptable_typo: true }),
  });
  // 14: sitemap: https://e/t.xml
  expectLine(results, 14, {
    tagName: RobotsTagName.SITEMAP, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
  // 15: Noarchive: /someCapital  (known-but-unsupported, case-insensitive → UNUSED)
  expectLine(results, 15, {
    tagName: RobotsTagName.UNUSED, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
  // 16: (empty line flushed at end of file)
  expectLine(results, 16, {
    tagName: RobotsTagName.UNKNOWN, isTypo: false,
    metadata: mkMeta({ is_empty: true }),
  });

  // DOS line endings: 6 content lines + 1 final empty flush = 7 lines seen
  const kDosFile =
    'User-Agent: foo\r\n' +
    'Allow: /some/path\r\n' +
    'User-Agent: bar\r\n' +
    '\r\n' +
    '\r\n' +
    'Disallow: /\r\n';
  parseRobotsTxt(kDosFile, report);
  expect(report.validDirectives()).toBe(4);
  expect(report.lastLineSeen()).toBe(7);

  // Mac (CR-only) line endings: same counts
  const kMacFile =
    'User-Agent: foo\r' +
    'Allow: /some/path\r' +
    'User-Agent: bar\r' +
    '\r' +
    '\r' +
    'Disallow: /\r';
  parseRobotsTxt(kMacFile, report);
  expect(report.validDirectives()).toBe(4);
  expect(report.lastLineSeen()).toBe(7);
});

// ── LinesTooLongReportedCorrectly ─────────────────────────────────────────────

test('LinesTooLongReportedCorrectly', () => {
  const report = new RobotsParsingReporter();
  const kMaxLineLen = 2084 * 8; // deliberately exceeds the parser's 2083*8 limit
  let longline = '/x/';
  while (longline.length < kMaxLineLen) longline += 'a';

  const robotstxt =
    'user-agent: foo\n' +
    'disallow: ' + longline + '\n' +
    'allow: /\n';

  parseRobotsTxt(robotstxt, report);
  expect(report.validDirectives()).toBe(3);
  expect(report.lastLineSeen()).toBe(4);
  const results = report.parseResults();
  expect(results).toHaveLength(report.lastLineSeen());

  // 1: user-agent: foo
  expectLine(results, 1, {
    tagName: RobotsTagName.USER_AGENT, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
  // 2: disallow: [longline]  (line too long)
  expectLine(results, 2, {
    tagName: RobotsTagName.DISALLOW, isTypo: false,
    metadata: mkMeta({ has_directive: true, is_line_too_long: true }),
  });
  // 3: allow: /
  expectLine(results, 3, {
    tagName: RobotsTagName.ALLOW, isTypo: false,
    metadata: mkMeta({ has_directive: true }),
  });
});
