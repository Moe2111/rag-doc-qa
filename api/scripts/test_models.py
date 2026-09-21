import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    base_url=os.getenv("AZURE_OPENAI_ENDPOINT")
)

# chat: Response API
QUESTION = "In a UAE employment contract, what is the standard notice period for termination?"


resp = client.responses.create(
    model=os.getenv("CHAT_DEPLOYMENT"),
    instructions="You answer questions about business contracts concisely.",
    input=QUESTION,
    max_output_tokens=2000
)
print(resp.output_text)
print(resp.usage)


# Embedding

texts = [
    QUESTION,

    # the clause that should answer it
    "Either party may terminate this agreement by providing the other party "
    "with no less than thirty (30) days' prior written notice.",

    # same clause in Arabic
    "يجوز لأي من الطرفين إنهاء هذا العقد بإشعار كتابي مسبق لا تقل مدته عن ثلاثين (30) يومًا.",

    # control: a real clause about something else
    "The employee shall not disclose any confidential information belonging to "
    "the employer during or after the term of employment.",
]

emb = client.embeddings.create(
    model=os.getenv("EMBED_DEPLOYMENT"),
    input=texts
)

vec = emb.data[0].embedding
print(len(vec))
