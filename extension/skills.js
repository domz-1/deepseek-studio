// DeepSeek MCP Studio — Skills engine
// A "skill" is a reusable prompt bundle triggered by /skillname.
// Skills live in chrome.storage.local under the key "ds_skills".

(function (root) {
  const STORAGE_KEY = "ds_skills";

  const DEFAULT_SKILLS = [
    {
      id: "help",
      name: "help",
      description: "List every available skill and how to use them.",
      prompt: "__HELP__",
      builtin: true,
    },
    {
      id: "explain",
      name: "explain",
      description: "Explain code or a concept clearly, step by step.",
      prompt:
        "Explain the following clearly and concisely, step by step, with a short example where useful:",
      builtin: true,
    },
    {
      id: "review",
      name: "review",
      description: "Senior code review: bugs, edge cases, security, style.",
      prompt:
        "Act as a senior engineer. Review the following code for bugs, edge cases, security issues, performance, and style. Be specific and prioritize fixes:",
      builtin: true,
    },
    {
      id: "refactor",
      name: "refactor",
      description: "Refactor code for readability and maintainability.",
      prompt:
        "Refactor the following code for readability, maintainability, and correctness. Preserve behavior and explain the key changes:",
      builtin: true,
    },
    {
      id: "tests",
      name: "tests",
      description: "Write unit tests for the given code.",
      prompt:
        "Write thorough unit tests for the following code. Cover happy paths, edge cases, and failures. Use the project's existing test framework if known:",
      builtin: true,
    },
    {
      id: "debug",
      name: "debug",
      description: "Find the root cause of a bug and propose a fix.",
      prompt:
        "Help me debug the following. Identify the most likely root cause, explain the reasoning, then give a concrete fix:",
      builtin: true,
    },
    {
      id: "commit",
      name: "commit",
      description: "Write a Conventional Commits message from a diff.",
      prompt:
        "Write a Conventional Commits message (type(scope): subject + body) for the following changes:",
      builtin: true,
    },
    {
      id: "summarize",
      name: "summarize",
      description: "Summarize text into key bullet points.",
      prompt:
        "Summarize the following into concise, high-signal bullet points:",
      builtin: true,
    },
    {
      id: "grill-me",
      name: "grill-me",
      description:
        "Interactive architectural interview with clean selectable option cards (single or multi-choice).",
      prompt:
        "Act as an exceptionally demanding Principal Engineer and Architect. You are conducting an interactive architecture interview (Grill-Me session).\n" +
        "CRITICAL RULES:\n" +
        "1. NEVER ask any questions or present decisions until you have FIRST thoroughly read and inspected the relevant project codebase and files using filesystem MCP tools! Only formulate questions based on actual code context.\n" +
        "2. Focus on the core architectural bottlenecks, trade-offs, and design decisions.\n" +
        "3. Provide a short 2-3 sentence technical context/rationale in prose.\n" +
        "4. DO NOT print a duplicate text list of options or bullet points in your message text!\n" +
        '5. For every question, always identify the best architectural path and prefix that option\'s label with "(Recommended)".\n' +
        '6. Always enable multi-selection boolean ("multi_select": true) so the user can choose multiple applicable options.\n' +
        "7. Place ALL questions and choices directly into this JSON block at the end of your message so the extension renders the interactive UI cards:\n" +
        "```json\n" +
        "{\n" +
        '  "grill_question": "Exact critical decision question?",\n' +
        '  "options": [\n' +
        '    {"id": "A", "label": "(Recommended) Option A summary", "details": "Trade-offs and architectural implications..."},\n' +
        '    {"id": "B", "label": "Option B summary", "details": "Trade-offs and architectural implications..."},\n' +
        '    {"id": "C", "label": "Option C summary", "details": "Trade-offs and architectural implications..."}\n' +
        "  ],\n" +
        '  "multi_select": true,\n' +
        '  "allow_custom": true\n' +
        "}\n" +
        "```\n" +
        '(Or use `"questions": [...]` if you have multiple related decisions to ask at once, each with `"multi_select": true` and a `(Recommended)` option).\n' +
        "8. When I submit my decision, analyze my choice, challenge any remaining edge cases or move forward.\n\n" +
        "Topic to grill me on:",
      builtin: true,
    },
    {
      id: "plan",
      name: "plan",
      description:
        "Generate a rigorous step-by-step implementation plan with file changes and verification.",
      prompt:
        "Act as a Senior Tech Lead. Create a rigorous, complete, step-by-step Implementation Plan before writing any code.\n" +
        "Structure your response with:\n" +
        "1. **Summary & Architecture**: Clear scope and core architectural approach.\n" +
        "2. **Critical Decisions & Trade-offs**: Key trade-offs or constraints identified.\n" +
        "3. **Step-by-Step Changes**: Exact files to create/modify (`[NEW]`, `[MODIFY]`, `[DELETE]`) with rationale for each.\n" +
        "4. **Verification Plan**: Exact commands, unit tests, and edge case validations.\n" +
        "5. **Open Questions**: Anything needing clarification before implementation starts.\n\n" +
        "Task to plan:",
      builtin: true,
    },
    {
      id: "build",
      name: "build",
      description:
        "Autonomous Build Mode: execute plan, call MCP tools, create files, and verify.",
      prompt:
        "You are now in **Autonomous Build Mode**. Your objective is to implement the solution cleanly and verify it using workstation MCP tools.\n" +
        "Guidelines:\n" +
        "1. Inspect files or execute commands using MCP tools directly.\n" +
        "2. Implement production-ready code with complete error handling and tests.\n" +
        "3. Verify your work (run tests or linting with `@bash`).\n" +
        "4. Keep me updated with concise progress summaries in English or Arabic.\n\n" +
        "Objective to build:",
      builtin: true,
    },
    {
      id: "translate-ar",
      name: "translate-ar",
      description: "Translate text to Arabic.",
      prompt: "Translate the following text into natural, fluent Arabic:",
      builtin: true,
    },
    {
      id: "translate-en",
      name: "translate-en",
      description: "Translate text to English.",
      prompt: "Translate the following text into natural, fluent English:",
      builtin: true,
    },
    {
      id: "audit-structure",
      name: "audit-structure",
      description:
        "Full enterprise codebase audit & refactoring across Node/Express, PHP, Vue/Nuxt, and Flutter. Enforces numeric file-based enums, clean modular architecture, composables, t-functions, and inline documentation.",
      prompt:
        "Act as a Principal Enterprise Software Architect. Conduct a comprehensive, multi-layer clean-architecture audit and refactoring plan across the entire workspace (Backend [Node.js/Express & PHP], Frontend [Vue/Nuxt], and Mobile [Flutter]).\n\n" +
        "CRITICAL ARCHITECTURAL STANDARDS TO ENFORCE:\n\n" +
        "1. ENUMS INTEGRITY (NUMERIC, PER-MODULE FILES & BARREL EXPORTS):\n" +
        "   - Per-Module Dedicated Enum Files: Every module must have its own dedicated enum definitions file (e.g., `modules/invoices/enums/invoice.enum.ts` or `modules/invoices/enums.ts`, `invoices/enums.dart`, `Invoices/Enums/InvoiceStatus.php`). Never dump all enums into a single monolithic global file, and never define enums inline inside controllers, models, or views.\n" +
        "   - Barrel Index Export Pattern: Each module's enums directory must export a clean barrel `index.ts` / `index.dart` (e.g. `export * from './invoice-status.enum';`) allowing consumers to import cleanly from `@/modules/invoices/enums` or the module index.\n" +
        "   - Explicit Numeric Values: ALL Enums MUST be numeric values (e.g., `enum InvoiceStatus { Draft = 1, Paid = 2, Overdue = 3 }`), matching backend DB columns, API payloads, and frontend/mobile types without string mismatch.\n" +
        "   - Enum Audit Report: Provide a clear breakdown table of all enums in the module/project (Enum Name, Target File, Numeric Values Mapping, Sync status with DB/API).\n\n" +
        "2. BACKEND — NODE.JS & EXPRESS:\n" +
        "   - Clean 3-Tier Layering: Strict separation: Controller (HTTP/Req/Res parsing) -> Service/UseCase (pure business logic) -> Repository/Model (data access). Never write database queries or business computations inside route handlers or controllers!\n" +
        "   - Input Validation & Error Handling: Every endpoint must validate payload via schema (Zod/Joi) and pass unhandled errors to a centralized Express error middleware.\n" +
        "   - Shared Utilities: Leverage reusable helpers from `/utils` (date formatting, currency, crypt, sanitization) instead of duplicate inline code.\n\n" +
        "3. BACKEND — PHP / LARAVEL:\n" +
        "   - Modern Clean PHP: Strict typing (`declare(strict_types=1);`), backed enums, and constructor promotion.\n" +
        "   - Separation: Controllers must remain thin (delegate to Action/Service classes). Use FormRequests for validation and API Resources for JSON responses.\n" +
        "   - Avoid raw DB calls: Encapsulate queries in Eloquent scopes, repositories, or query objects.\n\n" +
        "4. FRONTEND — VUE 3 / NUXT & DESIGN SYSTEM:\n" +
        "   - Zero Logic in Views: `.vue` page files must ONLY contain layout templates, styles, and high-level component bindings. Zero raw API fetches, computations, or state manipulation in page components!\n" +
        "   - Composables: ALL reactive states, API queries, lifecycle watchers, and business mutations MUST reside in domain composables (e.g., `use<Feature>.ts`).\n" +
        "   - Design System & Component Library:\n" +
        "     * Detect repeated raw HTML elements or unstyled components (e.g., raw `<select>`, raw `<input>`, unstyled dropdowns, pagination, modal popups, buttons).\n" +
        "     * Extract them into modern, reusable, atomic UI components (e.g., `BaseSelect.vue`, `BaseInput.vue`, `BaseModal.vue`, `BaseDropdown.vue`) with full WAI-ARIA accessibility (keyboard navigation, focus states, screen-reader labels) and smooth micro-interactions/transitions.\n" +
        "   - Zero Inline `<style>` Blocks & Pure Tailwind:\n" +
        "     * Strictly eliminate inline `<style>` or `<style scoped>` blocks in Vue/Nuxt components! Replace all custom CSS rules with utility Tailwind classes.\n" +
        "     * Color Variables & Theme Tokens: NEVER use hardcoded hex/rgb color codes in classes or styles (e.g. `bg-[#181825]`). All colors, radiuses, and shadows must resolve from Tailwind theme tokens or centralized CSS custom properties in `globals.css` / `tailwind.config.ts` (e.g., `var(--color-bg)`, `var(--color-primary)`).\n" +
        "   - Module Localization: Each module must store its own dedicated translation keys (e.g., `modules/<feature>/locales/en.json`, `ar.json`). Never dump all strings into one giant root file. Identify and add all missing Arabic & English keys.\n" +
        "   - File Length Limit: Strictly refactor any file exceeding 250 lines into sub-components, composables, or atomic widgets.\n\n" +
        "5. MOBILE — FLUTTER / DART:\n" +
        "   - Clean Localization: Always use localization functions (e.g., `tr('key')`, `t('key')`, `context.tr()`). Strictly forbid raw hardcoded strings in UI widgets.\n" +
        "   - Zero Emojis in Code: Never use literal emojis in source files or UI text. Use SVG vectors, Material/Cupertino Icons, or designated asset assets.\n" +
        "   - Clean Component Hierarchy: Extract long build methods into reusable, atomic widgets with `const` constructors.\n\n" +
        "6. COMPREHENSIVE DOCUMENTATION & TYPES:\n" +
        "   - Every exported function, class, and service must include clear documentation (JSDoc for TypeScript/Node, PHPDoc for PHP, DartDoc for Flutter) explaining parameters, return values, and failure modes.\n\n" +
        "7. AUTOMATED UNIT TESTING SUITE (PER MODULE):\n" +
        "   - Every audited module MUST have a dedicated unit test suite:\n" +
        "     * Backend Node.js / Express: Vitest / Jest tests covering Service business logic, repository methods, validation schemas, and API response contracts.\n" +
        "     * Backend PHP: PHPUnit / Pest tests covering Action/Service classes, FormRequest rules, and model factories.\n" +
        "     * Frontend (Vue/Nuxt): Vitest + Vue Test Utils tests covering domain Composables (`use<Feature>.spec.ts`), reactive state mutations, and component props/emits.\n" +
        "     * Mobile (Flutter): Unit tests (`test/<feature>_test.dart`) covering business logic, blocs/providers, data models, and JSON serialization.\n" +
        "   - Test Coverage Priorities: Happy paths, validation failure branches, authentication/authorization failures, boundary numbers, and error handling.\n\n" +
        "8. EXECUTION & AUDIT CHECKLIST:\n" +
        "   - Step 1: Use MCP filesystem tools to inspect the active workspace structure, packages, and code.\n" +
        "   - Step 2: Present an Architecture Audit Checklist with status markers:\n" +
        "     [ ] Centralized Numeric Enums from Dedicated Files\n" +
        "     [ ] Backend (Node/PHP) Controller/Service/Repo Layering\n" +
        "     [ ] Frontend (Vue/Nuxt) Composables vs Views Separation\n" +
        "     [ ] Reusable Accessible UI Components (Replacing raw `<select>`, `<input>`)\n" +
        "     [ ] Zero `<style>` Blocks & Pure Tailwind (Design Tokens / CSS Variables)\n" +
        "     [ ] Modular Architecture & Per-Module Translations (en/ar)\n" +
        "     [ ] Mobile (Flutter) Translation Functions & Zero Emojis\n" +
        "     [ ] File Size Limit Compliance (< 250 lines)\n" +
        "     [ ] Inline Documentation (JSDoc/PHPDoc/DartDoc)\n" +
        "     [ ] Automated Unit Test Suite (`.spec.ts` / `Test.php` / `_test.dart`)\n" +
        "   - Step 3: Provide concrete refactoring file actions (`[MODIFY]`, `[NEW]`) with production-ready code and complete unit test files.\n\n" +
        "Scope or target module to audit:",
      builtin: true,
    },
    {
      id: "module-cover",
      name: "module-cover",
      description:
        "360-degree exhaustive module completion audit: analyzes and covers every file, model, schema, API, state, UI, error handling, translations, tests, and documentation.",
      prompt:
        "Act as a Principal Staff Engineer & Technical Auditor. Perform an exhaustive, 360-degree deep audit and completion plan on the target module/feature across ALL layers of the application.\n\n" +
        "CRITICAL AUDIT & COVERAGE MANDATES:\n\n" +
        "1. FULL STACK DEEP INSPECTION:\n" +
        "   - Use MCP filesystem tools (`list_directory`, `read_file`, `search_files`) to locate and inspect every related file in Backend, Frontend, and Mobile.\n" +
        "   - Identify every missing piece, incomplete TODO, untyped property, unhandled edge-case, and dead code.\n\n" +
        "2. DATA & API LAYER (100% COVERED):\n" +
        "   - Database / Schemas / Migrations: Verify all columns, indexes, foreign keys, and soft deletes.\n" +
        "   - Per-Module Dedicated Enums: Dedicated enum files per module (e.g., `modules/<feature>/enums/`), strictly numeric values, with clean barrel export (`index.ts` / `index.dart`) to import directly from the module enums index.\n" +
        "   - API Endpoints: Verify complete CRUD coverage, strict payload validation (Zod/Joi/FormRequest), error response structures, and pagination.\n" +
        "   - DTOs & Types: Complete TypeScript / Dart / PHP interfaces for every request, response, and entity.\n\n" +
        "3. BUSINESS & STATE LOGIC (100% COVERED):\n" +
        "   - Backend Services: Pure business logic with zero DB leaks into controllers.\n" +
        "   - Frontend Composables / Mobile State: All states (loading, success, error, empty, paginated) encapsulated in domain composables/blocs/providers.\n" +
        "   - Edge-Case Resilience: Offline handling, timeouts, token expiration, idempotency, and race condition prevention.\n\n" +
        "4. USER EXPERIENCE & INTERFACE (100% COVERED):\n" +
        "   - UI States: Loading skeletons, error retry banners, empty illustration states, and action confirmation dialogs.\n" +
        "   - Design System & Pure Tailwind: Modern accessible components (BaseSelect, BaseModal), zero `<style>` tags, and design token CSS variables.\n" +
        "   - Full Localization: 100% bilingual coverage (Arabic + English) with no hardcoded strings anywhere (using `t()` / `tr()`).\n" +
        "   - Zero Emojis: All iconography using clean SVGs or Material/Lucide icons.\n\n" +
        "5. TESTING & QUALITY ASSURANCE (100% COVERED):\n" +
        "   - Unit & Integration Test Specifications: Test happy paths, boundary values, permission failures, and invalid payloads.\n" +
        "   - Comprehensive Documentation: JSDoc/PHPDoc/DartDoc on every exported function, class, and interface.\n\n" +
        "6. 360-DEGREE AUDIT MATRIX & DELIVERABLES:\n" +
        "   - Matrix Checklist with Status ([DONE] / [GAP] / [ACTION REQUIRED]):\n" +
        "     [ ] Schemas, Migrations & Numeric Enums\n" +
        "     [ ] API Endpoints, Validation & Error Handling\n" +
        "     [ ] Business Logic & State Composables\n" +
        "     [ ] UI States (Loading, Error, Empty, Success)\n" +
        "     [ ] Bilingual Localization (All AR & EN keys present)\n" +
        "     [ ] Accessibility (ARIA, Keyboard Nav, Mobile Touch Targets)\n" +
        "     [ ] Testing Suite & Automated Assertions\n" +
        "     [ ] Comprehensive Inline Documentation\n" +
        "   - Complete production-ready refactoring and implementation files (`[NEW]`, `[MODIFY]`).\n\n" +
        "Module, feature, or domain to cover completely:",
      builtin: true,
    },
    {
      id: "delegate",
      name: "delegate",
      description:
        "Autonomous Multi-Agent Task Delegation: breaks complex objectives into subtasks, assigns specialized personas, and executes parallel tool batches.",
      prompt:
        "Act as an Autonomous Multi-Agent Coordinator and Orchestrator. Break down this objective into specialized concurrent subtasks and coordinate execution:\n\n" +
        "ORCHESTRATION RULES:\n" +
        "1. **Deconstruct Objective**: Break the user's objective into distinct, decoupled roles (e.g., Code Researcher, Backend Architect, Frontend Engineer, QA & Test Lead).\n" +
        "2. **Parallel Tool Batching**: Where subtasks are independent, issue multiple tool calls concurrently in a single response to maximize throughput.\n" +
        "3. **Synthesize & Verify**: Once subtasks complete, verify changes with build & lint commands (`@bash`), and deliver a unified status report with clear next steps.\n\n" +
        "Objective to delegate:",
      builtin: true,
    },
    {
      id: "perf-opt",
      name: "perf-opt",
      description:
        "Deep Performance Profiling & Optimization: detects runtime bottlenecks, N+1 queries, memory leaks, bundle sizes, and excessive re-renders.",
      prompt:
        "Act as a Principal Performance Engineer. Analyze the target codebase/module for critical performance bottlenecks and provide concrete optimizations:\n\n" +
        "ANALYSIS CHECKLIST:\n" +
        "1. **Runtime & Algorithmic Complexity**: Identify O(n^2) loops, unnecessary array allocations, and synchronous blocking operations.\n" +
        "2. **Database & API Latency**: Pinpoint N+1 queries, missing composite indexes, unindexed foreign keys, and payload over-fetching.\n" +
        "3. **Frontend & Mobile Rendering**: Flag excessive re-renders, unmemoized expensive computations, unoptimized images, and heavy bundle chunks.\n" +
        "4. **Concrete Action Plan**: Provide direct code refactors (`[MODIFY]`) with before/after complexity benchmarks.\n\n" +
        "Scope to optimize:",
      builtin: true,
    },
    {
      id: "security-scan",
      name: "security-scan",
      description:
        "Automated Security & Vulnerability Audit: scans for OWASP Top 10, SQLi, XSS, SSRF, secret leaks, and unauthenticated endpoints.",
      prompt:
        "Act as a Principal Application Security Auditor (AppSec & DevSecOps). Conduct an exhaustive security audit across the codebase:\n\n" +
        "SECURITY AUDIT DOMAINS:\n" +
        "1. **Injection & Input Validation**: SQL injection, command injection, XSS vectors, path traversal, and missing schema validations (Zod/Joi).\n" +
        "2. **Auth & Access Control**: Broken object-level authorization (BOLA/IDOR), missing role guards, CSRF/CORS misconfigurations, and token handling.\n" +
        "3. **Secret & Sensitive Data Leaks**: Hardcoded API keys, JWT secrets, plaintext passwords, unmasked PII in logs or responses.\n" +
        "4. **Remediation Code**: Provide immediate, drop-in secure patches for every identified vulnerability with severity rating (CRITICAL, HIGH, MEDIUM).\n\n" +
        "Codebase or endpoints to audit:",
      builtin: true,
    },
    {
      id: "e2e-test",
      name: "e2e-test",
      description:
        "End-to-End & Browser Testing: writes and runs Playwright/Puppeteer flows, tests user journeys, and validates accessibility.",
      prompt:
        "Act as a Principal QA & Test Automation Lead. Architect and generate end-to-end (E2E) automated test suites (using Playwright or Puppeteer):\n\n" +
        "TESTING REQUIREMENTS:\n" +
        "1. Complete User Flows: happy path, validation failures, edge cases, session timeouts, and network failure retries.\n" +
        "2. Selectors & Resilience: prioritize user-facing accessibility locators (`getByRole`, `getByLabel`, `getByText`) over brittle CSS classes.\n" +
        "3. Assertions & Visual Checks: verify element visibility, dynamic URL changes, network response status codes, and console error logs.\n" +
        "4. Executable Scripts: provide ready-to-run test files (`.spec.ts`) and the exact `@bash` run command.\n\n" +
        "User flow or component to test:",
      builtin: true,
    },
    {
      id: "db-migrate",
      name: "db-migrate",
      description:
        "Database Architecture & Migration Engineer: designs normalized schemas, zero-downtime migrations, indexes, and numeric enum mappings.",
      prompt:
        "Act as a Principal Database Reliability Engineer (DBRE). Analyze, design, or audit database schemas and migrations:\n\n" +
        "DATABASE STANDARDS:\n" +
        "1. Schema Design: 3NF normalization, strict foreign key constraints, composite indexes for search queries, and soft-delete/audit columns.\n" +
        "2. Enum Columns: map strictly to numeric integers matching application enum definitions.\n" +
        "3. Zero-Downtime Migrations: safe schema alteration scripts (PostgreSQL / MySQL) that avoid table locks during deployment.\n" +
        "4. Complete Migration Files: generate ready-to-apply migration files (Prisma, TypeORM, Knex, Drizzle, or Laravel) with up/down methods.\n\n" +
        "Schema changes or table to design:",
      builtin: true,
    },
    {
      id: "api-design",
      name: "api-design",
      description:
        "RESTful & OpenAPI 3.1 Architect: generates complete OpenAPI specs, request/response DTOs with Zod schemas, and TypeScript client SDKs.",
      prompt:
        "Act as a Principal API Architect. Design a production-grade, RESTful API contract for the requested domain:\n\n" +
        "API DESIGN SPECIFICATIONS:\n" +
        "1. RESTful Conventions: consistent HTTP methods, resource naming, standard error shapes (RFC 7807 Problem Details), and cursor/offset pagination.\n" +
        "2. OpenAPI 3.1 Specification: complete YAML or JSON OpenAPI spec with request bodies, response models, query parameters, and auth security schemes.\n" +
        "3. Schema Validation & Types: provide matching Zod/Joi validation schemas and TypeScript DTO interfaces for backend & frontend sync.\n" +
        "4. Client SDK Snippets: provide ergonomic client fetching helper functions.\n\n" +
        "Domain or feature to design API for:",
      builtin: true,
    },
    {
      id: "git-pr",
      name: "git-pr",
      description:
        "Git Release & Pull Request Specialist: inspects git diffs, drafts high-signal PR descriptions, and validates conventional commits.",
      prompt:
        "Act as a Senior Release Engineer. Review git diffs and craft a complete, production-ready Pull Request description:\n\n" +
        "PR STRUCTURE:\n" +
        "1. **Title**: Conventional commit format (`feat:`, `fix:`, `refactor:`, `perf:`).\n" +
        "2. **Summary**: High-level motivation and business context behind the changes.\n" +
        "3. **Key Technical Changes**: Bullet points broken down by component/layer.\n" +
        "4. **Verification & Testing**: Exact automated test results and manual reproduction steps.\n" +
        "5. **Rollback Plan & Breaking Changes**: Document any backward incompatibilities or DB migration precautions.\n\n" +
        "Diff or branch changes to summarize:",
      builtin: true,
    },
    {
      id: "accessibility",
      name: "accessibility",
      description:
        "WCAG 2.1 AA Accessibility Specialist: audits markup for screen readers, keyboard navigation, color contrast, and WAI-ARIA standards.",
      prompt:
        "Act as a certified Web Accessibility Specialist (CPACC / WAS). Conduct an exhaustive WCAG 2.1 Level AA compliance audit:\n\n" +
        "ACCESSIBILITY AUDIT MANDATES:\n" +
        "1. Keyboard Navigation: full focus trap management for modals, visible focus rings (`:focus-visible`), skip-to-content links, and logical tab orders.\n" +
        "2. WAI-ARIA & Semantics: proper `aria-expanded`, `aria-controls`, `aria-label`, `role` attributes, and semantic HTML5 replacement for generic `<div>`/`<span>` buttons.\n" +
        "3. Color Contrast: verify minimum 4.5:1 ratio for normal text and 3:1 for large text / UI elements.\n" +
        "4. Concrete Accessible Patches: provide drop-in accessible component updates (`[MODIFY]`).\n\n" +
        "Component or page to audit for accessibility:",
      builtin: true,
    },
  ];

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
  }

  function normalizeSkill(raw) {
    const name = slugify(raw.name || raw.id);
    return {
      id: raw.id || name,
      name: name,
      emoji: raw.emoji || "",
      icon: raw.icon || "",
      description: raw.description || "",
      prompt: raw.prompt || "",
      servers: Array.isArray(raw.servers) ? raw.servers : [],
      builtin: !!raw.builtin,
    };
  }

  async function loadSkills() {
    let custom = [];
    try {
      const got = await chrome.storage.local.get(STORAGE_KEY);
      custom = (got && got[STORAGE_KEY]) || [];
    } catch (_) {
      try {
        custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch (_) {}
    }
    const customs = custom.map(normalizeSkill);
    const byName = new Map();
    for (const s of DEFAULT_SKILLS) byName.set(s.name, normalizeSkill(s));
    for (const s of customs) byName.set(s.name, s);
    return Array.from(byName.values()).sort((a, b) => {
      if (a.builtin !== b.builtin) return a.builtin ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }

  async function saveCustomSkills(list) {
    const clean = (list || []).map(normalizeSkill).filter((s) => s.name);
    const payload = {};
    payload[STORAGE_KEY] = clean;
    try {
      await chrome.storage.local.set(payload);
    } catch (_) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    }
    return clean;
  }

  async function getCustomSkills() {
    try {
      const got = await chrome.storage.local.get(STORAGE_KEY);
      return (got && got[STORAGE_KEY]) || [];
    } catch (_) {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch (_) {
        return [];
      }
    }
  }

  function helpText(skills) {
    const lines = skills.map((s) => "- `/" + s.name + "` — " + s.description);
    return [
      "### DeepSeek Workstation & MCP Tools Guide",
      "",
      "**Available Skills:**",
      lines.join("\n"),
      "",
      "---",
      "### How to Work with Projects & Code:",
      "1. **Explore & See Existing Projects:**",
      '   - Type `@filesystem /explain list projects` or ask DeepSeek: `"List all projects and folders in /home/adham/projects"`.',
      "   - DeepSeek will automatically invoke `list_directory` or `bash` (`ls -la /home/adham/projects`).",
      "",
      "2. **Create a New Project:**",
      '   - Ask DeepSeek: `"Create a new project named my-app in /home/adham/projects with Bun"`.',
      "   - DeepSeek will use `@bash` to run `mkdir -p /home/adham/projects/my-app && cd /home/adham/projects/my-app && bun init -y`.",
      "",
      "3. **Combine Skills & MCP Servers:**",
      "   - Combine any skill with server mentions, e.g.: `@filesystem /review analyze index.js` or `@bash /tests write unit tests for app.ts`.",
      "   - Use `@all` to give DeepSeek access to all workstation tools (Filesystem, Bash execution, and Memory).",
      "",
      "*Tip: Toggle the **Auto-run** checkbox above the input to let safe actions execute automatically!*",
    ].join("\n");
  }

  function matchSkill(text, skills) {
    const m = String(text || "").match(/^\s*\/([a-z0-9_-]+)\b([\s\S]*)$/i);
    if (!m) return null;
    const name = m[1].toLowerCase();
    const skill = skills.find((s) => s.name === name);
    if (!skill) return null;
    return { skill: skill, rest: m[2].trim() };
  }

  function expandSkill(skill, rest, skills) {
    if (skill.prompt === "__HELP__") return helpText(skills || DEFAULT_SKILLS);
    const tail = rest ? "\n\n" + rest : "";
    return skill.prompt + tail;
  }

  function filterSkills(query, skills) {
    const list = skills || DEFAULT_SKILLS;
    if (!query) return list;
    const lower = String(query).toLowerCase().trim();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        (s.description && s.description.toLowerCase().includes(lower)),
    );
  }

  // Icon mapping for built-in skills -> theme.css mask names.
  const SKILL_ICONS = {
    help: "help",
    explain: "brain",
    review: "search",
    refactor: "tool",
    tests: "flask",
    debug: "bug",
    commit: "pen",
    summarize: "file",
    "grill-me": "flame",
    plan: "clipboard",
    build: "build",
    "translate-ar": "globe",
    "translate-en": "globe",
    "audit-structure": "tool",
    "module-cover": "sparkles",
    delegate: "rocket",
    "perf-opt": "zap",
    "security-scan": "alert",
    "e2e-test": "flask",
    "db-migrate": "tool",
    "api-design": "brain",
    "git-pr": "pen",
    accessibility: "sparkles",
  };

  // Legacy custom skills saved an emoji, not an icon name. Map the common
  // ones back so existing skills keep their visual identity.
  // Legacy custom skills saved an emoji, not an icon name. Keys are unicode
  // escapes (not literal glyphs) so this source stays emoji-free.
  const EMOJI_TO_ICON = {
    "\u2753": "help",
    "\u{1F9E0}": "brain",
    "\u{1F50D}": "search",
    "\u{1F6E0}": "tool",
    "\u{1F9EA}": "flask",
    "\u{1F41E}": "bug",
    "\u{1F4DD}": "pen",
    "\u{1F4C4}": "file",
    "\u{1F525}": "flame",
    "\u{1F4CB}": "clipboard",
    "\u{1F3D7}": "build",
    "\u{1F680}": "rocket",
    "\u{1F4A1}": "bulb",
    "\u26A1": "zap",
    "\u2728": "sparkles",
    "\u2713": "check",
    "\u2715": "close",
    "\u{1F1F8}\u{1F1E6}": "globe",
    "\u{1F1EC}\u{1F1E7}": "globe",
  };

  const ICON_NAMES = [
    "sparkles",
    "zap",
    "check",
    "close",
    "clock",
    "alert",
    "search",
    "flame",
    "arrowRight",
    "file",
    "folder",
    "brain",
    "help",
    "tool",
    "flask",
    "bug",
    "pen",
    "clipboard",
    "build",
    "globe",
    "rocket",
    "bulb",
    "server",
  ];

  const DSIcon = {
    names() {
      return ICON_NAMES.slice();
    },
    name(skill) {
      const s = skill || {};
      if (SKILL_ICONS[s.name]) return SKILL_ICONS[s.name];
      if (s.icon) return s.icon;
      if (s.emoji && EMOJI_TO_ICON[s.emoji]) return EMOJI_TO_ICON[s.emoji];
      return "sparkles";
    },
    forSkill(skill) {
      return '<span class="ds-ic" data-ic="' + DSIcon.name(skill) + '"></span>';
    },
  };
  root.DSIcon = DSIcon;

  root.DSSkills = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_SKILLS: DEFAULT_SKILLS.map(normalizeSkill),
    loadSkills: loadSkills,
    saveCustomSkills: saveCustomSkills,
    getCustomSkills: getCustomSkills,
    matchSkill: matchSkill,
    expandSkill: expandSkill,
    helpText: helpText,
    filterSkills: filterSkills,
    normalizeSkill: normalizeSkill,
    slugify: slugify,
  };
})(typeof window !== "undefined" ? window : globalThis);
