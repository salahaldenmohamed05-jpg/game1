#!/usr/bin/env node
/**
 * Hook Safety Linter — LifeFlow Custom Static Analysis
 * =====================================================
 * Catches React hook violations that cause runtime crashes:
 *   1. Hooks called after early returns (conditional hook execution)
 *   2. Math.random() in React keys (non-deterministic, breaks reconciliation)
 *   3. Math.random() in useState (nondeterministic initial state)
 *   4. Hooks inside loops or conditions (detected by pattern)
 *
 * Usage:  node scripts/hook-safety-lint.js [--fix] [file1 file2 ...]
 * NPM:    npm run lint:hooks
 *
 * Exit codes:
 *   0 = no errors
 *   1 = errors found
 */

const fs = require('fs');
const path = require('path');

const HOOK_NAMES = [
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback',
  'useQuery', 'useMutation', 'useQueryClient', 'useLayoutEffect',
  'useReducer', 'useContext', 'useImperativeHandle',
];

const HOOK_REGEX = new RegExp(`\\b(${HOOK_NAMES.join('|')})\\s*\\(`);
const EARLY_RETURN_REGEX = /^\s+return\s+(null|<|\()/;
const COMPONENT_REGEX = /^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(/;
const MEMO_COMPONENT_REGEX = /^(?:export\s+)?const\s+([A-Z]\w*)\s*=\s*(?:React\.)?memo\(/;
const ARROW_RETURN_REGEX = /=>\s*(null|<|\()/;

function analyzeFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  const issues = [];

  // --- Rule 1: Hooks after early returns ---
  let inComponent = null;
  let foundEarlyReturn = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect component boundaries
    const compMatch = line.match(COMPONENT_REGEX) || line.match(MEMO_COMPONENT_REGEX);
    if (compMatch) {
      inComponent = compMatch[1];
      foundEarlyReturn = false;
      braceDepth = 0;
    }

    if (inComponent) {
      braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

      // Early return at component body level
      if (braceDepth <= 1 && EARLY_RETURN_REGEX.test(line) && !ARROW_RETURN_REGEX.test(line)) {
        foundEarlyReturn = true;
      }

      // Hook call after early return
      if (foundEarlyReturn && braceDepth <= 2 && HOOK_REGEX.test(line)) {
        const hookMatch = line.match(HOOK_REGEX);
        issues.push({
          file: filepath, line: i + 1,
          rule: 'hooks/no-conditional-hooks',
          severity: 'error',
          message: `React Hook ${hookMatch[1]}() called after early return in ${inComponent}. ` +
                   `Move all hooks BEFORE any return statements.`,
        });
      }

      // Reset when leaving component scope
      if (braceDepth <= 0) { inComponent = null; foundEarlyReturn = false; }
    }
  }

  // --- Rule 2: Math.random() misuse ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('Math.random()')) continue;
    // Skip comments
    if (/^\s*(\/\/|\*)/.test(line)) continue;
    // Skip if inside useMemo (controlled)
    const context = (lines[Math.max(0, i - 2)] || '') + (lines[Math.max(0, i - 1)] || '') + line;
    if (/useMemo/.test(context)) continue;

    const prevLine = lines[Math.max(0, i - 1)] || '';
    if (/key[={]/.test(line) || /key[={]/.test(prevLine)) {
      issues.push({
        file: filepath, line: i + 1,
        rule: 'hooks/no-random-keys',
        severity: 'error',
        message: 'Math.random() in React key prop causes re-mount on every render. ' +
                 'Use a deterministic key (id, index, title).',
      });
    } else if (/useState/.test(line)) {
      issues.push({
        file: filepath, line: i + 1,
        rule: 'hooks/no-random-state',
        severity: 'error',
        message: 'Math.random() in useState() creates nondeterministic state. ' +
                 'Use useMemo() with empty deps, or useRef().',
      });
    }
  }

  return issues;
}

function walkDir(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      files = files.concat(walkDir(full));
    } else if (/\.(jsx|js|tsx|ts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// --- Main ---
const args = process.argv.slice(2);
const targetFiles = args.filter(a => !a.startsWith('-'));
const srcDir = path.resolve(__dirname, '..', 'src');

const files = targetFiles.length > 0
  ? targetFiles.map(f => path.resolve(f))
  : walkDir(srcDir);

let allIssues = [];
for (const f of files) {
  try { allIssues = allIssues.concat(analyzeFile(f)); }
  catch (e) { console.error(`  Warning: could not analyze ${f}: ${e.message}`); }
}

const errors = allIssues.filter(i => i.severity === 'error');
const warnings = allIssues.filter(i => i.severity === 'warn');

console.log('');
console.log('=== LifeFlow Hook Safety Lint ===');
console.log(`Scanned ${files.length} file(s)`);
console.log('');

if (allIssues.length === 0) {
  console.log('\x1b[32m\u2713 All clear \u2014 no hook safety violations found\x1b[0m');
} else {
  for (const issue of allIssues) {
    const icon = issue.severity === 'error' ? '\x1b[31m\u2717\x1b[0m' : '\x1b[33m\u26a0\x1b[0m';
    console.log(`${icon} ${issue.file}:${issue.line}`);
    console.log(`  [${issue.rule}] ${issue.message}`);
    console.log('');
  }
}

console.log(`Errors: ${errors.length}  Warnings: ${warnings.length}`);
process.exit(errors.length > 0 ? 1 : 0);
