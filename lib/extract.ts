import { PDFParse } from "pdf-parse";

export async function extractText(file: File): Promise<string> {
    if (file.type === 'application/pdf'){
        const buffer = Buffer.from(await file.arrayBuffer());
        const parser = new PDFParse({data: buffer});
        const result = await parser.getText();
        await parser.destroy();
        return result.text;
    }
    return await file.text();
}