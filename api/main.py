from fastapi import FastAPI

app = FastAPI(title="docassist-api")

@app.get("/health")
def health():
    return {"status": "ok"}

