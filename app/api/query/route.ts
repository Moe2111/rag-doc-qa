import { embed } from "@/lib/embeddings";
import { searchSimilar } from "@/lib/pinecone";
import { answerQuestion } from "@/lib/anthropic";


export async function POST(request: Request) {
    let body: unknown;

    try{
        body = await request.json();
    } catch {
        return Response.json({error: "expected JSON body"}, {status: 400});
    }


    const question = (body as {question?: unknown}).question;
    if(typeof question !== "string" || question.trim() === ""){
        return Response.json({error: "question is required"}, {status: 400});
    }

    try {
        const vector = await embed(question);
        const matches = await searchSimilar(vector, 4);


        const chunks = matches.map((m) => ({
            text: String(m.metadata?.text ?? ""),
            source: String(m.metadata?.source ?? "unknown"),
        }));
        
        const answer = await answerQuestion(question, chunks);

        return Response.json({
            answer,
            source: [...new Set(chunks.map((c) => c.source))],  
        });

    } catch (error) {
        console.error("query failed: ", error);
        return Response.json({ error: "query failed" }, { status: 500 });
    }
}