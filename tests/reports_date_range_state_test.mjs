import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath = new URL('../pharma-frontend/js/modules/reports.js', import.meta.url);
const source = fs.readFileSync(modulePath, 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `shared report module must define ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to read ${name}`);
}

const periods = ['today', 'yesterday', '7', '30', 'month', 'custom'];
const buttons = periods.map((period) => ({
  dataset: { period },
  active: false,
  attributes: {},
  classList: { toggle(name, force) { if (name === 'active') this.button.active = Boolean(force); }, button: null },
  setAttribute(name, value) { this.attributes[name] = value; },
}));
for (const button of buttons) button.classList.button = button;
const state = { period: '30', category: 'sales' };
const expandedCalls = [];
const qs = (selector) => selector === '.report-presets'
  ? { querySelectorAll: () => buttons }
  : selector === '[name="report_view"]'
    ? { value: 'Sales Summary' }
    : null;
const setPeriodSelection = new Function('state', 'qs', 'setFilterExpanded', `${extractFunction('setPeriodSelection')}; return setPeriodSelection;`)(state, qs, (expanded) => expandedCalls.push(expanded));

for (const period of periods) {
  expandedCalls.length = 0;
  setPeriodSelection(period);
  assert.equal(state.period, period);
  assert.deepEqual(buttons.filter((button) => button.active).map((button) => button.dataset.period), [period]);
  assert.equal(buttons.find((button) => button.dataset.period === period).attributes['aria-pressed'], 'true');
  assert.deepEqual(expandedCalls, [period === 'custom']);
}

for (const page of ['reports.html', 'sales_clerk_reports.html']) {
  const html = fs.readFileSync(new URL(`../pharma-frontend/${page}`, import.meta.url), 'utf8');
  assert.match(html, /js\/modules\/reports\.js\?v=63/, `${page} must use the shared report module`);
  assert.match(html, /data-period="custom"/, `${page} must expose the Custom range button`);
}

const presetHandler = source.slice(source.indexOf("qs('.report-presets')"));
const customBranch = presetHandler.match(/if\(period==='custom'\)\{[^}]+\}/)?.[0] ?? '';
assert.ok(extractFunction('updateVisibleFilters').includes("state.period!=='custom'"), 'Custom must show the date controls');
assert.ok(extractFunction('setFilterExpanded').includes("classList.toggle('is-collapsed',!expanded)"), 'Custom must expand the filter form');
assert.ok(customBranch.includes("setPeriodSelection('custom')"), 'Custom must immediately select itself');
assert.ok(customBranch.includes('updateVisibleFilters()'), 'Custom must refresh the visible date controls');
assert.ok(!customBranch.includes('.focus()'), 'Custom must not focus or select a date input automatically');
assert.ok(!customBranch.includes('loadReport()'), 'Choosing Custom alone must not apply the report');

const loadStart = source.indexOf('async function loadReport()');
const loadEnd = source.indexOf('function syncUrl()', loadStart);
const loadReport = source.slice(loadStart, loadEnd);
assert.ok(loadReport.indexOf('startDate>endDate') >= 0 && loadReport.indexOf('startDate>endDate') < loadReport.indexOf('fetch('), 'Invalid date ranges must be rejected before fetching');
assert.ok(loadReport.includes('Start date cannot be after end date.'), 'Invalid ranges must show a validation message');

console.log('Reports date-range state tests passed for all presets, Custom, both shared pages, and invalid-range validation.');