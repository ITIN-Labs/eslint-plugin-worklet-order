# Threat model

The rule runs inside ESLint on whatever source ESLint is given, which may come from an untrusted pull request.

## What's trusted

ESLint, its parsers and Node. A bug in them goes to those projects.

## What isn't

The source code being linted. It can be malformed, huge or written to cause trouble.

## Risks and defences

Code execution. The rule never evaluates, imports or requires anything from the linted code; it only reads the syntax tree and scope information ESLint has already built.

Hangs and memory use. There are no regular expressions over source text. For each reference a module-level worklet makes to a module-level binding, and each use of a worklet above its declaration, the rule walks up the tree to check for a type position or an enclosing function, so the work is those references times their nesting depth, with no backtracking or recursion that input can blow up. Measured locally: one reference nested 2,000 blocks deep adds 16 ms over parsing alone, and 2,000 worklets with 40,000 captures add 69 ms. Parsing limits are ESLint's.

False confidence. A missed case lets a crash ship. Defences: the rule follows the Babel plugin's own capture logic, the README lists what it doesn't check, and a differential test runs the real plugin on every test input weekly and checks the rule reports exactly what Babel's output shows. The property-based test only restates the rule's own position logic, so it guards the scope handling, not the model.

Supply chain. No runtime dependencies (ESLint is a peer), a committed lockfile, `npm ci` in CI, `npm audit`, CodeQL, Dependabot, actions pinned to commit SHAs, no install scripts, and publishing through npm trusted publishing with provenance.

## What leaves the machine

Nothing. The plugin reads its own package.json once when it loads and never touches the network or other files.
