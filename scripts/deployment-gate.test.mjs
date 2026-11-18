import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const yaml = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
const gate = yaml.match(/  deploy:\n    needs: build\n    if: (.+)/)[1];
const summary = yaml.match(/- name: Deployment status\n        if: (.+)/)[1];
for (const event of ['schedule', 'workflow_dispatch']) {
  for (const enabled of ['', 'false', 'true']) {
    for (const deploy of [false, true]) {
      for (const ref of ['refs/heads/main', 'refs/heads/test']) {
        test(`${event}, enabled=${enabled || 'unset'}, deploy=${deploy}, ${ref}`, () => {
          const context = { github: { event_name: event, ref }, vars: { DEPLOY_ENABLED: enabled }, inputs: { deploy } };
          const expected = ref === 'refs/heads/main' && (event === 'schedule' ? enabled === 'true' : deploy);
          assert.equal(runInNewContext(gate, context), expected);
          assert.equal(runInNewContext(summary, context), !expected);
        });
      }
    }
  }
}
