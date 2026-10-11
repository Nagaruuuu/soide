// Unit test module trích xuất file (thuần code, không AI, không mạng).
// Fixture dựng trong bộ nhớ: TXT buffer, DOCX zip-stored tối thiểu, PDF 1 trang tối thiểu.
import test from "node:test";
import assert from "node:assert";
import { detectFileType } from "../src/modules/extract/fileTypes.js";
import { extractTxt } from "../src/modules/extract/txtExtractor.js";
import { extractDocx } from "../src/modules/extract/docxExtractor.js";
import { extractPdf } from "../src/modules/extract/pdfExtractor.js";
import { extractPptxStub, ocrStub, needsOcr } from "../src/modules/extract/stubs.js";
import { extractFromBuffer } from "../src/modules/extract/extract.js";

// ---------- fixture builders ----------

function crc32(buf) {
  let table = crc32._t;
  if (!table) {
    table = crc32._t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Zip STORED (không nén) tối thiểu đủ cho mammoth đọc word/document.xml
function buildDocx(paragraphs) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ps = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join("");
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${ps}</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const files = [
    ["[Content_Types].xml", Buffer.from(contentTypes, "utf8")],
    ["word/document.xml", Buffer.from(docXml, "utf8")],
  ];
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const fname = Buffer.from(name, "utf8");
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(10, 4);
    head.writeUInt16LE(0, 6);
    head.writeUInt16LE(0, 8); // stored
    head.writeUInt32LE(0, 10); // time/date
    head.writeUInt32LE(crc32(data), 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(fname.length, 26);
    head.writeUInt16LE(0, 28);
    chunks.push(head, fname, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(10, 4); cen.writeUInt16LE(10, 6);
    cen.writeUInt16LE(0, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt32LE(0, 12);
    cen.writeUInt32LE(crc32(data), 16);
    cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(fname.length, 28);
    for (let i = 30; i < 42; i++) cen[i] = 0;
    cen.writeUInt32LE(offset, 42);
    central.push(cen, fname);
    offset += head.length + fname.length + data.length;
  }
  const cenStart = offset;
  const cenBuf = Buffer.concat(central);
  chunks.push(cenBuf);
  offset += cenBuf.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(cenStart, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);
  return Buffer.concat(chunks);
}

// PDF 1 trang tối thiểu (WinAnsi/ASCII để pdf-parse đọc chắc chắn)
function buildPdf(lines) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const ops = lines.map((ln, i) => `BT /F1 12 Tf 72 ${720 - i * 20} Td (${esc(ln)}) Tj ET`).join("\n");
  const objs = [];
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`;
  objs[4] = `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`;
  objs[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let out = `%PDF-1.4\n`;
  const offsets = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// ---------- tests ----------

test("fileTypes: nhận đúng docx/pdf/txt qua magic + đuôi", () => {
  const docx = buildDocx(["hi"]);
  assert.equal(detectFileType({ buffer: docx, originalName: "de.docx" }).fileType, "docx");
  const pdf = buildPdf(["hello"]);
  assert.equal(detectFileType({ buffer: pdf, originalName: "de.pdf" }).fileType, "pdf");
  assert.equal(detectFileType({ buffer: Buffer.from("abc", "utf8"), originalName: "de.txt" }).fileType, "txt");
});

test("fileTypes: từ chối exe/giả mạo đuôi", () => {
  const fake = detectFileType({ buffer: Buffer.from("MZ fake binary....", "utf8"), originalName: "de.docx" });
  assert.equal(fake.supported, false);
  const exe = detectFileType({ buffer: Buffer.from("MZ....", "utf8"), originalName: "virus.exe" });
  assert.equal(exe.supported, false);
});

test("fileTypes: pptx đi stub riêng", () => {
  const zip = buildDocx(["slide?"]);
  const d = detectFileType({ buffer: zip, originalName: "slide.pptx" });
  assert.equal(d.fileType, "pptx");
  assert.equal(d.stub, true);
});

test("fileTypes: docx với mimetype trình duyệt KHÔNG bị nhầm thành pptx", async () => {
  // Browser gửi mimetype chứa "officedocument" cho .docx thật
  const buf = buildDocx(["Câu 1: 2+2=?"]);
  const d = detectFileType({
    buffer: buf,
    originalName: "de.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.equal(d.fileType, "docx");
  assert.equal(d.supported, true);
  const out = await extractFromBuffer(buf, {
    originalName: "de.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.equal(out.fileType, "docx");
  assert.ok(out.text.includes("Câu 1"));
});

test("txt: giữ nguyên thứ tự câu/A-D/đáp án, strip BOM + CRLF", () => {
  const raw = "\uFEFFCâu 1: 2+2=?\r\nA. 3\r\nB. 4\r\nC. 5\r\nD. 6\r\nĐáp án: B";
  const { text } = extractTxt(Buffer.from(raw, "utf8"));
  assert.ok(!text.includes("\r") && !text.startsWith("\uFEFF"));
  const iQ = text.indexOf("Câu 1"), iA = text.indexOf("A. 3"), iD = text.indexOf("D. 6"), iAns = text.indexOf("Đáp án: B");
  assert.ok(iQ < iA && iA < iD && iD < iAns);
});

test("txt: file rỗng báo EMPTY_FILE", () => {
  assert.throws(() => extractTxt(Buffer.alloc(0)), (e) => e.code === "EMPTY_FILE");
});

test("docx: trích xuất đúng thứ tự đoạn", async () => {
  const buf = buildDocx(["Câu 1: 2+2=?", "A. 3", "B. 4", "Đáp án: B"]);
  const { text } = await extractDocx(buf);
  const i = ["Câu 1", "A. 3", "B. 4", "Đáp án: B"].map((s) => text.indexOf(s));
  assert.ok(i.every((x) => x >= 0), "thiếu đoạn: " + text);
  assert.ok(i[0] < i[1] && i[1] < i[2] && i[2] < i[3]);
});

test("docx: buffer hỏng báo EXTRACT_FAILED", async () => {
  await assert.rejects(extractDocx(Buffer.from("PK\x03\x04 broken...", "latin1")), (e) => !!e.code);
});

test("pdf: trích xuất text + pageCount", async () => {
  const buf = buildPdf(["Cau 1: 2+2=?", "A. 3", "B. 4", "Dap an: B"]);
  const { text, pageCount } = await extractPdf(buf);
  assert.equal(pageCount, 1);
  assert.ok(text.includes("Cau 1") && text.includes("Dap an"), "text: " + text.slice(0, 200));
});

test("pdf: quá số trang báo TOO_MANY_PAGES", async () => {
  const buf = buildPdf(["hi"]);
  await assert.rejects(extractPdf(buf, { maxPages: 0 }), (e) => e.code === "TOO_MANY_PAGES");
});

test("stub: pptx + pdf-scan báo mã riêng, không bịa nội dung", async () => {
  await assert.rejects(extractPptxStub(), (e) => e.code === "PPTX_NOT_SUPPORTED_YET");
  assert.equal(needsOcr("   \n "), true);
  await assert.rejects(ocrStub(), (e) => e.code === "PDF_SCAN_NEEDS_OCR");
});

test("facade: txt end-to-end trả JSON thống nhất", async () => {
  const out = await extractFromBuffer(Buffer.from("Câu 1: 2+2=?\nA. 3\nB. 4\nC. 5\nD. 6\nĐáp án: B", "utf8"), { originalName: "de.txt" });
  assert.equal(out.fileType, "txt");
  assert.ok(typeof out.text === "string" && out.text.includes("Câu 1"));
  assert.ok(Array.isArray(out.warnings));
  assert.equal(out.metadata.originalName, "de.txt");
  assert.ok(out.metadata.sizeBytes > 0 && out.metadata.extractedAt);
});

test("facade: docx + pdf end-to-end", async () => {
  const d = await extractFromBuffer(buildDocx(["Câu 1: 2+2=?", "Đáp án: B"]), { originalName: "de.docx" });
  assert.equal(d.fileType, "docx");
  assert.ok(d.text.includes("Câu 1"));
  const p = await extractFromBuffer(buildPdf(["Cau 1: 2+2=?"]), { originalName: "de.pdf" });
  assert.equal(p.fileType, "pdf");
  assert.equal(p.pageCount, 1);
});

test("facade: rỗng / sai loại / quá lớn báo đúng mã", async () => {
  await assert.rejects(extractFromBuffer(Buffer.alloc(0), { originalName: "e.txt" }), (e) => e.code === "EMPTY_FILE");
  await assert.rejects(extractFromBuffer(Buffer.from("MZ....", "utf8"), { originalName: "x.exe" }), (e) => e.code === "UNSUPPORTED_TYPE");
  await assert.rejects(extractFromBuffer(buildDocx(["s"]), { originalName: "s.pptx" }), (e) => e.code === "PPTX_NOT_SUPPORTED_YET");
  process.env.FILE_MAX_MB = "0";
  try {
    await assert.rejects(extractFromBuffer(Buffer.from("abc", "utf8"), { originalName: "a.txt" }), (e) => e.code === "FILE_TOO_LARGE");
  } finally { delete process.env.FILE_MAX_MB; }
});

test("facade: text quá 20k ký tự bị cắt + warning", async () => {
  const big = "Câu hỏi " + "x".repeat(25000);
  const out = await extractFromBuffer(Buffer.from(big, "utf8"), { originalName: "big.txt" });
  assert.ok(out.text.length <= 20000);
  assert.ok(out.warnings.some((w) => /cắt/i.test(w)));
  assert.equal(out.metadata.truncated, true);
});
