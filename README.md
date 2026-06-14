# google-robotstxt-parser

[![npm version](https://img.shields.io/npm/v/google-robotstxt-parser)](https://www.npmjs.com/package/google-robotstxt-parser)
[![npm downloads](https://img.shields.io/npm/dm/google-robotstxt-parser)](https://www.npmjs.com/package/google-robotstxt-parser)
[![license](https://img.shields.io/npm/l/google-robotstxt-parser)](./LICENSE)

A pure JavaScript port of Google's official [robotstxt](https://github.com/google/robotstxt) C++ library. Runs in both **Node.js** and the **browser** with no dependencies.

Implements the same parsing rules, typo tolerance, and URL-matching logic that Google's own crawler uses to evaluate `robots.txt` files.

## Installation

```bash
npm install google-robotstxt-parser
```

## Usage

```js
import { RobotsMatcher } from 'google-robotstxt-parser';

const matcher = new RobotsMatcher();
const robotsContent = `
User-agent: *
Dissallow: /secret/   # Typo accepted by Google!
`;

const isAllowed = matcher.allowedByRobots(robotsContent, ['Googlebot'], 'https://example.com/secret/page');
console.log(isAllowed); // false
```

### Check a single user-agent

```js
const allowed = matcher.oneAgentAllowedByRobots(robotsContent, 'Googlebot', 'https://example.com/public/');
console.log(allowed); // true
```

### Check multiple user-agents at once

`allowedByRobots` accepts an array — the URL is blocked if **any** of the agents is disallowed.

```js
const allowed = matcher.allowedByRobots(robotsContent, ['Googlebot', 'Bingbot'], 'https://example.com/page');
```

## API

### `RobotsMatcher`

| Method | Description |
|---|---|
| `allowedByRobots(robotsTxt, userAgents, url)` | Returns `true` if the URL is accessible to at least one of the given user-agents. |
| `oneAgentAllowedByRobots(robotsTxt, userAgent, url)` | Convenience wrapper for a single user-agent string. |
| `disallow()` | Returns the raw disallow decision after a parse (useful after calling `allowedByRobots`). |
| `everSeenSpecificAgent()` | `true` if the parsed file contained a rule group for the queried agent specifically. |
| `matchingLine()` | Line number of the winning allow/disallow rule, or `0` if none matched. |

### `parseRobotsTxt(robotsBody, handler)`

Low-level parser. Pass a `RobotsParseHandler` subclass to react to individual directives without running the full matcher.

```js
import { parseRobotsTxt, RobotsParseHandler } from 'google-robotstxt-parser';

class MyHandler extends RobotsParseHandler {
  handleDisallow(lineNum, value) {
    console.log(`Line ${lineNum}: Disallow ${value}`);
  }
}

parseRobotsTxt(robotsContent, new MyHandler());
```

## Compatibility with Google's parser

This library matches Google's behaviour in several ways that differ from a naive implementation:

- **Typo tolerance** — common misspellings like `Dissallow`, `Disalow`, `User agent` are accepted.
- **Pattern priority** — longer patterns win over shorter ones, regardless of order.
- **Specific agent beats wildcard** — if the robots.txt contains a group for the queried agent, the `User-agent: *` group is ignored entirely for that agent.
- **`/index.html` equivalence** — `Allow: /dir/index.html` is treated as `Allow: /dir/`.
- **URL normalisation** — non-ASCII characters in allow/disallow patterns are percent-encoded to match Google's canonicalisation.
- **UTF-8 BOM** — silently stripped at the start of the file.
- **Line length cap** — lines longer than ~16 KB are truncated, matching the C++ implementation.

## Browser usage

The library is a standard ES module with no Node.js-specific APIs, so it works directly in the browser:

```html
<script type="module">
  import { RobotsMatcher } from './robots.js';

  const matcher = new RobotsMatcher();
  console.log(matcher.oneAgentAllowedByRobots('User-agent: *\nDisallow: /', 'MyBot', 'https://example.com/'));
</script>
```

## License

Apache 2.0 — same as the upstream [google/robotstxt](https://github.com/google/robotstxt) repository.
