import Anthropic from "@anthropic-ai/sdk";

export async function answerQuestion(question: string, chunks: {text: string; source: string }[]): Promise<string>{

    const client = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});
    
    const context = chunks.map((c) => `${c.text} (source: ${c.source})`).join("\n\n");

    const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 16000,
        system: `You answer questions using ONLY the provided context. 
        If the answer is not in the context, say you don't know based on the documents provided.
        Do not use outside knowledge. Cite the source filename for each claim you make.`,
        messages: [
            {role: "user", content: `Context:\n${context}\n\nQuestion: ${question}`},
        ],
    });

    const block = response.content[0];
    if(block.type !== "text"){
        throw new Error("Claude did not return a text response");
    }
    return block.text;
}