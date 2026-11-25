# @itin-labs/eslint-plugin-worklet-order

An ESLint rule for React Native apps using worklets (Reanimated, react-native-worklets). It catches a module-level worklet that uses a variable or another worklet defined further down the file, and module-level code that uses a worklet before its declaration. That code passes type checks, then fails at run time.

```sh
npm install --save-dev @itin-labs/eslint-plugin-worklet-order
```

```js
// eslint.config.js
import workletOrder from '@itin-labs/eslint-plugin-worklet-order';

export default [
  // ...your other config
  workletOrder.configs.recommended,
];
```

It's for anyone writing worklets as plain functions at the top of a module, which is the usual way to share math between gesture handlers and animated styles.

## The problem

```js
function landingTop(heights, from, to) {
  'worklet';
  return from + travel(heights, from, to); // travel is undefined here
}

function travel(heights, from, to) {
  'worklet';
  return heights.slice(from, to).reduce((a, b) => a + b, 0);
}
```

This looks fine, since function declarations are hoisted. But the worklets Babel plugin rewrites every function with a `'worklet'` directive into `const name = factory([...captured])`, and the factory call copies each outside variable the worklet uses at the moment the definition runs. `travel` is no longer hoisted, and it isn't set yet when `landingTop` is defined.

React Native's and Expo's Babel presets turn `const` and `let` into `var`, so the worklet silently keeps `undefined` and the app crashes the first time it's called, usually on the UI thread. A class declared further down is different: the module throws a `ReferenceError` when it loads. Tests run through Jest with the same Babel config hit the same `undefined`.

The fix is to define things before the code that uses them:

```js
function travel(heights, from, to) {
  'worklet';
  return heights.slice(from, to).reduce((a, b) => a + b, 0);
}

function landingTop(heights, from, to) {
  'worklet';
  return from + travel(heights, from, to);
}
```

## The rule: `worklet-order/no-capture-before-define`

The recommended config turns it on as an error. It has no options. It reports three things.

A worklet that runs while the module loads and uses a module-level binding that only gets its value further down the file. That's a worklet at the top level, in a top-level object or call, or in a static class field or static block, but not one inside a function or an instance member, which is created later. The binding can be a `const`, `let` or `var`, a class, an enum or namespace, or another worklet, and the use can be anywhere in the worklet, including default parameters and nested functions, because the plugin captures for the whole function.

A worklet that uses the variable it's being assigned to, such as an arrow worklet calling itself or a method reading its own object.

Module-level code that uses a worklet function declared further down, outside any function: `export const handlers = { onEnd: snap }` above `function snap() { 'worklet'; ... }`. The worklets docs list this one as a pitfall.

Files that start with a `'worklet'` directive are understood too: there the plugin makes every top-level function a worklet, so plain function declarations lose their hoisting as well.

It doesn't report imports, configured globals, plain function declarations in ordinary files (they're hoisted with their value), `declare` statements, a named worklet calling itself, worklets marked `'no-worklet-closure'`, uses only in TypeScript types, JSX element names, or anything shadowed by a local name. The details and more examples are in [the rule's docs](docs/rules/no-capture-before-define.md).

## How it compares

ESLint's own `no-use-before-define` doesn't fit. With its defaults it reports these cases, but also every helper function and constant used above its definition from inside a function, which is ordinary, safe code. Many configs turn those checks off with `functions: false` and `variables: false`, and then it allows exactly the cases that crash. It doesn't know which functions the Babel plugin rewrites.

[eslint-plugin-reanimated](https://www.npmjs.com/package/eslint-plugin-reanimated) checks a different mistake, calling a plain JavaScript function from a worklet, using type information. Its last release was 2.0.1, in August 2023.

## Limitations

What the rule doesn't catch, or can't:

- Functions the plugin workletizes without a directive. A function passed by name to `useAnimatedStyle`, `runOnUI`, a gesture builder and similar calls gets the directive added to its module-level declaration, so `function styleFn() { return { opacity: OPACITY }; }` above `const OPACITY = 0.5`, used from a component as `useAnimatedStyle(styleFn)`, captures `undefined`. Inline callbacks at module level, such as `const pan = Gesture.Pan().onUpdate(() => use(L))` or `FadeIn.withCallback(...)`, capture when the module loads. The rule only knows about the `'worklet'` directive and worklet files, so it misses both.
- Worklets created inside a function that happens to run while the module loads, such as an IIFE.
- Bindings declared inside a module-level block, like `if (x) { const L = 1; }`. Only bindings at the top of the module are checked.
- A named `export default function snap() { 'worklet'; ... }`. The plugin replaces it with `export default factory(...)`, so the name `snap` stops existing inside the file. The rule doesn't report uses of it.
- Worklets that call each other in a cycle. No order works, since each captures the other when it's defined; the rule reports one of them. Pass one in as an argument, or merge them.
- Worklet classes (a class in a worklet file, or one with `__workletClass`), and worklet methods, which the plugin turns into instance fields created per instance.
- One file at a time, so it can't follow a capture into another module. Imports are always safe for this reason.
- Values that change. A `let` reassigned after the worklet is defined stays at its old value inside the worklet, which is a different problem.
- The plugin's bundle mode. The rule follows the default mode. Bundle mode also captures JSX names, ignores `'no-worklet-closure'` and imports some bindings instead of capturing them, and the plugin's Oxc port only has bundle mode.

CommonJS files and scripts are handled like modules.

## Privacy

The rule only reads the code ESLint gives it, and never uses the network. When it loads, the plugin reads its own package.json to report its name and version; it touches no other files.

## Status and versioning

The RuleTester tests cover every case above, with TypeScript cases through typescript-eslint's parser, and check the recommended config end to end. A property-based test runs the rule on 500 generated modules each run, with nested and shadowed uses, and compares it with an oracle that restates the rule's position logic, so it checks the scope handling but can't catch a wrong model of the plugin. A differential test covers that: it runs the real worklets Babel plugin on every test input and checks that the rule reports exactly the captures and early uses Babel's output has. It needs the plugin, which isn't a dev dependency because it pulls in react-native, so it runs weekly in CI against the newest plugin release and skips itself elsewhere. CI runs the rest on Node 22, 24 and 26 with ESLint 10, and on ESLint 9.0.

Versions are 0.x until the rule has settled. A minor release can report new cases or change messages, and says so in the changelog; a patch release only fixes false positives or crashes. 1.0 will come when:

- it has run on at least two React Native apps for three months without a false positive report open
- the differential test has passed against every plugin release in that time
- the autoworkletized cases are either covered or documented as out of scope for good

## License

MIT
