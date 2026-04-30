import { GoogleGenerativeAI } from '@google/generative-ai';
import { detectProjectType } from './tickets';
import fs from 'fs';
import path from 'path';

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local');
  return new GoogleGenerativeAI(key);
}

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch {
    return '';
  }
}

function buildDevelopmentGuidelinesContext(): string {
  const baseDir = path.resolve(process.cwd(), 'lib', 'development guidelines');
  if (!fs.existsSync(baseDir)) return '(development guidelines not found)';

  const sections: string[] = [];

  function visit(dir: string, relativePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(dir, entry.name);
      const rel = relativePath ? path.join(relativePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        visit(entryPath, rel);
      } else if (entry.isFile()) {
        const content = readTextFile(entryPath);
        if (!content) continue;
        sections.push(`### ${rel}\n\n${content}`);
      }
    }
  }

  visit(baseDir);
  return sections.length > 0
    ? sections.join('\n\n')
    : '(development guidelines directory is empty)';
}

// ── Project type detection ────────────────────────────────────────────────────

function getProjectType(): string {
  const base = process.env.APP_BASE_PATH ?? '../app';
  const appPath = path.isAbsolute(base) ? base : path.resolve(process.cwd(), base);
  try {
    return detectProjectType(appPath);
  } catch {
    return 'Unknown';
  }
}

// ── Architect Phase ───────────────────────────────────────────────────────────

function buildArchitectPrompt(projectType: string): string {
  const isApple = projectType.includes('Xcode') || projectType.includes('Swift');

  const languageGuidance = isApple ? `
## Platform Context
This is an **${projectType}** project. Your plan must:
- Reference Swift files, UIKit/SwiftUI views, and Apple frameworks by their correct names
- Follow Swift naming conventions (camelCase for variables/functions, PascalCase for types)
- Specify which Swift files to create or modify with their full relative paths
- Note any required changes to the Xcode project (new targets, capabilities, entitlements, Info.plist keys)
- Mention any SPM (Swift Package Manager) or CocoaPods dependencies to add
- Include UI test and unit test steps using XCTest where applicable
- Flag any simulator vs. device-only APIs (e.g. HealthKit, ARKit, push notifications)
- Use the skills available in the provided Development Guidelines section below, including AGENTS.md. Build the instructions so the development is aligned with best practices. SwiftData, SwiftUI and SwiftTesting should be used as source for development practices.
- The file swiftlint_main_github.yml should be used as source for linting rules, and the implementation plan should ensure that all new code adheres to those rules so that the PR passes linting checks.
` : `
## Platform Context
This is a **${projectType}** project. Follow the conventions and tooling appropriate for this stack.
`;

  return `You are a senior software architect specialising in ${projectType} development.
You will be given a feature request and the full source code of the project.
Produce a detailed, self-contained implementation plan in Markdown format.
${languageGuidance}
## Required plan sections
1. **Summary** — one-paragraph description of what this feature does and why
2. **Files to create** — list each new file with its path and a one-line purpose
3. **Files to modify** — list each existing file with the specific changes needed
4. **Step-by-step implementation** — numbered steps a developer can follow exactly
5. **Code snippets** — include the most critical code blocks (Swift structs, functions, etc.) inline
6. **Acceptance criteria** — bullet list of testable outcomes
7. **Risks & notes** — edge cases, permissions, OS version requirements, performance considerations

Output ONLY valid Markdown. Do not wrap the entire response in a code fence.`;
}

/**
 * Call Gemini Flash to turn a feature request into a full implementation plan.
 * @param featureRequest - The user's natural-language feature description
 * @param appContext     - The current project source (from readAppContext())
 */
export async function generateTicketPlan(
  featureRequest: string,
  appContext: string
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.3,     // lower = more deterministic plans
      maxOutputTokens: 8192,
    },
  });

  const projectType = getProjectType();
  const systemPrompt = buildArchitectPrompt(projectType);
  const guidelinesContext = buildDevelopmentGuidelinesContext();

  const prompt = `${systemPrompt}

---

## Development Guidelines
${guidelinesContext}

---

## Existing Codebase
${appContext}

---

## Feature Request
${featureRequest}

---

## Implementation Plan`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text) throw new Error('Gemini returned an empty response');
  return text.trim();
}

// ── Validation Phase ──────────────────────────────────────────────────────────

function buildValidatorPrompt(projectType: string): string {
  const isApple = projectType.includes('Xcode') || projectType.includes('Swift');

  const platformNote = isApple
    ? 'Pay special attention to Swift syntax correctness, correct use of SwiftUI/UIKit APIs, memory management (ARC), and any missing Xcode project settings (capabilities, plist keys).'
    : 'Check for correct framework usage, missing dependencies, and environment configuration.';

  return `You are a senior ${projectType} code reviewer performing a post-implementation validation.
You will receive: the original implementation plan, the git diff of all changes made, and Claude's execution log.

${platformNote}

Produce a concise **Validation Summary** in Markdown with these sections:
1. ✅ **Implemented correctly** — what matches the plan
2. ⚠️ **Deviations / partial** — things done differently or incompletely
3. ❌ **Missing / broken** — items from the plan not found in the diff, or clear bugs
4. 📋 **Recommendation** — end with exactly one of: APPROVED | NEEDS REVISION | BLOCKED

Output ONLY valid Markdown starting with ## Validation Summary`;
}

/**
 * Call Gemini Flash to validate what Claude implemented against the original plan.
 * @param ticketBody   - The original .md plan content
 * @param gitDiff      - Output of `git diff HEAD~1`
 * @param claudeReport - Claude's stdout/stderr execution log
 */
export async function validateImplementation(
  ticketBody: string,
  gitDiff: string,
  claudeReport: string
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  });

  const projectType = getProjectType();
  const systemPrompt = buildValidatorPrompt(projectType);

  const prompt = `${systemPrompt}

---

## Original Implementation Plan
${ticketBody}

---

## Git Diff (changes made)
\`\`\`diff
${gitDiff.slice(0, 30_000)}
\`\`\`

---

## Claude Execution Report
\`\`\`
${claudeReport.slice(0, 10_000)}
\`\`\``;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text) throw new Error('Gemini returned an empty response');
  return text.trim();
}
