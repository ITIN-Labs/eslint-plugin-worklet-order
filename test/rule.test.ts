import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';
import plugin from '../src/index.ts';
import { jsCases, tsCases } from './cases.ts';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rule = plugin.rules['no-capture-before-define'];

new RuleTester().run('no-capture-before-define', rule, jsCases);
new RuleTester().run('no-capture-before-define (TypeScript)', rule, tsCases);
