# worklet-order/no-capture-before-define

Disallow worklets that capture a variable before it's set, and module-level uses of a worklet above its declaration.

## Why

The worklets Babel plugin (used by Reanimated and react-native-worklets) turns each function with a `'worklet'` directive into a call to a generated factory:

```js
// what you write
function landingTop(heights, from, to) {
  'worklet';
  return from + travel(heights, from, to);
}

// roughly what runs
const landingTop = (function landingTopFactory([travel]) {
  const landingTop = function (heights, from, to) {
    return from + travel(heights, from, to);
  };
  landingTop.__closure = [travel];
  return landingTop;
})([travel]);
```

Two things follow. The worklet copies every outside variable it uses at the moment its definition runs, and a worklet written as a function declaration becomes a `const`, so it loses hoisting. If `travel` is defined further down, it isn't set when `landingTop` is defined.

React Native's and Expo's Babel presets turn `const` and `let` into `var`, so the worklet silently keeps `undefined` and the app crashes the first time it's called, usually on the UI thread. A class declared further down is different: the module throws a `ReferenceError` when it loads.

This only matters for code that runs while the module loads. A worklet created inside a component or hook is created after the whole module has run.

## What it reports

A worklet that runs while the module loads (at the top level, in a top-level object or call, or in a static class field or static block; not inside a function or an instance member) that uses a module-level binding which gets its value further down the file:

```js
function a() {
  'worklet';
  return b(); // b is a worklet, so it's a const defined below
}
function b() {
  'worklet';
  return 1;
}

const style = () => {
  'worklet';
  return SPRING; // const defined below
};
const SPRING = { damping: 10 };

function c() {
  'worklet';
  const nested = () => LATER; // nested functions are captured with the worklet
  return nested();
}
let LATER = 1;
```

Also a worklet that uses the variable it's being assigned to, because the factory runs before the assignment finishes:

```js
const countdown = (n) => {
  'worklet';
  return n > 0 ? countdown(n - 1) : 0; // countdown isn't set yet
};

const handlers = {
  onEnd() {
    'worklet';
    return handlers.onCancel; // handlers isn't set yet
  },
};
```

For a worklet that calls itself, give the function its own name. A named function refers to itself, and the plugin leaves that alone:

```js
function countdown(n) {
  'worklet';
  return n > 0 ? countdown(n - 1) : 0;
}
```

And module-level code, outside any function, that uses a worklet function declared further down. The worklet is a `const` by then, so the code reads it before it's set:

```js
export const handlers = { onEnd: snap }; // snap is undefined here
const start = snap(); // and this call fails

function snap() {
  'worklet';
  return 0;
}
```

In a file whose first lines include a `'worklet'` directive, the plugin makes every top-level function a worklet, including plain function declarations, arrow functions with expression bodies and the methods of top-level objects. The rule treats them the same way.

## What it allows

```js
import { clamp } from './math'; // imports are set before any code runs

function a() {
  'worklet';
  return clamp(helper(), 0, 1); // plain function declarations are hoisted with their value
}
function helper() {
  return 0.5;
}

function Card() {
  const style = () => {
    'worklet';
    return LATER; // created when Card renders, after the module has loaded
  };
}
const LATER = 1;
```

Uses inside TypeScript types (`typeof x`, `as Shape`, type arguments, `implements`), JSX element names and names shadowed by a parameter or local variable aren't captured by the plugin, so they aren't reported either. Configured globals and other names with no declaration in the file are captured, but they already exist when the module loads, so they're safe. `declare` statements are erased at build time and never reported. A worklet with a `'no-worklet-closure'` directive captures nothing in the plugin's default mode, so it isn't checked.

What the rule can't see is listed in the README under Limitations.

## Options

None.

## When not to use it

If you don't use worklets.
