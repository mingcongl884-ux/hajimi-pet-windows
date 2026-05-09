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
    expect(body).toMatchObject({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "hi" }
      ]
    });
    expect(response.content).toBe("hello");
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
});
