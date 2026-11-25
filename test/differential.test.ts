// Compares the rule with the real worklets Babel plugin on every test input. The plugin isn't a dev
// dependency because its peer dependencies include react-native; the weekly workflow installs it
// with Babel 7 and runs this with DIFFERENTIAL=required. Elsewhere the test skips itself.
//
// Ground truth comes from Babel's output: each worklet becomes `factory([captured...])`. A capture
// is unsafe when the captured binding is set after that call (imports and hoisted functions never
// are). A use above a worklet is unsafe when module-level code reads a binding the plugin turned
// into `const name = factory(...)` before that line. What both sides share is the idea of code that
// runs at load: not inside a function, and not in a non-static class field.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { Linter, type RuleTester } from 'eslint';
import plugin from '../src/index.ts';
import { jsCases, tsCases } from './cases.ts';

interface BabelNode {
  type: string;
  start: number;
  end: number;
}
interface BabelPath {
  node: BabelNode;
  parentPath: BabelPath | null;
  scope: { getBinding(name: string): BabelBinding | undefined };
  getFunctionParent(): BabelPath | null;
}
interface BabelBinding {
  kind: string;
  path: BabelPath;
  referencePaths: BabelPath[];
}
interface Babel {
  transformSync(code: string, options: object): { code: string } | null;
  parseSync(code: string, options: object): BabelNode | null;
  traverse(
    ast: BabelNode,
    visitors: { CallExpression?(path: BabelPath): void; Identifier?(path: BabelPath): void },
  ): void;
}

const require = createRequire(import.meta.url);
function load(): { babel: Babel; workletsPlugin: string } | undefined {
  try {
    return {
      babel: require('@babel/core') as Babel,
      workletsPlugin: require.resolve('react-native-worklets/plugin'),
    };
  } catch {
    if (process.env.DIFFERENTIAL === 'required') throw new Error('react-native-worklets or @babel/core is missing');
    return undefined;
  }
}
const loaded = load();

/** Runs while the module loads: no function around it, and not in a non-static class field. */
function runsAtLoad(path: BabelPath): boolean {
  if (path.getFunctionParent()) return false;
  for (let p = path.parentPath; p; p = p.parentPath) {
    if (p.node.type === 'ClassProperty' && !(p.node as { static?: boolean }).static) return false;
  }
  return true;
}

function factoryOf(node: BabelNode): { captured: string[] } | undefined {
  const call = node as { callee?: { type: string; id?: { name: string } | null }; arguments?: BabelNode[] };
  if (call.callee?.type !== 'FunctionExpression' || !call.callee.id?.name.endsWith('Factory')) return undefined;
  const pack = call.arguments?.[0] as { type: string; elements: { type: string; name: string }[] } | undefined;
  const captured = pack?.type === 'ArrayExpression' ? pack.elements.map((e) => e.name) : [];
  return { captured };
}

function babelTruth(babel: Babel, workletsPlugin: string, test: RuleTester.ValidTestCase) {
  const options = test.languageOptions as { parser?: unknown; sourceType?: string } | undefined;
  const isTs = options?.parser !== undefined;
  const sourceType = options?.sourceType === 'module' || options?.sourceType === undefined ? 'module' : 'script';
  const output = babel.transformSync(test.code, {
    filename: isTs ? '/app/case.ts' : '/app/case.js',
    babelrc: false,
    configFile: false,
    cwd: '/app',
    sourceType,
    presets: isTs ? [[require.resolve('@babel/preset-typescript'), { allowDeclareFields: true }]] : [],
    plugins: [[workletsPlugin, { omitNativeOnlyData: true }]],
  });
  // Nodes the plugin creates have no source positions, so the output is parsed again.
  const ast = output && babel.parseSync(output.code, { babelrc: false, configFile: false, sourceType });
  assert.ok(ast);

  const captures = new Set<string>();
  const usedAbove = new Set<string>();
  babel.traverse(ast, {
    CallExpression(path) {
      const factory = factoryOf(path.node);
      if (!factory || !runsAtLoad(path)) return;
      for (const name of factory.captured) {
        const binding = path.scope.getBinding(name);
        if (!binding || binding.kind === 'module' || binding.kind === 'hoisted') continue;
        if (binding.path.node.end > path.node.start) captures.add(name);
      }
    },
    Identifier(path) {
      const name = (path.node as { name?: string }).name ?? '';
      const binding = path.scope.getBinding(name);
      if (!binding || binding.kind !== 'const' || !binding.referencePaths.includes(path)) return;
      const init = (binding.path.node as { init?: BabelNode | null }).init;
      if (!init || !factoryOf(init)) return;
      if (path.parentPath?.node.type === 'ExportSpecifier' || !runsAtLoad(path)) return;
      // A factory's argument list is the capture itself, counted above.
      const pack = path.parentPath;
      if (pack?.node.type === 'ArrayExpression' && pack.parentPath && factoryOf(pack.parentPath.node)) return;
      if (path.node.start < binding.path.node.start) usedAbove.add(name);
    },
  });
  return { captures, usedAbove };
}

function ruleReports(test: RuleTester.ValidTestCase) {
  const linter = new Linter();
  const options = (test.languageOptions ?? {}) as { parser?: unknown };
  const messages = linter.verify(
    test.code,
    [{ files: ['**/*.js', '**/*.ts'], languageOptions: test.languageOptions ?? {} }, plugin.configs.recommended],
    { filename: options.parser ? 'case.ts' : 'case.js' },
  );
  const captures = new Set<string>();
  const usedAbove = new Set<string>();
  for (const m of messages) {
    assert.equal(m.ruleId, 'worklet-order/no-capture-before-define', m.message);
    const capture = /captures '(\w+)'/.exec(m.message)?.[1];
    if (capture) captures.add(capture);
    else usedAbove.add(/^'(\w+)'/.exec(m.message)?.[1] ?? m.message);
  }
  return { captures, usedAbove };
}

describe('no-capture-before-define against the Babel plugin', { skip: loaded ? false : 'plugin not installed' }, () => {
  const all = [...jsCases.valid, ...jsCases.invalid, ...tsCases.valid, ...tsCases.invalid];
  for (const test of all) {
    // The plugin parses each worklet's source again without JSX, which a real app's React preset
    // has already compiled away; that's outside what this test sets up.
    const usesJsx = JSON.stringify(test.languageOptions ?? {}).includes('"jsx":true');
    it(test.name ?? test.code, { skip: usesJsx && 'needs a JSX preset' }, () => {
      assert.ok(loaded);
      const truth = babelTruth(loaded.babel, loaded.workletsPlugin, test);
      assert.deepEqual(ruleReports(test), truth);
    });
  }
});
