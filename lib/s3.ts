import { S3Client, PutObjectCommand} from "@aws-sdk/client-s3";


export async function uploadToS3(file: File): Promise<string> {
    const bucket = process.env.S3_BUCKET;
    if(!bucket){
        throw new Error("S3_BUCKET not set");
    }


    const client = new S3Client({});
    
    const key = `uploads/${file.name}`;
    const body = Buffer.from(await file.arrayBuffer());

    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: file.type,
    }));

    return key;
}