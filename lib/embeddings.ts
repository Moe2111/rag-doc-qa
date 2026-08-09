import { VoyageAIClient } from "voyageai";


export async function embed(text: string): Promise<number[]> {
    const client = new VoyageAIClient({apiKey: process.env.VOYAGE_API_KEY});

    const response = await client.embed({
        input: text,
        model: "voyage-3-lite",
    });

    const vector = response?.data?.[0]?.embedding; 
    if (!vector){
        throw new Error("Voyage did not return an embedding");
    }
    return vector;
}

export async function embedBatch(texts: string[]): Promise<number[][]>{
    const client = new VoyageAIClient({apiKey: process.env.VOYAGE_API_KEY});

    const response = await client.embed({
        input: texts,
        model: "voyage-3-lite",
    });

    const items = response?.data;

    if(items?.length !== texts.length){
        throw new Error("Array missing or wrong number of arrays ")
    }

    return items.map((item) => {
        if (!item.embedding) {
            throw new Error ("missing embedding in response");
        }
        return item.embedding;
    });
    

}
