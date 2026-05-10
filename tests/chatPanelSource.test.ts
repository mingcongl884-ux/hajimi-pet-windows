import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat panel source", () => {
  it("binds the pet chat panel to the current project conversation instead of separate mode switching", () => {
    const chatPanelSource = readFileSync("src/components/ChatPanel.tsx", "utf8");

    expect(chatPanelSource).toContain("bindingLabel");
    expect(chatPanelSource).toContain("chat-binding-label");
    expect(chatPanelSource).toContain("chat-overflow-menu");
    expect(chatPanelSource).toContain("chat-panel-menu-button");
    expect(chatPanelSource).toContain('onCreateConversation("chat")');
    expect(chatPanelSource).not.toContain('onCreateConversation("agent")');
    expect(chatPanelSource).not.toContain("BriefcaseBusiness");
    expect(chatPanelSource).not.toContain("MessageCircle");
    expect(chatPanelSource).not.toContain("chat-mode-badge");
    expect(chatPanelSource).not.toContain("onToggleAgentMode");
    expect(chatPanelSource).not.toContain("chat-mode-toggle");
  });

  it("keeps secondary chat actions inside a compact overflow menu", () => {
    const chatPanelSource = readFileSync("src/components/ChatPanel.tsx", "utf8");
    const stylesSource = readFileSync("src/styles.css", "utf8");

    expect(chatPanelSource).toContain("MoreHorizontal");
    expect(chatPanelSource).toContain("setMenuOpen");
    expect(chatPanelSource).toContain("menuRef");
    expect(chatPanelSource).toContain('document.addEventListener("pointerdown"');
    expect(chatPanelSource).toContain('document.addEventListener("keydown"');
    expect(chatPanelSource).toContain('className="chat-panel-menu-button"');
    expect(chatPanelSource).toContain('className="chat-overflow-menu"');
    expect(stylesSource).toContain(".chat-overflow-menu");
    expect(stylesSource).toContain(".chat-panel header .chat-overflow-menu button");
    expect(stylesSource).toContain("white-space: nowrap");
    expect(stylesSource).not.toContain("grid-template-columns: 1fr repeat(3, 28px)");
  });

  it("keeps the latest pet chat messages visible after sending", () => {
    const chatPanelSource = readFileSync("src/components/ChatPanel.tsx", "utf8");

    expect(chatPanelSource).toContain("messageListRef");
    expect(chatPanelSource).toContain("scrollTop = messageList.scrollHeight");
    expect(chatPanelSource).toContain("[messages.length, error]");
  });
});
