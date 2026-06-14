# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests
npm test

# Run a single test by name
node --experimental-vm-modules node_modules/.bin/jest -t "TestNameHere"
```

The `--experimental-vm-modules` flag is required because the package uses ES modules (`"type": "module"`).

## Architecture

This is a single-file JavaScript port of Google's `robots.cc`/`robots.h` (Apache 2.0). The entire implementation lives in `robots.js`; `robots.test.js` mirrors the C++ test suite.

**Processing pipeline:**

1. `parseRobotsTxt(robotsBody, handler)` — character-by-character parser that strips the UTF-8 BOM, splits lines (handling CRLF), truncates lines exceeding `MAX_LINE_LEN` (2083×8 bytes), and calls `handler` callbacks for each directive.

2. `getKeyAndValueFrom(line)` — extracts the key/value from a single line. Accepts both `:` and whitespace separators (Google extension), emitting metadata flags (`is_missing_colon_separator`, `is_line_too_long`, etc.).

3. `getKeyType(key)` — maps a key string to `KeyType` (`USER_AGENT`, `ALLOW`, `DISALLOW`, `SITEMAP`, `UNKNOWN`). `ALLOW_FREQUENT_TYPOS = true` enables lenient matching of common misspellings.

4. `maybeEscapePattern(src)` — canonicalises allow/disallow path patterns: percent-encodes non-ASCII bytes and uppercases existing `%xx` sequences.

5. `RobotsParseHandler` — abstract base class (no-op methods) that consumers subclass to react to parsed directives.

6. `RobotsMatcher extends RobotsParseHandler` — stateful handler that tracks `_allow`/`_disallow` match hierarchies (global `*` agent vs. specific agent) and resolves the final allow/disallow decision. Priority = pattern length; longer patterns win.

**Key decision logic in `RobotsMatcher.disallow()`:** specific-agent rules take precedence over global `*` rules. If a specific agent was ever seen, global rules are ignored entirely for that agent.

**Public API:**
- `RobotsMatcher` — main entry point; use `oneAgentAllowedByRobots(robotsTxt, userAgent, url)` or `allowedByRobots(robotsTxt, userAgents[], url)`.
- `RobotsParseHandler` — base class for custom parse handlers.
- `parseRobotsTxt` — low-level parser, useful when you only need to inspect directives without matching.
- `getPathParamsQuery`, `maybeEscapePattern`, `KeyType` — utility exports.
