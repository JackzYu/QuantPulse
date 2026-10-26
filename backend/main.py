from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "QuantPulse backend is running"}