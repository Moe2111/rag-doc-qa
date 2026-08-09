import { PDFParse } from "pdf-parse";
// pdfjs defaults to DOMCanvasFactory, which needs browser globals (DOMMatrix,
// Path2D) that don't exist in a serverless Node runtime. pdf-parse ships a
// Node-compatible factory — pass it explicitly or PDF parsing 500s in prod.
import { CanvasFactory } from "pdf-parse/worker";

export async function extractText(file: File): Promise<string> {
    if (file.type === 'application/pdf'){
        const buffer = Buffer.from(await file.arrayBuffer());
        const parser = new PDFParse({data: buffer, CanvasFactory});
        const result = await parser.getText();
        await parser.destroy();
        return result.text;
    }
    return await file.text();
}