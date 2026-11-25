// Checked by tsc, never run: fails the type check if the plugin's exported shape changes.
import type { ESLint, Linter, Rule } from 'eslint';
import { expectTypeOf } from 'expect-type';
import plugin from '../src/index.ts';

expectTypeOf(plugin.meta).toEqualTypeOf<{ name: string; version: string }>();
expectTypeOf(plugin.rules).toEqualTypeOf<{ 'no-capture-before-define': Rule.RuleModule }>();
expectTypeOf(plugin.configs).toEqualTypeOf<{ recommended: Linter.Config }>();
expectTypeOf(plugin).toExtend<ESLint.Plugin>();
expectTypeOf([plugin.configs.recommended]).toExtend<Linter.Config[]>();
