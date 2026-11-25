import type { Rule, Scope } from 'eslint';
import type * as ESTree from 'estree';

type FunctionNode = (ESTree.FunctionDeclaration | ESTree.FunctionExpression | ESTree.ArrowFunctionExpression) &
  Rule.NodeParentExtension;

// The worklets Babel plugin skips identifiers inside type positions when it builds a closure.
// ESLint's own types don't know these TypeScript node types, so they're compared as strings.
const TYPE_POSITIONS = new Set([
  'TSTypeAnnotation',
  'TSTypeQuery',
  'TSTypeReference',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
  'TSClassImplements',
]);

export const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow module-level worklets that capture a variable before it is set',
      recommended: true,
      url: 'https://github.com/ITIN-Labs/eslint-plugin-worklet-order/blob/main/docs/rules/no-capture-before-define.md',
    },
    schema: [],
    messages: {
      later:
        "{{worklet}} captures '{{name}}' when it's defined, but '{{name}}' is set further down the file, so the worklet gets undefined. Move '{{name}}' above the worklet.",
      self: "{{worklet}} captures '{{name}}' while '{{name}}' is still being set, so the worklet gets undefined. Don't refer to '{{name}}' inside its own value.",
      usedAbove:
        "'{{name}}' is a worklet, which the Babel plugin turns into a const that's only set where it's declared, further down the file, so it's undefined here. Move '{{name}}' above this line.",
    },
  },

  create(context) {
    const { sourceCode } = context;
    const program = sourceCode.ast as ESTree.Program;
    const fileWorklets = workletFileFunctions(program);
    const isWorklet = (node: ESTree.Function) => fileWorklets.has(node) || directives(node).includes('worklet');

    function check(node: FunctionNode): void {
      if (!isWorklet(node) || !runsAtLoad(node)) return;
      // The plugin captures nothing for these, outside its bundle mode.
      if (directives(node).includes('no-worklet-closure')) return;
      const [start] = range(node);
      const reported = new Set<Scope.Variable>();

      // `through` holds every reference in the function and the functions nested in it that isn't
      // resolved inside them, which is the same set the Babel plugin captures.
      for (const reference of sourceCode.getScope(node).through) {
        const variable = reference.resolved;
        if (!variable || reported.has(variable) || !isModuleVariable(variable)) continue;
        // The plugin doesn't capture a named worklet's references to itself.
        if (variable.defs.some((def) => def.node === node)) continue;
        // JSX names aren't captured by the plugin outside its bundle mode.
        const identifier = reference.identifier;
        if (identifier.type === 'JSXIdentifier' || isInTypePosition(identifier, node)) continue;

        const ready = readyAt(variable, isWorklet);
        if (ready === undefined || ready <= start) continue;

        reported.add(variable);
        const self = variable.defs.some((def) => contains(def.node, node));
        context.report({
          node: identifier,
          messageId: self ? 'self' : 'later',
          data: { worklet: describe(node), name: variable.name },
        });
      }
    }

    // A worklet function declaration loses its hoisting, so module-level code above it that uses
    // it, outside any function, reads it before it's set.
    function checkUsesAbove(): void {
      const globalScope = sourceCode.getScope(program);
      const scopes = [globalScope, ...globalScope.childScopes.filter((scope) => scope.block === program)];
      for (const variable of scopes.flatMap((scope) => scope.variables)) {
        const declaration = variable.defs.find(
          (def) => def.node.type === 'FunctionDeclaration' && !isAmbient(def) && isWorklet(def.node),
        )?.node;
        if (!declaration) continue;
        const [declared] = range(declaration);
        for (const reference of variable.references) {
          // JSX names are identifiers too; ESLint's types just don't say so.
          const node = reference.identifier as Rule.Node;
          if (range(node)[0] >= declared) continue;
          // An export list only links the binding; it doesn't read it.
          if (node.parent?.type === 'ExportSpecifier' || isInTypePosition(node, program)) continue;
          if (!runsAtLoad(node)) continue;
          context.report({ node, messageId: 'usedAbove', data: { name: variable.name } });
          break;
        }
      }
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
      'Program:exit': checkUsesAbove,
    };
  },
};

function directives(node: ESTree.Function): string[] {
  const found: string[] = [];
  if (node.body.type !== 'BlockStatement') return found;
  for (const statement of node.body.body) {
    if (statement.type !== 'ExpressionStatement' || !('directive' in statement)) break;
    found.push((statement as ESTree.Directive).directive);
  }
  return found;
}

/**
 * In a file whose prologue has 'worklet', the plugin workletizes every top-level function, exported
 * or not, every function a top-level variable is initialized with, and the methods and function
 * values of top-level object literals. Classes become worklet classes, which this rule leaves alone.
 */
function workletFileFunctions(program: ESTree.Program): Set<unknown> {
  const found = new Set<unknown>();
  let isWorkletFile = false;
  for (const statement of program.body) {
    if (statement.type !== 'ExpressionStatement' || !('directive' in statement)) break;
    if (statement.directive === 'worklet') isWorkletFile = true;
  }
  if (!isWorkletFile) return found;

  type Visitable = ESTree.Node | ESTree.MaybeNamedFunctionDeclaration | ESTree.MaybeNamedClassDeclaration;
  const visit = (node: Visitable | null | undefined): void => {
    if (!node) return;
    if (node.type === 'FunctionDeclaration' || node.type.endsWith('FunctionExpression')) {
      found.add(node);
    } else if (node.type === 'ObjectExpression') {
      for (const property of node.properties) if (property.type === 'Property') visit(property.value);
    }
  };
  for (const statement of program.body) {
    const exported = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration';
    const target = exported ? statement.declaration : statement;
    if (target?.type === 'VariableDeclaration') {
      for (const declarator of target.declarations) visit(declarator.init);
    } else if (target?.type === 'FunctionDeclaration' || statement.type === 'ExportDefaultDeclaration') {
      visit(target);
    }
  }
  return found;
}

/**
 * Runs while the module loads. Not inside a function, which runs when it's called. Not in a
 * non-static class member: the plugin turns worklet methods into instance fields, and instance
 * fields run per instance. Static fields and static blocks run when the class is defined.
 */
function runsAtLoad(node: Rule.Node): boolean {
  for (let parent = node.parent; parent && parent.type !== 'Program'; parent = parent.parent) {
    const type: string = parent.type;
    if (type.endsWith('FunctionExpression') || type === 'FunctionDeclaration' || type === 'MethodDefinition') {
      return false;
    }
    if ((type === 'PropertyDefinition' || type === 'AccessorProperty') && !(parent as { static?: boolean }).static) {
      return false;
    }
  }
  return true;
}

function isModuleVariable(variable: Scope.Variable): boolean {
  // Covers modules, scripts and CommonJS. Variables with no definition are configured globals,
  // which exist before any code runs.
  return variable.scope.block.type === 'Program' && variable.defs.length > 0;
}

/** Where in the source the variable first holds its value, or undefined when it always does. */
function readyAt(variable: Scope.Variable, isWorklet: (node: ESTree.Function) => boolean): number | undefined {
  let ready: number | undefined;
  for (const def of variable.defs) {
    // Imports are set before any code runs, and ambient declarations are erased.
    if (def.type === 'ImportBinding' || isAmbient(def)) return undefined;
    // A function declaration is hoisted with its value, unless it's a worklet: the Babel plugin
    // turns those into `const name = factory(...)`, which isn't set until that line runs.
    if (def.type === 'FunctionName' && def.node.type === 'FunctionDeclaration' && !isWorklet(def.node)) {
      return undefined;
    }
    const [, end] = range(def.node);
    if (ready === undefined || end < ready) ready = end;
  }
  return ready;
}

/** `declare const`, `declare function` and the rest: types only, gone at run time. */
function isAmbient(def: Scope.Definition): boolean {
  return Boolean((def.node as { declare?: boolean }).declare || (def.parent as { declare?: boolean } | null)?.declare);
}

function isInTypePosition(identifier: ESTree.Node, until: ESTree.Node): boolean {
  for (let node: Rule.Node | null = (identifier as Rule.Node).parent; node && node !== until; node = node.parent) {
    if (TYPE_POSITIONS.has(node.type)) return true;
  }
  return false;
}

// ESLint always sets range on the nodes it passes to rules.
function range(node: ESTree.Node): [number, number] {
  return node.range as [number, number];
}

function contains(outer: ESTree.Node, inner: ESTree.Node): boolean {
  const [a, b] = range(outer);
  const [c, d] = range(inner);
  return a <= c && d <= b;
}

function describe(node: FunctionNode): string {
  if (node.type !== 'ArrowFunctionExpression' && node.id) return `Worklet '${node.id.name}'`;
  const parent = node.parent;
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return `Worklet '${parent.id.name}'`;
  if ((parent.type === 'Property' || parent.type === 'PropertyDefinition') && parent.key.type === 'Identifier') {
    return `Worklet '${parent.key.name}'`;
  }
  return 'This worklet';
}
