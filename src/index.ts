import { createRequire } from 'node:module';
import type { Linter, Rule } from 'eslint';
import { rule } from './rule.ts';

// From dist/index.js (and src/index.ts in this repo's tests) the package.json is one level up.
const { name, version } = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

interface Plugin {
  meta: { name: string; version: string };
  rules: { 'no-capture-before-define': Rule.RuleModule };
  configs: { recommended: Linter.Config };
}

const plugin: Plugin = {
  meta: { name, version },
  rules: { 'no-capture-before-define': rule },
  configs: {
    recommended: {
      name: 'worklet-order/recommended',
      rules: { 'worklet-order/no-capture-before-define': 'error' },
    },
  },
};
// The config refers back to the plugin, so it's added once the plugin exists.
plugin.configs.recommended.plugins = { 'worklet-order': plugin };

export default plugin;
