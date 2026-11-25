---
'@itin-labs/eslint-plugin-worklet-order': minor
---

Added: first release, with the `no-capture-before-define` rule and a recommended config. The rule reports worklets that capture a variable set further down the file, worklets that capture the variable they're assigned to, and module-level code that uses a worklet above its declaration, including in worklet files.
