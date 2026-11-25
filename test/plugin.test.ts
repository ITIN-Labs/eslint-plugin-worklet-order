import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ESLint, Linter } from 'eslint';
import fc from 'fast-check';
import plugin from '../src/index.ts';

describe('plugin', () => {
  it('names itself after package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string; version: string };
    assert.deepEqual(plugin.meta, { name: pkg.name, version: pkg.version });
  });

  it('reports through the recommended config in a flat config', async () => {
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [plugin.configs.recommended] });
    const [result] = await eslint.lintText(
      `function a() { 'worklet'; return b(); }\nfunction b() { 'worklet'; return 1; }\n`,
      { filePath: 'worklets.js' },
    );
    assert.deepEqual(
      result?.messages.map((m) => [m.ruleId, m.severity, m.line]),
      [['worklet-order/no-capture-before-define', 2, 1]],
    );
  });

  it('rejects options, since the rule has none', () => {
    const linter = new Linter();
    assert.throws(
      () =>
        linter.verify('', [
          { plugins: { 'worklet-order': plugin }, rules: { 'worklet-order/no-capture-before-define': ['error', {}] } },
        ]),
      /should NOT have more than 0 items|Configuration for rule/,
    );
  });
});

// Random modules of worklets, plain functions and constants, each worklet using some of the others,
// directly, from a nested function, or shadowed by a local of the same name. The oracle restates
// the rule's own position logic (a module-level worklet may not capture a binding set further
// down; plain function declarations count as set from the start; shadowed names aren't captured),
// so it checks the scope handling, not whether that model matches the Babel plugin. The
// differential test checks that.
type Kind = 'worklet' | 'arrow' | 'plain' | 'const';
type Use = { target: number; how: 'direct' | 'nested' | 'shadowed' };
const statement = fc.record({
  kind: fc.constantFrom<Kind>('worklet', 'arrow', 'plain', 'const'),
  uses: fc.array(fc.record({ target: fc.nat(7), how: fc.constantFrom<Use['how']>('direct', 'nested', 'shadowed') }), {
    maxLength: 4,
  }),
});

describe('no-capture-before-define on generated modules', () => {
  it('reports exactly the captures the oracle predicts', () => {
    const linter = new Linter();
    const config = [plugin.configs.recommended];
    fc.assert(
      fc.property(fc.array(statement, { minLength: 1, maxLength: 8 }), (statements) => {
        const name = (i: number) => `v${String(i)}`;
        const inRange = (uses: Use[]) => uses.filter((u) => u.target < statements.length);
        const use = ({ target, how }: Use) =>
          how === 'direct'
            ? `${name(target)};`
            : how === 'nested'
              ? `(() => ${name(target)})();`
              : `{ const ${name(target)} = 0; ${name(target)}; }`;
        const code = statements
          .map(({ kind, uses }, i) => {
            const body = inRange(uses).map(use).join(' ');
            if (kind === 'worklet') return `function ${name(i)}() { 'worklet'; ${body} }`;
            if (kind === 'arrow') return `const ${name(i)} = () => { 'worklet'; ${body} };`;
            if (kind === 'plain') return `function ${name(i)}() { ${body} }`;
            return `const ${name(i)} = 1;`;
          })
          .join('\n');

        const expected = new Set<string>();
        statements.forEach(({ kind, uses }, i) => {
          if (kind !== 'worklet' && kind !== 'arrow') return;
          for (const { target: j, how } of inRange(uses)) {
            if (how === 'shadowed') continue;
            const capturesItself = j === i && kind === 'arrow';
            const setLater = j > i && statements[j]?.kind !== 'plain';
            if (capturesItself || setLater) expected.add(`${name(i)}>${name(j)}`);
          }
        });

        const actual = new Set(
          linter.verify(code, config).map((m) => {
            const match = /Worklet '(\w+)' captures '(\w+)'/.exec(m.message);
            assert.ok(match, m.message);
            return `${match[1] ?? ''}>${match[2] ?? ''}`;
          }),
        );
        assert.deepEqual(actual, expected, code);
      }),
      { numRuns: 500 },
    );
  });
});
