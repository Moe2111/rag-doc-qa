import {extractText} from "@/lib/extract";
import {chunkText} from "@/lib/chunk";
import {embedBatch} from "@/lib/embeddings";
import {upsertVectors} from "@/lib/pinecone";
import { uploadToS3 } from "@/lib/s3";

// Ingest is the slow path: PDF extraction + an embedding round-trip + two
// network writes. Locally it runs ~6-8s, so the platform default (often 10s)
// is uncomfortably close. Raise the ceiling rather than fail on big documents.
export const maxDuration = 60;

export async function POST(request: Request){

    let formData: FormData;

    try{
        formData = await request.formData();

    }catch{
        return Response.json({error: "expected multipart form data"},
            {status: 400}
        );
    }
    
    const file = formData.get('file');
    if (!(file instanceof File)){
            return Response.json({error: "no file uploaded"}, {status: 400});
        }

    try {
    const text = await extractText(file);
    const chunks = chunkText(text);
    const vectors = await embedBatch(chunks);

    const key = await uploadToS3(file);

    const records = chunks.map((chunk, i) => ({
        id: file.name + " " + i.toString(),
        values: vectors[i],
        metadata: {source: file.name, text: chunk, s3Key: key},
    }));

    
    await upsertVectors(records);


    return Response.json({
        name: file.name,
        chunks: chunks.length,
        key: key,
    });

    }catch (error){
        console.error("ingest failed: ", error);
        return Response.json({error: "ingest failed"}, {status: 500});
    }


}