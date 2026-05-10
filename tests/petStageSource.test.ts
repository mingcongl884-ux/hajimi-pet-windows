import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pet stage source", () => {
  it("animates commanded movement like a game character controller", () => {
    const source = readFileSync("src/components/PetStage.tsx", "utf8");

    expect(source).toContain("startedAt");
    expect(source).toContain("linearProgress");
    expect(source).toContain("jumpHeight");
    expect(source).toContain("Math.sin(linearProgress * Math.PI)");
    expect(source).toContain("from:");
    expect(source).toContain("followPlayCommand(playCommand, now)");
    expect(source).toContain("hoverReactionRef.current");
    expect(source).toContain("playCommandRef.current || dragRef.current ? animationRef.current : canHoverReact ? hoverReactionRef.current : animationOverride ?? animationRef.current");
    expect(source).not.toContain("easeInOut");
  });

  it("keeps hover reactions tied to a real unclicked hover", () => {
    const source = readFileSync("src/components/PetStage.tsx", "utf8");

    expect(source).toContain("HOVER_REACTIONS");
    expect(source).toContain('["waving", "jumping"]');
    expect(source).toContain("hoverReactionActiveRef");
    expect(source).toContain("hoverReactionNextAtRef");
    expect(source).toContain("hoverPointerRef");
    expect(source).toContain("hoverCursorRef");
    expect(source).toContain("hoverCursorPollPendingRef");
    expect(source).toContain("hoverReactionRef");
    expect(source).toContain("HOVER_REACTION_INTERVAL_MS");
    expect(source).toContain("HOVER_CURSOR_POLL_MS");
    expect(source).toContain("HOVER_CURSOR_STALE_MS");
    expect(source).toContain("pickHoverReaction()");
    expect(source).toContain("clearHoverReaction");
    expect(source).toContain("isPointerStillOverPet");
    expect(source).toContain("isCursorOverVisiblePet");
    expect(source).toContain("refreshHoverCursor");
    expect(source).toContain("window.petApp.getCursorScreenPoint()");
    expect(source).toContain("window.setInterval");
    expect(source).toContain("handlePetPointerEnter");
    expect(source).toContain("handlePetPointerMove");
    expect(source).toContain("handlePetPointerLeave");
    expect(source).toContain('onPointerEnter={handlePetPointerEnter}');
    expect(source).toContain('onPointerMove={handlePetPointerMove}');
    expect(source).toContain('onPointerLeave={handlePetPointerLeave}');
    expect(source).toContain('onPointerCancel={handlePetPointerLeave}');
    expect(source).toContain('window.addEventListener("mouseleave", clearHoverReaction)');
    expect(source).toContain('window.addEventListener("blur", clearHoverReaction)');
    expect(source).toContain("const canHoverReact =");
    expect(source).toContain("isPointerStillOverPet()");
    expect(source).toContain("!chatOpen");
    expect(source).toContain("now >= hoverReactionNextAtRef.current");
    expect(source).toContain("hoverReactionActiveRef.current = true");
    expect(source).toContain("hoverReactionActiveRef.current = false");
    expect(source).toContain("hoverPointerRef.current = undefined");
    expect(source).toContain("hoverCursorRef.current = undefined");
    expect(source).toContain("clearHoverReaction();");
    expect(source).toContain("!playCommandRef.current");
    expect(source).toContain("!dragRef.current");
    expect(source).toContain("!animationOverride");
    expect(source).toContain('animationRef.current === "idle"');
    expect(source).toContain("canHoverReact ? hoverReactionRef.current");
    expect(source).not.toContain('matches(":hover")');
  });

  it("drops stale movement animation when autonomous movement is turned off", () => {
    const source = readFileSync("src/components/PetStage.tsx", "utf8");

    expect(source).toContain("if (!settings.movementEnabled)");
    expect(source).toContain("playCommandRef.current = undefined");
    expect(source).toContain('animationRef.current = "idle"');
    expect(source).toContain("movementRef.current?.setEnabled(false)");
  });

  it("pauses autonomous movement while a temporary status override is active", () => {
    const source = readFileSync("src/components/PetStage.tsx", "utf8");

    expect(source).toContain("shouldPauseNaturalMovement");
    expect(source).toContain("naturalMovementPaused");
    expect(source).toContain("settings.movementEnabled && !naturalMovementPaused");
  });
});
