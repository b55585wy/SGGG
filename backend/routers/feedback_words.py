from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from feedback_words import generate_feedback_words


class FeedbackWordsGenerateRequest(BaseModel):
    nickname: str
    picky_food: str
    self_rating: int
    self_description: str
    recent_phrases: list[str] = []
    seed: int


class FeedbackWordsGenerateResponse(BaseModel):
    text: str


router = APIRouter(prefix="/api/v1/feedback_words", tags=["feedback_words"])


@router.post("/generate", response_model=FeedbackWordsGenerateResponse)
def feedback_words_generate(req: FeedbackWordsGenerateRequest):
    if req.self_rating < 1 or req.self_rating > 10:
        raise HTTPException(422, detail={"error": {"code": "VALIDATION_ERROR", "message": "self_rating must be 1-10"}})
    try:
        text = generate_feedback_words(req.model_dump())
    except Exception as e:
        raise HTTPException(503, detail={"error": {"code": "FEEDBACK_LLM_ERROR", "message": str(e)}})
    return FeedbackWordsGenerateResponse(text=text)
