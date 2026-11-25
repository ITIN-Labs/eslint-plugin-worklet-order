// The rule's test inputs, shared by the RuleTester tests and the differential test against the
// real Babel plugin.
import type { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

export const later = (worklet: string, name: string) => ({ messageId: 'later', data: { worklet, name } });
const self = (worklet: string, name: string) => ({ messageId: 'self', data: { worklet, name } });
const usedAbove = (name: string) => ({ messageId: 'usedAbove', data: { name } });

const commonjs = { sourceType: 'commonjs' } as const;
const script = { sourceType: 'script' } as const;
const jsx = { parserOptions: { ecmaFeatures: { jsx: true } } };

export const jsCases: { valid: RuleTester.ValidTestCase[]; invalid: RuleTester.InvalidTestCase[] } = {
  valid: [
    {
      name: 'a worklet calls a worklet defined above it',
      code: `function b() { 'worklet'; return 1; }\nfunction a() { 'worklet'; return b(); }`,
    },
    {
      name: 'a plain function declared below is hoisted with its value',
      code: `function a() { 'worklet'; return helper(); }\nfunction helper() { return 1; }`,
    },
    {
      name: 'imports are set before any code runs',
      code: `import { spring } from 'lib';\nfunction a() { 'worklet'; return spring; }`,
    },
    {
      name: 'a constant defined above',
      code: `const SPRING = { damping: 10 };\nconst a = () => { 'worklet'; return SPRING; };`,
    },
    {
      name: 'a named worklet calling itself',
      code: `function a(n) { 'worklet'; return n > 0 ? a(n - 1) : 0; }`,
    },
    {
      name: 'a named function expression calling itself',
      code: `const a = function inner(n) { 'worklet'; return n > 0 ? inner(n - 1) : 0; };`,
    },
    {
      name: 'a worklet inside a component is created after the module has loaded',
      code: `function Card() { const style = () => { 'worklet'; return LATER; }; return style; }\nconst LATER = 1;`,
    },
    {
      name: 'a function without the directive',
      code: `function a() { return LATER; }\nconst LATER = 1;`,
    },
    {
      name: "'worklet' after another statement isn't a directive",
      code: `function a() { run(); 'worklet'; return LATER; }\nconst LATER = 1;`,
    },
    {
      name: 'an arrow function with an expression body',
      code: `const a = () => LATER;\nconst LATER = 1;`,
    },
    {
      name: 'a local variable shadows the later one',
      code: `function a() { 'worklet'; const LATER = 2; return LATER; }\nconst LATER = 1;`,
    },
    {
      name: 'a parameter shadows the later one',
      code: `function a(LATER) { 'worklet'; return LATER; }\nconst LATER = 1;`,
    },
    {
      name: 'a worklet method becomes an instance field, created per instance',
      code: `class A { m() { 'worklet'; return LATER; } }\nconst LATER = 1;`,
    },
    {
      name: 'an instance field is created per instance',
      code: `class A { f = () => { 'worklet'; return LATER; }; }\nconst LATER = 1;`,
    },
    {
      name: "a worklet with 'no-worklet-closure' captures nothing",
      code: `function a() { 'worklet'; 'no-worklet-closure'; return LATER; }\nconst LATER = 1;`,
    },
    {
      name: 'configured globals exist before the module runs',
      code: `function a() { 'worklet'; return later; }`,
      languageOptions: { globals: { later: 'readonly' } },
    },
    {
      name: 'an undeclared global',
      code: `function a() { 'worklet'; return performance.now(); }`,
    },
    {
      name: 'JSX names are not captured',
      code: `function a() { 'worklet'; return <Badge />; }\nconst Badge = () => null;`,
      languageOptions: jsx,
    },
    {
      name: 'a script, with the variable defined above',
      code: `var LATER = 1;\nfunction a() { 'worklet'; return LATER; }`,
      languageOptions: script,
    },
    {
      name: 'CommonJS, with the variable defined above',
      code: `const LATER = 1;\nfunction a() { 'worklet'; return LATER; }\nmodule.exports = { a };`,
      languageOptions: commonjs,
    },
    {
      name: 'a worklet file with each function defined before it is used',
      code: `'worklet';\nexport function b() { return 1; }\nexport function a() { return b(); }`,
    },
    {
      name: 'a plain function used above its declaration',
      code: `export const handlers = { onEnd: snap };\nfunction snap() { return 1; }`,
    },
    {
      name: 'an export list above a worklet only links it',
      code: `export { snap };\nfunction snap() { 'worklet'; return 1; }`,
    },
    {
      name: 'a worklet used above it, but only inside a function that runs later',
      code: `export function Card() { return snap(); }\nfunction snap() { 'worklet'; return 1; }`,
    },
  ],
  invalid: [
    {
      name: 'a worklet calls a worklet defined below it',
      code: `function a() { 'worklet'; return b(); }\nfunction b() { 'worklet'; return 1; }`,
      errors: [
        {
          message:
            "Worklet 'a' captures 'b' when it's defined, but 'b' is set further down the file, so the worklet gets undefined. Move 'b' above the worklet.",
          line: 1,
          column: 34,
        },
      ],
    },
    {
      name: 'a constant defined below',
      code: `const a = () => { 'worklet'; return SPRING; };\nconst SPRING = { damping: 10 };`,
      errors: [later("Worklet 'a'", 'SPRING')],
    },
    {
      name: 'let and var defined below',
      code: `function a() { 'worklet'; return x + y; }\nlet x = 1;\nvar y = 2;`,
      errors: [later("Worklet 'a'", 'x'), later("Worklet 'a'", 'y')],
    },
    {
      name: 'destructured constants defined below',
      code: `function a() { 'worklet'; return x + y; }\nconst { x, y } = { x: 1, y: 2 };`,
      errors: [later("Worklet 'a'", 'x'), later("Worklet 'a'", 'y')],
    },
    {
      name: 'a class defined below',
      code: `function a() { 'worklet'; return new Point(); }\nclass Point {}`,
      errors: [later("Worklet 'a'", 'Point')],
    },
    {
      name: 'a default parameter is captured too',
      code: `function a(p = LATER) { 'worklet'; return p; }\nconst LATER = 1;`,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: "'use strict' before 'worklet'",
      code: `function a() { 'use strict'; 'worklet'; return LATER; }\nconst LATER = 1;`,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'exported worklets',
      code: `export function a() { 'worklet'; return b(); }\nexport function b() { 'worklet'; return 1; }`,
      errors: [later("Worklet 'a'", 'b')],
    },
    {
      name: 'an anonymous default export',
      code: `export default function () { 'worklet'; return LATER; }\nconst LATER = 1;`,
      errors: [later('This worklet', 'LATER')],
    },
    {
      name: 'a nested function is captured with the worklet',
      code: `function a() { 'worklet'; const f = () => LATER; return f; }\nconst LATER = 1;`,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'a nested worklet is captured with the outer one',
      code: `function outer() { 'worklet'; return () => { 'worklet'; return LATER; }; }\nconst LATER = 1;`,
      errors: [later("Worklet 'outer'", 'LATER')],
    },
    {
      name: 'one report per captured variable',
      code: `function a() { 'worklet'; return b() + b() + c; }\nfunction b() { 'worklet'; return 1; }\nconst c = 2;`,
      errors: [later("Worklet 'a'", 'b'), later("Worklet 'a'", 'c')],
    },
    {
      name: 'an object method at module level',
      code: `const handlers = { onEnd() { 'worklet'; return LATER; } };\nconst LATER = 1;`,
      errors: [later("Worklet 'onEnd'", 'LATER')],
    },
    {
      name: 'a function passed to a call at module level',
      code: `register(function () { 'worklet'; return LATER; });\nconst LATER = 1;`,
      errors: [later('This worklet', 'LATER')],
    },
    {
      name: 'a worklet called immediately',
      code: `(function () { 'worklet'; return LATER; })();\nconst LATER = 1;`,
      errors: [later('This worklet', 'LATER')],
    },
    {
      name: 'a generator worklet',
      code: `function* a() { 'worklet'; yield LATER; }\nconst LATER = 1;`,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'an async worklet',
      code: `const a = async () => { 'worklet'; return LATER; };\nconst LATER = 1;`,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'a static field runs when the class is defined',
      code: `class A { static f = () => { 'worklet'; return LATER; }; }\nconst LATER = 1;`,
      errors: [later("Worklet 'f'", 'LATER')],
    },
    {
      name: 'a static block runs when the class is defined',
      code: `class A { static { const w = () => { 'worklet'; return LATER; }; } }\nconst LATER = 1;`,
      errors: [later("Worklet 'w'", 'LATER')],
    },
    {
      name: 'a double-quoted directive',
      code: `function a() { "worklet"; return LATER; }\nconst LATER = 1;`,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'an arrow worklet calling itself through its variable',
      code: `const a = (n) => { 'worklet'; return n > 0 ? a(n - 1) : 0; };`,
      errors: [self("Worklet 'a'", 'a')],
    },
    {
      name: 'a worklet reading the object it is part of',
      code: `const handlers = { onEnd() { 'worklet'; return handlers; } };`,
      errors: [
        {
          message:
            "Worklet 'onEnd' captures 'handlers' while 'handlers' is still being set, so the worklet gets undefined. Don't refer to 'handlers' inside its own value.",
        },
      ],
    },
    {
      name: 'a script, with var defined below',
      code: `function a() { 'worklet'; return LATER; }\nvar LATER = 1;`,
      languageOptions: script,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'CommonJS, with the variable defined below',
      code: `function a() { 'worklet'; return LATER; }\nconst LATER = 1;\nmodule.exports = { a };`,
      languageOptions: commonjs,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'a worklet file makes plain function declarations worklets',
      code: `'worklet';\nexport function a() { return b(); }\nexport function b() { return 1; }`,
      errors: [later("Worklet 'a'", 'b')],
    },
    {
      name: 'a worklet file workletizes arrow functions with expression bodies',
      code: `'worklet';\nexport const a = () => LATER;\nconst LATER = 1;`,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'a worklet file workletizes object methods',
      code: `'worklet';\nexport const handlers = { onEnd() { return LATER; } };\nconst LATER = 1;`,
      errors: [later("Worklet 'onEnd'", 'LATER')],
    },
    {
      name: 'module-level code reads a worklet declared below',
      code: `export const handlers = { onEnd: snap, onCancel: snap };\nfunction snap() { 'worklet'; return 1; }`,
      errors: [
        {
          message:
            "'snap' is a worklet, which the Babel plugin turns into a const that's only set where it's declared, further down the file, so it's undefined here. Move 'snap' above this line.",
          line: 1,
          column: 34,
        },
      ],
    },
    {
      name: 'module-level code calls a worklet declared below',
      code: `const X = snap();\nfunction snap() { 'worklet'; return 1; }`,
      errors: [usedAbove('snap')],
    },
    {
      name: 'a static field reads a worklet declared below',
      code: `class A { static onEnd = snap; }\nfunction snap() { 'worklet'; return 1; }`,
      errors: [usedAbove('snap')],
    },
    {
      name: 'a worklet file: module-level code reads a plain function declared below',
      code: `'worklet';\nexport const handlers = { onEnd: snap };\nfunction snap() { return 1; }`,
      errors: [usedAbove('snap')],
    },
  ],
};

const ts = { parser: tseslint.parser };

export const tsCases: { valid: RuleTester.ValidTestCase[]; invalid: RuleTester.InvalidTestCase[] } = {
  valid: [
    {
      name: 'type-only references are not captured',
      code: [
        `function a(): void { 'worklet'; const y: typeof LATER = 1; const z = 1 as Later; const p: Shape | null = null; }`,
        `const LATER = 1;`,
        `type Later = number;`,
        `interface Shape { x: number }`,
      ].join('\n'),
      languageOptions: ts,
    },
    {
      name: 'generic type arguments are not captured',
      code: `function a(): void { 'worklet'; run<typeof LATER>(); }\nconst LATER = 1;`,
      languageOptions: ts,
    },
    {
      name: 'implements names a type',
      code: `function a() { 'worklet'; class K implements Shape { x = 1; } return K; }\ninterface Shape { x: number }`,
      languageOptions: ts,
    },
    {
      name: 'a typed worklet using a constant defined above',
      code: `const SPRING: { damping: number } = { damping: 10 };\nconst a = (): number => { 'worklet'; return SPRING.damping; };`,
      languageOptions: ts,
    },
    {
      name: 'declare const below is erased',
      code: `function a() { 'worklet'; return X; }\ndeclare const X: number;`,
      languageOptions: ts,
    },
    {
      name: 'declare function below is erased',
      code: `function a() { 'worklet'; return f(); }\ndeclare function f(): number;`,
      languageOptions: ts,
    },
    {
      name: 'declare class below is erased',
      code: `function a() { 'worklet'; return new C(); }\ndeclare class C {}`,
      languageOptions: ts,
    },
    {
      name: 'declare enum below is erased',
      code: `function a() { 'worklet'; return E.A; }\ndeclare enum E { A }`,
      languageOptions: ts,
    },
    {
      name: 'declare namespace below is erased',
      code: `function a() { 'worklet'; return N.x; }\ndeclare namespace N { const x: number; }`,
      languageOptions: ts,
    },
    {
      name: 'a worklet used above only in a type',
      code: `type Snap = typeof snap;\nfunction snap() { 'worklet'; return 1; }`,
      languageOptions: ts,
    },
  ],
  invalid: [
    {
      name: 'a value reference wrapped in a type assertion',
      code: `function a(): number { 'worklet'; return LATER as number; }\nconst LATER = 1;`,
      languageOptions: ts,
      errors: [later("Worklet 'a'", 'LATER')],
    },
    {
      name: 'an enum defined below',
      code: `function a(): number { 'worklet'; return Mode.Fast; }\nenum Mode { Fast }`,
      languageOptions: ts,
      errors: [later("Worklet 'a'", 'Mode')],
    },
    {
      name: 'a namespace with values defined below',
      code: `function a(): number { 'worklet'; return N.x; }\nnamespace N { export const x = 1; }`,
      languageOptions: ts,
      errors: [later("Worklet 'a'", 'N')],
    },
  ],
};
