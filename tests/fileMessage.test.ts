import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { fileToMessageContent } from "../src/lib/fileMessage";

describe("fileToMessageContent", () => {
  it("turns an uploaded text file into a prompt message", async () => {
    const file = new File(["hello xiaomi"], "note.txt", { type: "text/plain" });

    await expect(fileToMessageContent(file)).resolves.toContain("note.txt");
    await expect(fileToMessageContent(file)).resolves.toContain("hello xiaomi");
  });

  it("truncates large text file content", async () => {
    const file = new File(["abcdef"], "large.txt", { type: "text/plain" });

    await expect(fileToMessageContent(file, 3)).resolves.toContain("已截断 3 个字符");
  });

  it("extracts xlsx worksheet text instead of sending zipped binary content", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types />");
    zip.file("xl/workbook.xml", "<workbook><sheets><sheet name=\"Data\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
    zip.file("xl/_rels/workbook.xml.rels", "<Relationships><Relationship Id=\"rId1\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
    zip.file("xl/sharedStrings.xml", "<sst><si><t>项目</t></si><si><t>状态</t></si><si><t>哈吉米</t></si><si><t>完成</t></si></sst>");
    zip.file("xl/worksheets/sheet1.xml", [
      "<worksheet><sheetData>",
      "<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c></row>",
      "<row r=\"2\"><c r=\"A2\" t=\"s\"><v>2</v></c><c r=\"B2\" t=\"s\"><v>3</v></c></row>",
      "</sheetData></worksheet>"
    ].join(""));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const file = new File([bytes], "template.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const message = await fileToMessageContent(file);

    expect(message).toContain("Excel");
    expect(message).toContain("Data");
    expect(message).toContain("项目 | 状态");
    expect(message).toContain("哈吉米 | 完成");
    expect(message).not.toContain("PK");
  });
});
