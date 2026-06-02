const STT_CORRECTIONS: Array<[RegExp, string]> = [
  [/\btext stack\b/gi, "tech stack"],
  [/\btext stacks\b/gi, "tech stacks"],
  [/\btext sex stack\b/gi, "tech stack"],
  [/\brest full\b/gi, "RESTful"],
  [/\bmy sequel\b/gi, "MySQL"],
  [/\bpost gres\b/gi, "Postgres"],
  [/\bpost gress\b/gi, "Postgres"],
  [/\bpost grey s\b/gi, "Postgres"],
  [/\bno sequel\b/gi, "NoSQL"],
  [/\bno sql\b/gi, "NoSQL"],
  [/\bcube rnetes\b/gi, "Kubernetes"],
  [/\bjava script\b/gi, "JavaScript"],
  [/\btype script\b/gi, "TypeScript"],
  [/\bnode js\b/gi, "Node.js"],
  [/\breact js\b/gi, "React"],
  [/\bai pi\b/gi, "API"],
  [/\ba p i\b/gi, "API"],
  [/\bgit hub\b/gi, "GitHub"],
  [/\bci cd\b/gi, "CI/CD"],
  [/\bdocker file\b/gi, "Dockerfile"],
  [/\bmicro service\b/gi, "microservice"],
  [/\bmicro services\b/gi, "microservices"],
  [/\bopen ai\b/gi, "OpenAI"],
];

export function normalizeSttTranscript(text: string): string {
  if (!text?.trim()) return text || "";
  let next = text;
  for (const [pattern, replacement] of STT_CORRECTIONS) {
    next = next.replace(pattern, replacement);
  }
  return next.replace(/\s+/g, " ").trim();
}

