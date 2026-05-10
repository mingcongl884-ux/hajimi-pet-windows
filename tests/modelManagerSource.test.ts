import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("model manager source", () => {
  it("renders imported models as a compact list with a separate details editor", () => {
    const managerSource = readFileSync("src/components/ManagerPage.tsx", "utf8");
    const stylesSource = readFileSync("src/styles.css", "utf8");

    expect(managerSource).toContain("selectedModelId");
    expect(managerSource).toContain("selectedModel");
    expect(managerSource).toContain("model-manager-layout");
    expect(managerSource).toContain("model-index-list");
    expect(managerSource).toContain("model-detail-card");
    expect(managerSource).toContain("model-index-row");
    expect(stylesSource).toContain(".model-manager-layout");
    expect(stylesSource).toContain("grid-template-columns: minmax(220px, 280px) minmax(0, 1fr)");
    expect(stylesSource).toContain(".model-index-row.active");
    expect(stylesSource).toContain(".model-detail-card");
  });
});
