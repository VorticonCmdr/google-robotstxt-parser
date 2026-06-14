'use strict';

import {
  RobotsParseHandler,
  RobotsMatcher,
  parseRobotsTxt,
  getPathParamsQuery,
  maybeEscapePattern,
} from './robots.js';

// Helper matching the C++ IsUserAgentAllowed test helper
function isUserAgentAllowed(robotstxt, useragent, url) {
  const matcher = new RobotsMatcher();
  return matcher.oneAgentAllowedByRobots(robotstxt, useragent, url);
}

// ── GoogleOnly_SystemTest ─────────────────────────────────────────────────────

test('GoogleOnly_SystemTest', () => {
  const robotstxt = 'user-agent: FooBot\ndisallow: /\n';
  expect(isUserAgentAllowed('', 'FooBot', '')).toBe(true);
  expect(isUserAgentAllowed(robotstxt, '', '')).toBe(true);
  expect(isUserAgentAllowed(robotstxt, 'FooBot', '')).toBe(false);
  expect(isUserAgentAllowed('', '', '')).toBe(true);
});

// ── ID_LineSyntax_Line ────────────────────────────────────────────────────────

test('ID_LineSyntax_Line', () => {
  const correct          = 'user-agent: FooBot\ndisallow: /\n';
  const incorrect        = 'foo: FooBot\nbar: /\n';
  const incorrectAccepted = 'user-agent FooBot\ndisallow /\n';
  const url = 'http://foo.bar/x/y';
  expect(isUserAgentAllowed(correct, 'FooBot', url)).toBe(false);
  expect(isUserAgentAllowed(incorrect, 'FooBot', url)).toBe(true);
  expect(isUserAgentAllowed(incorrectAccepted, 'FooBot', url)).toBe(false);
});

// ── ID_LineSyntax_Groups ──────────────────────────────────────────────────────

test('ID_LineSyntax_Groups', () => {
  const robotstxt =
    'allow: /foo/bar/\n\n' +
    'user-agent: FooBot\ndisallow: /\nallow: /x/\n' +
    'user-agent: BarBot\ndisallow: /\nallow: /y/\n\n\n' +
    'allow: /w/\nuser-agent: BazBot\n\n' +
    'user-agent: FooBot\nallow: /z/\ndisallow: /\n';

  expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar/x/b')).toBe(true);
  expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar/z/d')).toBe(true);
  expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar/y/c')).toBe(false);
  expect(isUserAgentAllowed(robotstxt, 'BarBot', 'http://foo.bar/y/c')).toBe(true);
  expect(isUserAgentAllowed(robotstxt, 'BarBot', 'http://foo.bar/w/a')).toBe(true);
  expect(isUserAgentAllowed(robotstxt, 'BarBot', 'http://foo.bar/z/d')).toBe(false);
  expect(isUserAgentAllowed(robotstxt, 'BazBot', 'http://foo.bar/z/d')).toBe(true);
  // Rules outside groups are ignored
  expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar/foo/bar/')).toBe(false);
  expect(isUserAgentAllowed(robotstxt, 'BarBot', 'http://foo.bar/foo/bar/')).toBe(false);
  expect(isUserAgentAllowed(robotstxt, 'BazBot', 'http://foo.bar/foo/bar/')).toBe(false);
});

// ── ID_LineSyntax_Groups_OtherRules ──────────────────────────────────────────

test('ID_LineSyntax_Groups_OtherRules', () => {
  {
    const robotstxt =
      'User-agent: BarBot\nSitemap: https://foo.bar/sitemap\n' +
      'User-agent: *\nDisallow: /\n';
    const url = 'http://foo.bar/';
    expect(isUserAgentAllowed(robotstxt, 'FooBot', url)).toBe(false);
    expect(isUserAgentAllowed(robotstxt, 'BarBot', url)).toBe(false);
  }
  {
    const robotstxt =
      'User-agent: FooBot\nInvalid-Unknown-Line: unknown\n' +
      'User-agent: *\nDisallow: /\n';
    const url = 'http://foo.bar/';
    expect(isUserAgentAllowed(robotstxt, 'FooBot', url)).toBe(false);
    expect(isUserAgentAllowed(robotstxt, 'BarBot', url)).toBe(false);
  }
});

// ── ID_REPLineNamesCaseInsensitive ────────────────────────────────────────────

test('ID_REPLineNamesCaseInsensitive', () => {
  const upper = 'USER-AGENT: FooBot\nALLOW: /x/\nDISALLOW: /\n';
  const lower = 'user-agent: FooBot\nallow: /x/\ndisallow: /\n';
  const camel = 'uSeR-aGeNt: FooBot\nAlLoW: /x/\ndIsAlLoW: /\n';
  const allowed = 'http://foo.bar/x/y';
  const disallowed = 'http://foo.bar/a/b';

  for (const txt of [upper, lower, camel]) {
    expect(isUserAgentAllowed(txt, 'FooBot', allowed)).toBe(true);
    expect(isUserAgentAllowed(txt, 'FooBot', disallowed)).toBe(false);
  }
});

// ── ID_VerifyValidUserAgentsToObey ────────────────────────────────────────────

test('ID_VerifyValidUserAgentsToObey', () => {
  expect(RobotsMatcher.isValidUserAgentToObey('Foobot')).toBe(true);
  expect(RobotsMatcher.isValidUserAgentToObey('Foobot-Bar')).toBe(true);
  expect(RobotsMatcher.isValidUserAgentToObey('Foo_Bar')).toBe(true);

  expect(RobotsMatcher.isValidUserAgentToObey('')).toBe(false);
  expect(RobotsMatcher.isValidUserAgentToObey('ツ')).toBe(false);
  expect(RobotsMatcher.isValidUserAgentToObey('Foobot*')).toBe(false);
  expect(RobotsMatcher.isValidUserAgentToObey(' Foobot ')).toBe(false);
  expect(RobotsMatcher.isValidUserAgentToObey('Foobot/2.1')).toBe(false);
  expect(RobotsMatcher.isValidUserAgentToObey('Foobot Bar')).toBe(false);
});

// ── ID_UserAgentValueCaseInsensitive ──────────────────────────────────────────

test('ID_UserAgentValueCaseInsensitive', () => {
  const upper = 'User-Agent: FOO BAR\nAllow: /x/\nDisallow: /\n';
  const lower = 'User-Agent: foo bar\nAllow: /x/\nDisallow: /\n';
  const camel = 'User-Agent: FoO bAr\nAllow: /x/\nDisallow: /\n';
  const allowed = 'http://foo.bar/x/y';
  const disallowed = 'http://foo.bar/a/b';

  for (const txt of [upper, lower, camel]) {
    expect(isUserAgentAllowed(txt, 'Foo', allowed)).toBe(true);
    expect(isUserAgentAllowed(txt, 'Foo', disallowed)).toBe(false);
    expect(isUserAgentAllowed(txt, 'foo', allowed)).toBe(true);
    expect(isUserAgentAllowed(txt, 'foo', disallowed)).toBe(false);
  }
});

// ── GoogleOnly_AcceptUserAgentUpToFirstSpace ──────────────────────────────────

test('GoogleOnly_AcceptUserAgentUpToFirstSpace', () => {
  expect(RobotsMatcher.isValidUserAgentToObey('Foobot Bar')).toBe(false);
  const robotstxt =
    'User-Agent: *\nDisallow: /\n' +
    'User-Agent: Foo Bar\nAllow: /x/\nDisallow: /\n';
  const url = 'http://foo.bar/x/y';
  expect(isUserAgentAllowed(robotstxt, 'Foo', url)).toBe(true);
  expect(isUserAgentAllowed(robotstxt, 'Foo Bar', url)).toBe(false);
});

// ── ID_GlobalGroups_Secondary ─────────────────────────────────────────────────

test('ID_GlobalGroups_Secondary', () => {
  const empty = '';
  const global =
    'user-agent: *\nallow: /\nuser-agent: FooBot\ndisallow: /\n';
  const onlySpecific =
    'user-agent: FooBot\nallow: /\n' +
    'user-agent: BarBot\ndisallow: /\n' +
    'user-agent: BazBot\ndisallow: /\n';
  const url = 'http://foo.bar/x/y';

  expect(isUserAgentAllowed(empty, 'FooBot', url)).toBe(true);
  expect(isUserAgentAllowed(global, 'FooBot', url)).toBe(false);
  expect(isUserAgentAllowed(global, 'BarBot', url)).toBe(true);
  expect(isUserAgentAllowed(onlySpecific, 'QuxBot', url)).toBe(true);
});

// ── ID_AllowDisallow_Value_CaseSensitive ──────────────────────────────────────

test('ID_AllowDisallow_Value_CaseSensitive', () => {
  const lower = 'user-agent: FooBot\ndisallow: /x/\n';
  const upper = 'user-agent: FooBot\ndisallow: /X/\n';
  const url = 'http://foo.bar/x/y';
  expect(isUserAgentAllowed(lower, 'FooBot', url)).toBe(false);
  expect(isUserAgentAllowed(upper, 'FooBot', url)).toBe(true);
});

// ── ID_LongestMatch ───────────────────────────────────────────────────────────

test('ID_LongestMatch', () => {
  const url = 'http://foo.bar/x/page.html';
  {
    const r = 'user-agent: FooBot\ndisallow: /x/page.html\nallow: /x/\n';
    expect(isUserAgentAllowed(r, 'FooBot', url)).toBe(false);
  }
  {
    const r = 'user-agent: FooBot\nallow: /x/page.html\ndisallow: /x/\n';
    expect(isUserAgentAllowed(r, 'FooBot', url)).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/x/')).toBe(false);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: \nallow: \n';
    expect(isUserAgentAllowed(r, 'FooBot', url)).toBe(true);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: /\nallow: /\n';
    expect(isUserAgentAllowed(r, 'FooBot', url)).toBe(true);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: /x\nallow: /x/\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/x')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/x/')).toBe(true);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: /x/page.html\nallow: /x/page.html\n';
    expect(isUserAgentAllowed(r, 'FooBot', url)).toBe(true);
  }
  {
    const r = 'user-agent: FooBot\nallow: /page\ndisallow: /*.html\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/page.html')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/page')).toBe(true);
  }
  {
    const r = 'user-agent: FooBot\nallow: /x/page.\ndisallow: /*.html\n';
    expect(isUserAgentAllowed(r, 'FooBot', url)).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/x/y.html')).toBe(false);
  }
  {
    const r = 'User-agent: *\nDisallow: /x/\nUser-agent: FooBot\nDisallow: /y/\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/x/page')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/y/page')).toBe(false);
  }
});

// ── ID_Encoding ───────────────────────────────────────────────────────────────

test('ID_Encoding', () => {
  {
    const r =
      'User-agent: FooBot\nDisallow: /\n' +
      'Allow: /foo/bar?qux=taz&baz=http://foo.bar?tar&par\n';
    expect(isUserAgentAllowed(r, 'FooBot',
      'http://foo.bar/foo/bar?qux=taz&baz=http://foo.bar?tar&par')).toBe(true);
  }
  {
    const r = 'User-agent: FooBot\nDisallow: /\nAllow: /foo/bar/ツ\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/%E3%83%84')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/ツ')).toBe(false);
  }
  {
    const r = 'User-agent: FooBot\nDisallow: /\nAllow: /foo/bar/%E3%83%84\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/%E3%83%84')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/ツ')).toBe(false);
  }
  {
    const r = 'User-agent: FooBot\nDisallow: /\nAllow: /foo/bar/%62%61%7A\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/baz')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/%62%61%7A')).toBe(true);
  }
});

// ── ID_SpecialCharacters ──────────────────────────────────────────────────────

test('ID_SpecialCharacters', () => {
  {
    const r = 'User-agent: FooBot\nDisallow: /foo/bar/quz\nAllow: /foo/*/qux\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/quz')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/quz')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo//quz')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bax/quz')).toBe(true);
  }
  {
    const r = 'User-agent: FooBot\nDisallow: /foo/bar$\nAllow: /foo/bar/qux\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/qux')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar/baz')).toBe(true);
  }
  {
    const r =
      'User-agent: FooBot\n# Disallow: /\nDisallow: /foo/quz#qux\nAllow: /\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/bar')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/foo/quz')).toBe(false);
  }
});

// ── GoogleOnly_IndexHTMLisDirectory ──────────────────────────────────────────

test('GoogleOnly_IndexHTMLisDirectory', () => {
  const r =
    'User-Agent: *\nAllow: /allowed-slash/index.html\nDisallow: /\n';
  expect(isUserAgentAllowed(r, 'foobot', 'http://foo.com/allowed-slash/')).toBe(true);
  expect(isUserAgentAllowed(r, 'foobot', 'http://foo.com/allowed-slash/index.htm')).toBe(false);
  expect(isUserAgentAllowed(r, 'foobot', 'http://foo.com/allowed-slash/index.html')).toBe(true);
  expect(isUserAgentAllowed(r, 'foobot', 'http://foo.com/anyother-url')).toBe(false);
});

// ── GoogleOnly_LineTooLong ────────────────────────────────────────────────────

test('GoogleOnly_LineTooLong', () => {
  const kMaxLineLen = 2083 * 8;
  {
    let robotstxt = 'user-agent: FooBot\n';
    let longline = '/x/';
    const maxLength = kMaxLineLen - longline.length - 'disallow: '.length + '\n'.length;
    while (longline.length < maxLength) longline += 'a';
    robotstxt += 'disallow: ' + longline + '/qux\n';
    expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar/fux')).toBe(true);
    expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar' + longline + '/fux')).toBe(false);
  }
  {
    let robotstxt = 'user-agent: FooBot\ndisallow: /\n';
    let longlineA = '/x/';
    let longlineB = '/x/';
    const maxLength = kMaxLineLen - longlineA.length - 'allow: '.length + '\n'.length;
    while (longlineA.length < maxLength) {
      longlineA += 'a';
      longlineB += 'b';
    }
    robotstxt += 'allow: ' + longlineA + '/qux\n';
    robotstxt += 'allow: ' + longlineB + '/qux\n';
    expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar/')).toBe(false);
    expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar' + longlineA + '/qux')).toBe(true);
    expect(isUserAgentAllowed(robotstxt, 'FooBot', 'http://foo.bar' + longlineB + '/fux')).toBe(true);
  }
});

// ── GoogleOnly_DocumentationChecks ───────────────────────────────────────────

test('GoogleOnly_DocumentationChecks', () => {
  {
    const r = 'user-agent: FooBot\ndisallow: /\nallow: /fish\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/bar')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish.html')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish/salmon.html')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fishheads')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fishheads/yummy.html')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish.html?id=anything')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/Fish.asp')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/catfish')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/?id=fish')).toBe(false);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: /\nallow: /fish*\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/bar')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish.html')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish/salmon.html')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fishheads')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fishheads/yummy.html')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish.html?id=anything')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/Fish.bar')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/catfish')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/?id=fish')).toBe(false);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: /\nallow: /fish/\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/bar')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish/')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish/salmon')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish/?salmon')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish/salmon.html')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish/?id=anything')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish.html')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/Fish/Salmon.html')).toBe(false);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: /\nallow: /*.php\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/bar')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/filename.php')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/folder/filename.php')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/folder/filename.php?parameters')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar//folder/any.php.file.html')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/filename.php/')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/index?f=filename.php/')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/php/')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/index?php')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/windows.PHP')).toBe(false);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: /\nallow: /*.php$\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/bar')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/filename.php')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/folder/filename.php')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/filename.php?parameters')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/filename.php/')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/filename.php5')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/php/')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/filename?php')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/aaaphpaaa')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar//windows.PHP')).toBe(false);
  }
  {
    const r = 'user-agent: FooBot\ndisallow: /\nallow: /fish*.php\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/bar')).toBe(false);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fish.php')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/fishheads/catfish.php?parameters')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://foo.bar/Fish.PHP')).toBe(false);
  }
  // Order of precedence
  {
    const r = 'user-agent: FooBot\nallow: /p\ndisallow: /\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://example.com/page')).toBe(true);
  }
  {
    const r = 'user-agent: FooBot\nallow: /folder\ndisallow: /folder\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://example.com/folder/page')).toBe(true);
  }
  {
    const r = 'user-agent: FooBot\nallow: /page\ndisallow: /*.htm\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://example.com/page.htm')).toBe(false);
  }
  {
    const r = 'user-agent: FooBot\nallow: /$\ndisallow: /\n';
    expect(isUserAgentAllowed(r, 'FooBot', 'http://example.com/')).toBe(true);
    expect(isUserAgentAllowed(r, 'FooBot', 'http://example.com/page.html')).toBe(false);
  }
});

// ── ParseRobotsTxt handler tests ──────────────────────────────────────────────

class StatsReporter extends RobotsParseHandler {
  constructor() {
    super();
    this.lastLineSeen = 0;
    this.validDirectives = 0;
    this.unknownDirectives = 0;
    this.sitemap = '';
  }
  handleRobotsStart() {
    this.lastLineSeen = 0; this.validDirectives = 0;
    this.unknownDirectives = 0; this.sitemap = '';
  }
  handleRobotsEnd() {}
  handleUserAgent(n) { this._digest(n); }
  handleAllow(n) { this._digest(n); }
  handleDisallow(n) { this._digest(n); }
  handleSitemap(n, v) { this._digest(n); this.sitemap += v; }
  handleUnknownAction(n) { this.lastLineSeen = n; this.unknownDirectives++; }
  _digest(n) {
    expect(n).toBeGreaterThanOrEqual(this.lastLineSeen);
    this.lastLineSeen = n; this.validDirectives++;
  }
}

test('ID_LinesNumbersAreCountedCorrectly', () => {
  const report = new StatsReporter();
  const check = (txt) => {
    parseRobotsTxt(txt, report);
    expect(report.validDirectives).toBe(4);
    expect(report.lastLineSeen).toBe(6);
  };
  check('User-Agent: foo\nAllow: /some/path\nUser-Agent: bar\n\n\nDisallow: /\n');
  check('User-Agent: foo\r\nAllow: /some/path\r\nUser-Agent: bar\r\n\r\n\r\nDisallow: /\r\n');
  check('User-Agent: foo\rAllow: /some/path\rUser-Agent: bar\r\r\rDisallow: /\r');
  check('User-Agent: foo\nAllow: /some/path\nUser-Agent: bar\n\n\nDisallow: /');
  check('User-Agent: foo\nAllow: /some/path\r\nUser-Agent: bar\n\r\n\nDisallow: /');
});

test('ID_UTF8ByteOrderMarkIsSkipped', () => {
  const report = new StatsReporter();

  parseRobotsTxt('\xEF\xBB\xBFUser-Agent: foo\nAllow: /AnyValue\n', report);
  expect(report.validDirectives).toBe(2);
  expect(report.unknownDirectives).toBe(0);

  parseRobotsTxt('\xEF\xBBUser-Agent: foo\nAllow: /AnyValue\n', report);
  expect(report.validDirectives).toBe(2);
  expect(report.unknownDirectives).toBe(0);

  parseRobotsTxt('\xEFUser-Agent: foo\nAllow: /AnyValue\n', report);
  expect(report.validDirectives).toBe(2);
  expect(report.unknownDirectives).toBe(0);

  // Broken BOM → first line is garbage
  parseRobotsTxt('\xEF\x11\xBFUser-Agent: foo\nAllow: /AnyValue\n', report);
  expect(report.validDirectives).toBe(1);
  expect(report.unknownDirectives).toBe(1);

  // BOM in middle → first line is fine, middle line is garbage
  parseRobotsTxt('User-Agent: foo\n\xEF\xBB\xBFAllow: /AnyValue\n', report);
  expect(report.validDirectives).toBe(1);
  expect(report.unknownDirectives).toBe(1);
});

test('ID_NonStandardLineExample_Sitemap', () => {
  const report = new StatsReporter();
  const sitemapLoc = 'http://foo.bar/sitemap.xml';
  {
    const r = 'User-Agent: foo\nAllow: /some/path\nUser-Agent: bar\n\n\nSitemap: ' + sitemapLoc + '\n';
    parseRobotsTxt(r, report);
    expect(report.sitemap).toBe(sitemapLoc);
  }
  {
    const r = 'Sitemap: ' + sitemapLoc + '\nUser-Agent: foo\nAllow: /some/path\nUser-Agent: bar\n\n\n';
    parseRobotsTxt(r, report);
    expect(report.sitemap).toBe(sitemapLoc);
  }
});

// ── GetPathParamsQuery ────────────────────────────────────────────────────────

test('TestGetPathParamsQuery', () => {
  const t = (url, expected) => expect(getPathParamsQuery(url)).toBe(expected);
  t('', '/');
  t('http://www.example.com', '/');
  t('http://www.example.com/', '/');
  t('http://www.example.com/a', '/a');
  t('http://www.example.com/a/', '/a/');
  t('http://www.example.com/a/b?c=http://d.e/', '/a/b?c=http://d.e/');
  t('http://www.example.com/a/b?c=d&e=f#fragment', '/a/b?c=d&e=f');
  t('example.com', '/');
  t('example.com/', '/');
  t('example.com/a', '/a');
  t('example.com/a/', '/a/');
  t('example.com/a/b?c=d&e=f#fragment', '/a/b?c=d&e=f');
  t('a', '/');
  t('a/', '/');
  t('/a', '/a');
  t('a/b', '/b');
  t('example.com?a', '/?a');
  t('example.com/a;b#c', '/a;b');
  t('//a/b/c', '/b/c');
});

// ── MaybeEscapePattern ────────────────────────────────────────────────────────

test('TestMaybeEscapePattern', () => {
  expect(maybeEscapePattern('http://www.example.com')).toBe('http://www.example.com');
  expect(maybeEscapePattern('/a/b/c')).toBe('/a/b/c');
  expect(maybeEscapePattern('á')).toBe('%C3%A1');
  expect(maybeEscapePattern('%aa')).toBe('%AA');
});
