# How it works

The rule copies one decision from the worklets Babel plugin: which outside variables a worklet captures, and when.

The plugin's closure is every identifier the function body references that's bound outside the function, found by walking the whole body, nested functions included, and skipping type positions, JSX names and a named function's references to itself. ESLint's scope analysis already has this: a function scope's `through` list holds the references made inside the function or its nested functions that don't resolve there. The rule walks that list and keeps references that resolve to a module-level variable.

The capture happens when the worklet's definition runs, and at module level that's in source order. So a captured variable is a problem when it gets its value after the worklet's position in the file. The rule takes the end of the variable's declaration as the point where it's set, and compares it with the start of the worklet. Imports are always set first. A plain function declaration is hoisted with its value, but a worklet function declaration isn't, because the plugin turns it into a `const`. When the declaration contains the worklet itself, the worklet is capturing the variable it's being assigned to, and the rule uses a different message for that.

A worklet only counts if it runs while the module loads: it isn't inside another function, and it isn't in a non-static class member. Inside a function, it's created when that function runs, which for components and hooks is after the module has loaded. The plugin turns worklet methods into instance fields, and instance fields run per object, while static fields and static blocks run when the class is defined. A worklet nested in a module-level worklet isn't checked on its own, since everything it uses is captured by the outer one, which is checked.

Which functions are worklets follows the plugin too: a `'worklet'` directive, or, in a file with a `'worklet'` directive in its prologue, every top-level function, every function a top-level variable starts as, and the functions in top-level object literals. In such a file a plain function declaration becomes a `const` like any other worklet, so it loses hoisting.

The check for early uses runs once per file. A worklet function declaration is a `const` after the transform, so module-level code above it, outside any function, reads it too early. For each such declaration, the rule looks through the variable's references for one that comes before the declaration and runs at load. Export lists are skipped, since they only link the binding.

Module-level means the variable belongs to the scope whose block is the program. That covers ES modules, scripts and CommonJS, where ESLint puts top-level bindings in a function scope. `declare` statements are erased, so they never count, and neither do imports.

## Choices

Scope analysis over text matching: it handles shadowing, nested functions, every way of writing a function and every parser ESLint supports, and it can't be slowed down by unusual source. The cost is that type positions need a small check of their own, because typescript-eslint marks `typeof x` inside a type as a value reference.

Source positions over control flow: module-level code runs top to bottom, so comparing positions is exact for it, and cheap. It's why the rule leaves alone worklets inside functions, where order isn't fixed.

A differential test checks the model: it runs the real Babel plugin on the test inputs and compares the captures in its output with the rule's reports. The plugin isn't a dev dependency because its peers include react-native, so the test runs weekly in CI and skips itself elsewhere.

The plugin's version comes from package.json at load time, read with `createRequire`, so a release only has to bump one file.
