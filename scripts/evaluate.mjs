// Offline scoring of human-reviewed results. Never calls a model or uploads an image.
import { readFile } from 'node:fs/promises';
const input = process.argv[2];
if (!input) { console.log('Usage: node scripts/evaluate.mjs evaluation/private/reviews.jsonl\nSee evaluation/README.md for the review format. No API calls are made.'); process.exit(0); }
const dimensions = ['pose', 'species', 'composition', 'palette', 'anatomy', 'story'];
const groups = new Map();
const records = (await readFile(input, 'utf8')).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
for (const record of records) {
  if (!record.caseId || !record.promptVersion || dimensions.some(key => !Number.isInteger(record[key]) || record[key] < 1 || record[key] > 5))
    throw new Error('Every review needs caseId, promptVersion, and six integer scores from 1 to 5.');
  const group = groups.get(record.promptVersion) ?? { count: 0, totals: Object.fromEntries(dimensions.map(d => [d, 0])), seconds: [], cost: 0 };
  group.count++;
  for (const dimension of dimensions) group.totals[dimension] += record[dimension];
  if (Number.isFinite(record.seconds) && record.seconds >= 0) group.seconds.push(record.seconds);
  if (Number.isFinite(record.costUsd) && record.costUsd >= 0) group.cost += record.costUsd;
  groups.set(record.promptVersion, group);
}
console.log(JSON.stringify([...groups].map(([version, group]) => ({ version, reviewedResults: group.count,
  averages: Object.fromEntries(dimensions.map(key => [key, +(group.totals[key] / group.count).toFixed(2)])),
  meanSeconds: group.seconds.length ? +(group.seconds.reduce((a,b) => a+b, 0) / group.seconds.length).toFixed(1) : null,
  recordedCostUsd: +group.cost.toFixed(4), note: 'Human review scores; these are not scientific resemblance or emotion measurements.'
})), null, 2));
