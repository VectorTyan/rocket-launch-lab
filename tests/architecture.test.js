import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Public parser export, pinned as a direct development dependency for these checks.
// Parsing source does not execute browser/rendering code or require a DOM.
import { parseAst } from 'rollup/parseAst';

const SOURCE_ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const DOMAIN_MODULES = new Set([
  'assembly-state.js',
  'fleet-data.js',
  'fleet-simulation.js',
  'simulation.js',
  'mission-timeline.js',
  'interior-data.js',
  'studio-themes.js',
  'module-narration.js',
]);
const JS_EXTENSION = /\.(?:mjs|cjs|js)$/i;
const BROWSER_GLOBALS = new Set([
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'Element',
  'Document',
  'DOMParser',
  'MutationObserver',
  'ResizeObserver',
  'customElements',
  'location',
  'history',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'Audio',
  'AudioContext',
  'speechSynthesis',
  'Image',
]);
const DOM_MEMBERS = new Set([
  'createElement',
  'createElementNS',
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'appendChild',
  'removeChild',
  'replaceChildren',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'insertAdjacentHTML',
  'innerHTML',
  'outerHTML',
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(filename) : JS_EXTENSION.test(entry.name) ? [filename] : [];
    })
    .sort();
}

function moduleId(filename) {
  return path.relative(SOURCE_ROOT, filename).split(path.sep).join('/');
}
function inLayer(id, layer) {
  return id.startsWith(`${layer}/`);
}
function isThree(specifier) {
  return /^(?:three(?:\/|$)|@react-three\/)/.test(specifier);
}
function isDomPackage(specifier) {
  return /^(?:jsdom|happy-dom|linkedom|react-dom)(?:\/|$)/.test(specifier);
}

function walk(node, visit, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent, key);
  for (const [childKey, value] of Object.entries(node)) {
    if (Array.isArray(value)) for (const child of value) walk(child, visit, node, childKey);
    else if (value && typeof value === 'object') walk(value, visit, node, childKey);
  }
}

function literalString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

function memberName(node) {
  return node.computed ? literalString(node.property) : node.property?.name;
}

function relativeTarget(filename, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  // Vite resource query strings do not form part of the filesystem path.
  const request = path.resolve(path.dirname(filename), specifier.split(/[?#]/, 1)[0]);
  const candidates = path.extname(request)
    ? [request]
    : [request, `${request}.js`, `${request}.mjs`, path.join(request, 'index.js')];
  return (
    candidates.find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    }) ?? null
  );
}

function markPattern(pattern, bindings) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') bindings.add(pattern);
  else if (pattern.type === 'RestElement') markPattern(pattern.argument, bindings);
  else if (pattern.type === 'AssignmentPattern') markPattern(pattern.left, bindings);
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((item) => markPattern(item, bindings));
  else if (pattern.type === 'ObjectPattern')
    pattern.properties.forEach((property) => {
      markPattern(property.type === 'RestElement' ? property.argument : property.value, bindings);
    });
}

function inspectModule(filename) {
  const source = readFileSync(filename, 'utf8');
  let ast;
  try {
    ast = parseAst(source);
  } catch (error) {
    throw new Error(`Cannot inspect src/${moduleId(filename)}: ${error.message}`, { cause: error });
  }
  const imports = [],
    dom = [],
    bindings = new WeakSet();
  const lineAt = (node) => source.slice(0, node.start).split('\n').length;
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator') markPattern(node.id, bindings);
    if (/Function(?:Declaration|Expression)$/.test(node.type) || node.type === 'ArrowFunctionExpression') {
      markPattern(node.id, bindings);
      node.params.forEach((parameter) => markPattern(parameter, bindings));
    }
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') markPattern(node.id, bindings);
    if (node.type === 'CatchClause') markPattern(node.param, bindings);
    if (node.type.startsWith('Import') && node.local) markPattern(node.local, bindings);
  });
  walk(ast, (node, parent, key) => {
    const isStatic =
      ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) &&
      node.source;
    const isDynamic = node.type === 'ImportExpression';
    const isRequire =
      node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require';
    if (isStatic || isDynamic || isRequire) {
      const specifier = literalString(isRequire ? node.arguments[0] : node.source);
      imports.push({
        specifier,
        static: Boolean(isStatic),
        line: lineAt(node),
        relative: specifier?.startsWith('./') || specifier?.startsWith('../') || false,
        target: specifier ? relativeTarget(filename, specifier) : null,
      });
    }
    if (node.type === 'Identifier' && BROWSER_GLOBALS.has(node.name) && !bindings.has(node)) {
      const isPropertyName =
        (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
        (['Property', 'PropertyDefinition', 'MethodDefinition'].includes(parent?.type) &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand);
      const isExportName = ['ExportSpecifier', 'ImportSpecifier'].includes(parent?.type);
      if (!isPropertyName && !isExportName) dom.push(`${node.name} at line ${lineAt(node)}`);
    }
    if (node.type === 'MemberExpression') {
      const name = memberName(node);
      const globalObject =
        node.object.type === 'Identifier' && ['globalThis', 'self'].includes(node.object.name);
      if (DOM_MEMBERS.has(name) || (globalObject && BROWSER_GLOBALS.has(name)))
        dom.push(`${name} at line ${lineAt(node)}`);
    }
  });
  return { filename, id: moduleId(filename), imports, dom: [...new Set(dom)] };
}

const modules = new Map(sourceFiles(SOURCE_ROOT).map((filename) => [filename, inspectModule(filename)]));
const byId = new Map([...modules.values()].map((module) => [module.id, module]));
// Existing top-level renderer facades remain renderers even before every file
// moves below rendering/. Infer that role from an actual direct Three import.
const rendererEntries = new Set(
  [...modules.values()]
    .filter(
      (module) => !module.id.includes('/') && module.imports.some((entry) => isThree(entry.specifier ?? '')),
    )
    .map((module) => module.id),
);
const isRendering = (id) => inLayer(id, 'rendering') || rendererEntries.has(id);

function violationPaths(start, forbiddenModule, forbiddenExternal = () => false, checkDom = false) {
  const issues = [],
    visited = new Set();
  function follow(current, chain) {
    if (visited.has(current.filename)) return;
    visited.add(current.filename);
    if (checkDom)
      issues.push(
        ...current.dom.map((reference) => `${chain.join(' -> ')}: browser DOM access ${reference}`),
      );
    for (const dependency of current.imports) {
      if (!dependency.specifier) {
        issues.push(
          `${chain.join(' -> ')}:${dependency.line} uses a computed module request; this boundary cannot be checked statically`,
        );
        continue;
      }
      const nextChain = [
        ...chain,
        dependency.relative && dependency.target ? moduleId(dependency.target) : dependency.specifier,
      ];
      if (dependency.target && modules.has(dependency.target)) {
        const next = modules.get(dependency.target);
        if (forbiddenModule(next.id)) issues.push(nextChain.join(' -> '));
        else follow(next, nextChain);
      } else if (!dependency.relative && forbiddenExternal(dependency.specifier))
        issues.push(nextChain.join(' -> '));
    }
  }
  follow(start, [start.id]);
  return issues;
}

function assertNoIssues(issues, explanation) {
  assert.deepEqual(issues, [], `${explanation}\n${issues.map((issue) => `  ${issue}`).join('\n')}`);
}

test('every relative static source import and re-export resolves to an existing module or asset', () => {
  const missing = [];
  for (const module of modules.values())
    for (const dependency of module.imports) {
      if (dependency.static && dependency.relative && !dependency.target)
        missing.push(`${module.id}:${dependency.line} -> ${dependency.specifier}`);
    }
  assertNoIssues(missing, 'Broken relative imports must be fixed at their owning module.');
});

test('the source static ES-module dependency graph contains no cycles', () => {
  const visited = new Set(),
    active = new Set(),
    cycles = [];
  function follow(module, chain) {
    if (active.has(module.filename)) {
      const start = chain.indexOf(module.id);
      cycles.push([...chain.slice(start), module.id].join(' -> '));
      return;
    }
    if (visited.has(module.filename)) return;
    active.add(module.filename);
    for (const dependency of module.imports) {
      if (dependency.static && dependency.target && modules.has(dependency.target))
        follow(modules.get(dependency.target), [...chain, module.id]);
    }
    active.delete(module.filename);
    visited.add(module.filename);
  }
  for (const module of modules.values()) follow(module, []);
  assertNoIssues(
    [...new Set(cycles)],
    'A new static dependency cycle needs an explicit architectural decision, not an automatic exception.',
  );
});

test('pure UI templates depend on data/formatting rather than application, features, rendering or Three', () => {
  const issues = [];
  for (const module of modules.values())
    if (inLayer(module.id, 'ui')) {
      issues.push(
        ...violationPaths(
          module,
          (id) => inLayer(id, 'app') || inLayer(id, 'features') || isRendering(id),
          (specifier) => isThree(specifier) || isDomPackage(specifier),
          true,
        ),
      );
    }
  assertNoIssues(
    issues,
    'The UI layer renders strings from explicit data and must remain usable without browser or renderer objects.',
  );
});

test('features communicate through injected scene ports instead of importing concrete rendering code', () => {
  const issues = [];
  for (const module of modules.values())
    if (inLayer(module.id, 'features')) {
      // Shared app lifecycle helpers and pure UI formatting are deliberately legal;
      // crossing into the Three implementation, even through a helper, is not.
      issues.push(...violationPaths(module, isRendering, isThree));
    }
  assertNoIssues(
    issues,
    'Inject scene operations through feature context/ports instead of importing the scene implementation.',
  );
});

test('rendering internals and their public facades do not depend back on app, features or UI', () => {
  const issues = [];
  for (const module of modules.values())
    if (isRendering(module.id)) {
      issues.push(
        ...violationPaths(module, (id) => ['app', 'features', 'ui'].some((layer) => inLayer(id, layer))),
      );
    }
  assertNoIssues(
    issues,
    'Rendering may consume domain data and callbacks, but must not own application or HTML feature flows.',
  );
});

test('domain data, assembly rules and mission timing remain independent of UI, browser DOM and Three', () => {
  const issues = [];
  for (const id of DOMAIN_MODULES) {
    const module = byId.get(id);
    assert.ok(module, `Domain boundary declaration needs updating after moving ${id}.`);
    issues.push(
      ...violationPaths(
        module,
        (dependency) =>
          ['app', 'features', 'ui'].some((layer) => inLayer(dependency, layer)) || isRendering(dependency),
        (specifier) => isThree(specifier) || isDomPackage(specifier),
        true,
      ),
    );
  }
  assertNoIssues(
    issues,
    'Domain logic must be reusable in Node tests without DOM or graphics implementations.',
  );
});
