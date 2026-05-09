import { describe, expect, it } from "vitest";
import { fileToMessageContent } from "../src/lib/fileMessage";

describe("fileToMessageContent", () => {
  it("turns an uploaded text file into a prompt message", async () => {
    const file = new File(["hello xiaomi"], "note.txt", { type: "text/plain" });

    await expect(fileToMessageContent(file)).resolves.toContain("我上传了文件：note.txt");
    await expect(fileToMessageContent(file)).resolves.toContain("hello xiaomi");
  });

  it("truncates large file content", async () => {
    const file = new File(["abcdef"], "large.txt", { type: "text/plain" });

    await expect(fileToMessageContent(file, 3)).resolves.toContain("...[已截断 3 个字符]");
  });
});
