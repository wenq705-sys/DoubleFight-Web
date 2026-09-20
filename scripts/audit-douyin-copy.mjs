import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const files = [
  'platform/douyin/src/soloScene.ts',
  'platform/douyin/src/m212ProductPass.ts',
  'platform/douyin/src/m212RetentionHub.ts',
  'platform/douyin/src/social.ts',
  'src/meta/productMeta.ts',
  'src/config/themes.ts',
  'shared/battle/match.ts',
];

const uiCalls = new Map([
  ['fillText', [0]],
  ['drawPillButton', [2]],
  ['drawPremiumButton', [2]],
  ['actionCard', [2, 3]],
  ['drawSettingRow', [2]],
]);
const objectCopyKeys = new Set(['rankTitle', 'suffix', 'title', 'desc', 'text', 'label', 'subtitle']);
const latin = /[A-Za-z]/;

function staticText(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (!ts.isTemplateExpression(node)) return null;
  return node.head.text + node.templateSpans.map(span => span.literal.text).join('');
}
function callName(node) {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return '';
}

const failures = [];
for (const file of files) {
  const sourceText = readFileSync(resolve(file), 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const add = (node, text) => {
    if (!text || !latin.test(text)) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    failures.push(`${file}:${line}: ${JSON.stringify(text)}`);
  };

  const visit = node => {
    if (ts.isCallExpression(node)) {
      for (const index of uiCalls.get(callName(node)) ?? []) {
        const arg = node.arguments[index];
        if (arg) add(arg, staticText(arg));
      }
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)
      && objectCopyKeys.has(node.name.text)) {
      add(node.initializer, staticText(node.initializer));
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && node.left.name.text === 'themeUnlockMessage') {
      add(node.right, staticText(node.right));
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text.endsWith('LABEL') && node.initializer) {
      add(node.initializer, staticText(node.initializer));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const hardBans = ['S币', 'Solo 周榜', ' RP'];
const joined = files.map(file => readFileSync(resolve(file), 'utf8')).join('\n');
for (const term of hardBans) {
  if (joined.includes(term)) failures.push(`forbidden review term: ${term}`);
}

if (failures.length) {
  console.error('Douyin review-facing copy audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Douyin review-facing copy audit: PASS');
