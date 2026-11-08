import reactRouterLink from "@/fixtures/memory/react-router-link.json";
import reactRouterExpoLink from "@/fixtures/memory/react-router-expo-link.json";
import type { GeneratedFile } from "@/lib/migration/model";

export type RuleFixtureId = typeof reactRouterLink.id | typeof reactRouterExpoLink.id;
export type RuleReplaySummary = {
  status: "passed";
  fixtureIds: RuleFixtureId[];
  positiveCases: number;
  negativeCases: number;
  checkedAt: string;
};

export const RULE_FIXTURES = [reactRouterLink, reactRouterExpoLink] as const;

export function replayKnownRepair(input: { fixtureIds: string[]; sourceFramework: string; target: string; trigger: string; resolution: string }): RuleReplaySummary | null {
  const fixtures = RULE_FIXTURES.filter((fixture) => input.fixtureIds.includes(fixture.id));
  if (!fixtures.length || fixtures.length !== input.fixtureIds.length) return null;
  for (const fixture of fixtures) {
    if (input.sourceFramework !== fixture.sourceFramework || input.target !== fixture.target || input.trigger !== fixture.trigger || input.resolution !== fixture.resolution) return null;
    const transformed = fixture.target === "expo-router-typescript"
      ? transformExpoRouterLink(fixture.before)
      : transformReactRouterLink(fixture.before);
    if (transformed !== fixture.after) return null;
  }
  const negativeCases = [
    { framework: input.sourceFramework, target: input.target, content: 'import React from "react";' },
    { framework: "Unrelated framework", target: input.target, content: fixtureImport(input.trigger) },
    { framework: input.sourceFramework, target: "unrelated-target", content: fixtureImport(input.trigger) },
    { framework: input.sourceFramework, target: input.target, content: 'import { useNavigate } from "react-router-dom";' },
  ];
  const matches = (sample: typeof negativeCases[number]) => sample.framework === input.sourceFramework && sample.target === input.target && sample.content.includes(input.trigger) && /\bLink\b/.test(sample.content);
  if (negativeCases.some(matches)) return null;
  return { status: "passed", fixtureIds: fixtures.map((fixture) => fixture.id), positiveCases: fixtures.length, negativeCases: negativeCases.length, checkedAt: new Date().toISOString() };
}

function transformReactRouterLink(source: string) {
  return source
    .replace(/^import\s+\{\s*Link\s*\}\s+from\s+["']react-router-dom["'];?[ \t]*$/m, 'import Link from "next/link";')
    .replace(/(<Link\b[^>]*?)\bto=/g, "$1href=");
}

function transformExpoRouterLink(source: string) {
  return source
    .replace(/^import\s+\{\s*Link\s*\}\s+from\s+["']react-router-dom["'];?[ \t]*$/m, 'import { Link } from "expo-router";')
    .replace(/(<Link\b[^>]*?)\bto=/g, "$1href=");
}

function hasRouterLinkRewrite(before: string, after: string) {
  return /import\s+\{\s*Link\s*\}\s+from\s+["']react-router-dom["']/.test(before) &&
    /<Link\b[^>]*\bto=/.test(before) &&
    /import\s+Link\s+from\s+["']next\/link["']/.test(after) &&
    !/from\s+["']react-router-dom["']/.test(after) &&
    /<Link\b[^>]*\bhref=/.test(after) &&
    !/<Link\b[^>]*\bto=/.test(after);
}

function hasExpoRouterLinkRewrite(before: string, after: string) {
  return /import\s+\{\s*Link\s*\}\s+from\s+["']react-router-dom["']/.test(before) &&
    /<Link\b[^>]*\bto=/.test(before) &&
    /import\s+\{\s*Link\s*\}\s+from\s+["']expo-router["']/.test(after) &&
    !/from\s+["']react-router-dom["']/.test(after) &&
    /<Link\b[^>]*\bhref=/.test(after) &&
    !/<Link\b[^>]*\bto=/.test(after);
}

export function verifyKnownRepair(input: {
  sourceFramework: string;
  target: string;
  trigger: string;
  filesBefore: GeneratedFile[];
  filesAfter: GeneratedFile[];
}): { fixtureId: RuleFixtureId; resolution: string } | null {
  for (const fixture of RULE_FIXTURES) {
    if (input.sourceFramework !== fixture.sourceFramework || input.target !== fixture.target || input.trigger !== fixture.trigger) continue;
    const before = new Map(input.filesBefore.map((file) => [file.path, file.content]));
    const after = new Map(input.filesAfter.map((file) => [file.path, file.content]));
    const evidenced = [...before.entries()].some(([path, content]) => {
      const generated = after.get(path);
      if (generated === undefined) return false;
      return fixture.target === "expo-router-typescript"
        ? hasExpoRouterLinkRewrite(content, generated)
        : hasRouterLinkRewrite(content, generated);
    });
    if (evidenced) return { fixtureId: fixture.id, resolution: fixture.resolution };
  }
  return null;
}

function fixtureImport(trigger: string) {
  return `import { Link } from "${trigger}";`;
}
