import { describe, expect, it, vi } from "vitest";
import { sendChatMessage } from "../electron/chatClient";

describe("sendChatMessage", () => {
  it("sends an OpenAI-compatible chat completions request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "hello" } }]
      })
    });

    const response = await sendChatMessage(fetchMock, {
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "gpt-4.1-mini",
      systemPrompt: "Be concise."
    }, [{ role: "user", content: "hi" }]);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer secret",
        "Content-Type": "application/json"
      })
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[0].content).toContain("Be concise.");
    expect(body.messages[0].content).toContain("visible HaJiMi desktop pet");
    expect(body.messages[0].content).toContain("review");
    expect(body.messages[0].content).toContain("waiting");
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
    expect(response.content).toBe("hello");
  });

  it("sends hidden attachment content to providers without UI-only fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "ok" } }]
      })
    });

    await sendChatMessage(fetchMock, {
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "gpt-4.1-mini",
      systemPrompt: ""
    }, [{
      role: "user",
      content: "full file content",
      displayContent: "附件：note.txt",
      fileOutputs: [{ path: "out.txt", name: "out.txt" }]
    }]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1]).toEqual({ role: "user", content: "full file content" });
  });

  it("does not duplicate v1 when the configured base URL already includes it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "ok" } }]
      })
    });

    await sendChatMessage(fetchMock, {
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret",
      model: "gpt-4.1-mini",
      systemPrompt: ""
    }, [{ role: "user", content: "hi" }]);

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/chat/completions", expect.anything());
  });

  it("uses a complete chat completions endpoint as-is", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "ok" } }]
      })
    });

    await sendChatMessage(fetchMock, {
      baseUrl: "https://gateway.example.com/openai/v1/chat/completions",
      apiKey: "secret",
      model: "gpt-4.1-mini",
      systemPrompt: ""
    }, [{ role: "user", content: "hi" }]);

    expect(fetchMock).toHaveBeenCalledWith("https://gateway.example.com/openai/v1/chat/completions", expect.anything());
  });

  it("returns a structured error when the API key is missing", async () => {
    await expect(sendChatMessage(vi.fn(), {
      baseUrl: "https://api.example.com",
      apiKey: "",
      model: "gpt-4.1-mini",
      systemPrompt: ""
    }, [{ role: "user", content: "hi" }])).rejects.toMatchObject({
      code: "missing-api-key"
    });
  });

  it("turns low-level fetch failures into actionable network errors", async () => {
    const fetchError = new TypeError("fetch failed");
    Object.assign(fetchError, {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.xiaomimimo.com"), { code: "ENOTFOUND" })
    });
    const fetchMock = vi.fn().mockRejectedValue(fetchError);

    await expect(sendChatMessage(fetchMock, {
      baseUrl: "https://api.xiaomimimo.com/",
      apiKey: "secret",
      model: "mimo-v2.5-pro",
      systemPrompt: ""
    }, [{ role: "user", content: "hi" }])).rejects.toMatchObject({
      code: "network-error",
      message: expect.stringContaining("DNS")
    });
  });

  it("reads validated pet actions from model tool calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{
              id: "call_pet",
              type: "function",
              function: {
                name: "control_pet",
                arguments: JSON.stringify({ type: "jump" })
              }
            }]
          }
        }]
      })
    });

    const response = await sendChatMessage(fetchMock, {
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "gpt-4.1-mini",
      systemPrompt: ""
    }, [{ role: "user", content: "跳一下" }]);

    expect(response.content).toBe("好的。");
    expect(response.petActions).toEqual([{ type: "jump" }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools[0].function.name).toBe("control_pet");
    expect(JSON.stringify(body.tools[0])).toContain("setMovement");
    expect(JSON.stringify(body.tools[0])).toContain("review");
    expect(JSON.stringify(body.tools[0])).toContain("waiting");
  });

  it("accepts OpenAI-like content arrays and object tool arguments", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            role: "assistant",
            content: [{ type: "text", text: "我去玩一会儿。" }],
            tool_calls: [{
              id: "call_pet",
              type: "function",
              function: {
                name: "control_pet",
                arguments: { type: "setMovement", enabled: true, intensity: "normal" }
              }
            }]
          }
        }]
      })
    });

    const response = await sendChatMessage(fetchMock, {
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "mimo-v2.5-pro",
      systemPrompt: ""
    }, [{ role: "user", content: "你可以去玩耍了" }]);

    expect(response.content).toBe("我去玩一会儿。");
    expect(response.petActions).toEqual([{ type: "setMovement", enabled: true, intensity: "normal" }]);
  });

  it("accepts legacy function_call pet actions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            function_call: {
              name: "control_pet",
              arguments: JSON.stringify({ type: "stopMovement" })
            }
          }
        }]
      })
    });

    const response = await sendChatMessage(fetchMock, {
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "mimo-v2.5-pro",
      systemPrompt: ""
    }, [{ role: "user", content: "安静会" }]);

    expect(response.content).toBe("好的。");
    expect(response.petActions).toEqual([{ type: "stopMovement" }]);
  });
});
