import { describe, expect, it } from "vitest";
import robots from "./robots";

const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "meta-externalagent",
];

function declaredAgents(): string[] {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  return list.flatMap((rule) =>
    Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent ?? ""]
  );
}

describe("robots", () => {
  it("declara los 10 crawlers de IA", () => {
    const agents = declaredAgents();
    for (const agent of AI_AGENTS) {
      expect(agents).toContain(agent);
    }
  });

  it("bloquea las rutas privadas en toda regla", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    for (const rule of list) {
      const disallow = Array.isArray(rule.disallow)
        ? rule.disallow
        : [rule.disallow ?? ""];
      expect(disallow).toContain("/admin/");
      expect(disallow).toContain("/api/");
      expect(disallow).toContain("/agency/");
      expect(disallow).toContain("/dashboard/");
    }
  });

  it("publica el sitemap", () => {
    expect(robots().sitemap).toBe("https://indexaia.com/sitemap.xml");
  });
});
