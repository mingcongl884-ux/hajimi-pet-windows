import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pet chat bubble source", () => {
  it("opens an in-pet office chat bubble instead of the manager window when clicking the pet", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");

    expect(appSource).toContain('import PetChatBubble from "./components/PetChatBubble"');
    expect(appSource).toContain("function openPetChat()");
    expect(appSource).toContain("setChatOpen(true)");
    expect(appSource).toContain("onClick={openPetChat}");
    expect(appSource).toContain("chatOpen &&");
    expect(appSource).toContain("<PetChatBubble");
    expect(appSource).toContain("chatOpenRef.current = open");
    expect(appSource).toContain("if (chatOpenRef.current)");
    expect(appSource).not.toContain("onClick={openOffice}");
  });

  it("binds the pet bubble to the current office conversation", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");
    const bubbleSource = readFileSync("src/components/PetChatBubble.tsx", "utf8");

    expect(appSource).toContain("onSend={sendOfficeMessage}");
    expect(appSource).toContain('onCreateConversation={() => createNewConversation("agent")}');
    expect(bubbleSource).toContain("current office conversation");
    expect(bubbleSource).toContain("pendingAttachments");
    expect(bubbleSource).toContain("buildAttachmentMessage");
    expect(bubbleSource).toContain("onDrop={handleDrop}");
  });
});
