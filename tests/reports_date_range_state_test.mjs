import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath = new URL('../pharma-frontend/js/modules/reports.js', import.meta.url);
const source = fs.readFileSync(modulePath, 'utf8');
const helperLine = source.split(/\r?\n/).find((line) => line.startsWith('function setPeriodSelection('));
assert.ok(helperLine, 'shared report module must define the shared period selection helper');

const periods = ['today', 'yesterday', '7', '30', 'month', 'custom'];
const buttons = periods.map((period) => ({
  dataset: { period },
  active: false,
  attributes: {},
  classList: { toggle(name, force) { if (name === 'active') this.button.active = Boolean(force); }, button: null },
  setAttribute(name, value) { this.attributes[name] = value; },
}));
for (const button of buttons) button.classList.button = button;
const state = { period: '30' };
const qs = (selector) => selector === '.report-presets'
  ? { querySelectorAll: () => buttons }
  : null;
const setPeriodSelection = new Function('state', 'qs', `${helperLine}; return setPeriodSelection;`)(state, qs);

for (const period of periods) {
  setPeriodSelection(period);
  assert.equal(state.period, period);
  assert.deepEqual(buttons.filter((button) => button.active).map((button) => button.dataset.period), [period]);
  assert.equal(buttons.find((button) => button.dataset.period === period).attributes['aria-pressed'], 'true');
}

for (const page of ['reports.html', 'sales_clerk_reports.html']) {
  const html = fs.readFileSync(new URL(`../pharma-frontend/${page}`, import.meta.url), 'utf8');
  assert.match(html, /js\/modules\/reports\.js\?v=28/, `${page} must use the shared report module`);
  assert.match(html, /data-period="custom"/, `${page} must expose the Custom range button`);
}

const customBranch = source.match(/if\(period==='custom'\)\{[^}]+\}/)?.[0] ?? '';
assert.ok(customBranch.includes("closest('[data-filter]').hidden=false"), 'Custom must show the date controls');
assert.ok(customBranch.includes("classList.remove('is-collapsed')"), 'Custom must expand the filter form');
assert.ok(customBranch.includes("setPeriodSelection('custom')"), 'Custom must immediately select itself');
assert.ok(!customBranch.includes('.focus()'), 'Custom must not focus or select a date input automatically');
assert.ok(!customBranch.includes('loadReport()'), 'Choosing Custom alone must not apply the report');

const loadStart = source.indexOf('async function loadReport()');
const loadEnd = source.indexOf('function syncUrl()', loadStart);
const loadReport = source.slice(loadStart, loadEnd);
assert.ok(loadReport.indexOf('startDate>endDate') >= 0 && loadReport.indexOf('startDate>endDate') < loadReport.indexOf('fetch('), 'Invalid date ranges must be rejected before fetching');
assert.ok(loadReport.includes('Start date cannot be after end date.'), 'Invalid ranges must show a validation message');

console.log('Reports date-range state tests passed for all presets, Custom, both shared pages, and invalid-range validation.');