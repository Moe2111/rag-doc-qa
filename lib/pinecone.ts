import { Pinecone } from "@pinecone-database/pinecone";


function getIndex() {
    const apikey = process.env.PINECONE_API_KEY;
    if(!apikey){
        throw new Error("PINECONE_API_KEY is not set");
    }
    const pc = new Pinecone({apiKey: apikey});
    const pinIndex = process.env.PINECONE_INDEX;
    if(!pinIndex){
        throw new Error("PINECONE_INDEX is not set")
    }
    return pc.index(pinIndex);
}

export async function upsertVectors(
    records: {id: string; values: number[]; metadata?: Record<string, string> }[]
): Promise<void> {
    const index = getIndex();
    await index.upsert({ records: records});
}

export async function searchSimilar(vector: number[], topK = 4){
    const index = getIndex();
    const response  = await index.query({
        vector: vector,
        topK: topK,
        includeMetadata: true,
    });
    return response.matches;
}
