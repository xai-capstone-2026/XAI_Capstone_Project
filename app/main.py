from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from app.services.conversation_store import ConversationStore
import uvicorn
import asyncio
from collections import defaultdict
import httpx    # 통신용 라이브러리 추가

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

store = ConversationStore()
session_locks = defaultdict(asyncio.Lock)

COLAB_ASK_URL = "https://api.kr-welfare-xai.com/ask"
COLAB_ANALYZE_URL = "https://api.kr-welfare-xai.com/analyze"


def _safe_float(value, default: float = 0.0) -> float:
    """
    Captum attribution 값이 문자열/None 등으로 들어와도
    프론트 표시용 계산이 깨지지 않도록 안전하게 float으로 변환한다.
    """
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _empty_retrieval_debug() -> dict:
    """
    Colab /ask에서 retrieval_debug가 없거나,
    /ask 호출 자체가 실패했을 때 프론트에 내려줄 기본 구조.
    """
    return {
        "before_rerank": [],
        "after_rerank": [],
    }


def _make_xai_error(message: str) -> dict:
    """
    Captum 분석이 실패했을 때도 /chat 전체 응답이 깨지지 않도록
    xai 필드의 기본 에러 구조를 만들어준다.
    """
    return {
        "type": "document_ablation",
        "status": "error",
        "items": [],
        "raw": {
            "words": [],
            "attributions": [],
        },
        "summary": message,
    }


def _normalize_captum_result(captum_raw: dict | None) -> dict:
    """
    Colab /analyze가 반환한 Captum 원본 결과를
    프론트에서 바로 표시하기 쉬운 형태로 변환한다.

    Colab /analyze 예상 결과:
    {
        "words": ["문서 1: ...", "문서 2: ...", "사용자 질문"],
        "attributions": [12.3, 4.7, 1.2],
        "answer": "..."
    }

    변환 후 /chat 응답의 xai:
    {
        "type": "document_ablation",
        "status": "ok",
        "items": [
            {
                "label": "문서 1: ...",
                "kind": "document",
                "raw_score": 12.3,
                "positive_score": 12.3,
                "percent": 67.6
            }
        ],
        "raw": {
            "words": [...],
            "attributions": [...]
        },
        "summary": "..."
    }

    정규화 기준:
    - Captum 원본 attribution 값은 raw에 그대로 보존한다.
    - 사용자 화면에는 양수 기여도만 합산해 100% 기준으로 보여준다.
    - 음수 attribution은 '답변 기여도가 낮거나 방해된 항목'으로 볼 수 있어
      사용자 표시용 percent 계산에서는 0으로 처리한다.
    """
    if not isinstance(captum_raw, dict):
        return _make_xai_error("Captum 분석 결과 형식이 올바르지 않습니다.")

    words = captum_raw.get("words") or []
    attributions = captum_raw.get("attributions") or []

    if not isinstance(words, list) or not isinstance(attributions, list):
        return _make_xai_error("Captum 분석 결과에 words/attributions 배열이 없습니다.")

    # words와 attributions 길이가 혹시 다를 경우를 대비해
    # 둘 중 더 짧은 길이에 맞춰 안전하게 처리한다.
    pair_count = min(len(words), len(attributions))

    items = []

    for idx in range(pair_count):
        label = str(words[idx] or f"항목 {idx + 1}")
        raw_score = _safe_float(attributions[idx])

        # 사용자 화면용 비율 계산에는 양수만 사용한다.
        # 음수는 원본값으로는 보존하되, percent 계산에서는 0으로 본다.
        positive_score = max(raw_score, 0.0)

        # Captum feature 중 "사용자 질문"은 문서가 아니므로 kind를 query로 구분한다.
        # 나머지는 검색 문서로 간주한다.
        kind = "query" if "사용자 질문" in label or label.strip() == "질문" else "document"

        items.append({
            "label": label,
            "kind": kind,
            "raw_score": raw_score,
            "positive_score": positive_score,
            "percent": 0.0,
        })

    # 양수 기여도 합계를 기준으로 100% 정규화한다.
    total_positive = sum(item["positive_score"] for item in items)

    if total_positive > 0:
        for item in items:
            item["percent"] = round((item["positive_score"] / total_positive) * 100, 1)

    # 팝업 상단에 보여줄 간단 요약문 생성
    if items:
        top_item = max(items, key=lambda item: item["positive_score"])

        if top_item["positive_score"] > 0:
            summary = f"이 답변은 주로 '{top_item['label']}' 항목에 가장 크게 의존했습니다."
        else:
            summary = "뚜렷하게 양수 기여도를 보인 항목이 없습니다."
    else:
        summary = captum_raw.get("message") or "Captum 분석 결과가 비어 있습니다."

    return {
        "type": "document_ablation",
        "status": "ok" if items else "empty",
        "items": items,

        # raw는 사용자 화면용이 아니라 개발자 확인용.
        # 프론트에서 console.log로 찍어 F12에서 확인할 수 있게 둔다.
        "raw": {
            "words": words,
            "attributions": attributions,
            "answer": captum_raw.get("answer"),
            "message": captum_raw.get("message"),
        },
        "summary": summary,
    }


class ChatRequest(BaseModel):
    user_id: str
    conversation_id: str
    message: str

class CreateConversationRequest(BaseModel):
    user_id: str
    title: str | None = "새 채팅"


class UpdateConversationTitleRequest(BaseModel):
    user_id: str
    title: str

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")
def _raise_store_http_error(e: Exception) -> None:
    if isinstance(e, ValueError):
        raise HTTPException(status_code=400, detail=str(e))
    if isinstance(e, PermissionError):
        raise HTTPException(status_code=403, detail=str(e))
    if isinstance(e, FileNotFoundError):
        raise HTTPException(status_code=404, detail=str(e))
    raise HTTPException(status_code=500, detail="대화 저장소 처리 중 오류가 발생했습니다.")


@app.get("/conversations")
async def conversations(user_id: str):
    try:
        conversations = store.list_conversations(user_id)
        return {"conversations": conversations}
    except Exception as e:
        _raise_store_http_error(e)


@app.post("/conversations")
async def conversations_create(request: CreateConversationRequest):
    try:
        conversation = store.create_conversation(
            request.user_id,
            request.title or "새 채팅",
        )
        return {"conversation": conversation}
    except Exception as e:
        _raise_store_http_error(e)


@app.get("/conversations/{conversation_id}")
async def conversations_detail(conversation_id: str, user_id: str):
    try:
        conversation = store.get_conversation(conversation_id, user_id)
        return {"conversation": conversation}
    except Exception as e:
        _raise_store_http_error(e)


@app.patch("/conversations/{conversation_id}/title")
async def conversations_update_title(
    conversation_id: str,
    request: UpdateConversationTitleRequest,
):
    try:
        conversation = store.update_conversation_title(
            conversation_id,
            request.user_id,
            request.title,
        )
        return {"conversation": conversation}
    except Exception as e:
        _raise_store_http_error(e)


@app.delete("/conversations/{conversation_id}")
async def conversations_delete(conversation_id: str, user_id: str):
    try:
        store.delete_conversation(conversation_id, user_id)
        return {"ok": True}
    except Exception as e:
        _raise_store_http_error(e)

# @app.post("/chat")
# async def chat(request: ChatRequest):
#     lock_key = request.conversation_id

#     async with session_locks[lock_key]:
#         try:
#             history = store.build_llama_history(
#                 request.conversation_id,
#                 request.user_id,
#             )

#             # Colab과 통신
#             async with httpx.AsyncClient(verify=False) as client:
#                 colab_api_url = "https://api.kr-welfare-xai.com/ask"
#                 # 코랩 API 규격인 {"query": "..."} 에 맞게 보냅니다.
#                 api_response = await client.post(
#                     colab_api_url, 
#                     json={"query": request.message},
#                     timeout=60.0  # 답변 대기 시간 넉넉히 60초
#                 )
                
#                 if api_response.status_code == 200:
#                     answer = api_response.json().get("answer", "답변을 추출하지 못했습니다.")
#                 else:
#                     answer = f"코랩 서버 응답 에러: {api_response.status_code}"

#             store.append_message(
#                 request.conversation_id,
#                 request.user_id,
#                 "user",
#                 request.message,
#             )

#             store.maybe_update_title_from_first_user_message(
#                 request.conversation_id,
#                 request.user_id,
#                 request.message,
#             )

#             store.append_message(
#                 request.conversation_id,
#                 request.user_id,
#                 "assistant",
#                 answer,
#             )

#             return {"answer": answer}
#         except Exception as e:
#             _raise_store_http_error(e)

@app.post("/chat")
async def chat(request: ChatRequest):
    lock_key = request.conversation_id

    # 같은 대화방에서 동시에 여러 요청이 들어오면
    # Colab GPU 호출과 대화 저장 순서가 꼬일 수 있으므로 conversation_id 단위로 lock을 건다.
    async with session_locks[lock_key]:
        try:
            # 대화방이 실제로 존재하고, 해당 user_id가 접근 가능한지 먼저 확인한다.
            store.get_conversation(
                request.conversation_id,
                request.user_id,
            )

            # 기본값 설정
            # /ask 또는 /analyze가 실패해도 응답 JSON 구조가 깨지지 않도록
            # answer, retrieval_debug, xai의 기본 구조를 먼저 만들어둔다.
            answer = "답변을 생성하지 못했습니다."
            retrieval_debug = _empty_retrieval_debug()
            xai = _make_xai_error("XAI 분석이 수행되지 않았습니다.")

            async with httpx.AsyncClient(verify=False) as client:
                # ============================================================
                # 1) Colab /ask 호출
                # ============================================================
                # - RAG 검색
                # - Reranker 재정렬
                # - Qwen 답변 생성
                # - retrieval_debug 반환
                ask_response = await client.post(
                    COLAB_ASK_URL,
                    json={"query": request.message},
                    timeout=60.0,
                )

                if ask_response.status_code == 200:
                    ask_data = ask_response.json()

                    # 사용자에게 보여줄 최종 답변
                    answer = ask_data.get("answer", "답변을 추출하지 못했습니다.")

                    # Colab /ask에서 넘겨주는 RAG/Reranker 디버그 정보
                    # 없을 경우에는 프론트 렌더링이 깨지지 않도록 빈 구조를 사용한다.
                    retrieval_debug = (
                        ask_data.get("retrieval_debug")
                        or _empty_retrieval_debug()
                    )

                    # ========================================================
                    # 2) Colab /analyze 호출
                    # ========================================================
                    # - 방금 /ask에서 생성된 답변과 context를 기준으로
                    #   Captum Feature Ablation 분석 수행
                    try:
                        analyze_response = await client.post(
                            COLAB_ANALYZE_URL,
                            json={"query": request.message},
                            # Captum은 LLM forward를 여러 번 수행하므로 /ask보다 오래 걸릴 수 있다.
                            timeout=180.0,
                        )

                        if analyze_response.status_code == 200:
                            captum_raw = analyze_response.json()

                            # Colab 원본 Captum 결과(words, attributions)를
                            # 프론트 표시용 xai.items(percent 포함) 구조로 변환한다.
                            xai = _normalize_captum_result(captum_raw)
                        else:
                            # /ask는 성공했지만 /analyze만 실패한 경우
                            # 답변은 정상 표시하고, xai만 error 상태로 내려보낸다.
                            xai = _make_xai_error(
                                f"Colab /analyze 응답 에러: {analyze_response.status_code}"
                            )

                    except Exception as analyze_error:
                        # Captum 분석 중 timeout, 연결 오류 등이 나도
                        # 전체 답변 표시를 막지 않기 위해 xai만 error 처리한다.
                        xai = _make_xai_error(
                            f"Captum 분석 중 오류가 발생했습니다: {str(analyze_error)}"
                        )

                else:
                    # /ask 자체가 실패한 경우
                    # 답변 생성이 실패했으므로 Captum 분석도 수행하지 않는다.
                    answer = f"코랩 서버 응답 에러: {ask_response.status_code}"
                    retrieval_debug = _empty_retrieval_debug()
                    xai = _make_xai_error(
                        "답변 생성 실패로 XAI 분석을 수행하지 않았습니다."
                    )

            # ============================================================
            # 3) 대화 저장
            # ============================================================
            # 저장소에는 기존처럼 사용자 메시지와 assistant 답변만 저장한다.
            # retrieval_debug와 xai는 매번 계산되는 부가 분석 결과이므로
            # 대화 본문에는 저장하지 않고 현재 응답에만 포함한다.
            store.append_message(
                request.conversation_id,
                request.user_id,
                "user",
                request.message,
            )

            store.maybe_update_title_from_first_user_message(
                request.conversation_id,
                request.user_id,
                request.message,
            )

            store.append_message(
                request.conversation_id,
                request.user_id,
                "assistant",
                answer,
            )

            # ============================================================
            # 4) 프론트로 통합 응답 반환
            # ============================================================
            # chat.js는 앞으로 /captum을 따로 호출하지 않고,
            # 이 응답 안의 xai와 retrieval_debug를 사용해 팝업을 구성한다.
            return {
                "answer": answer,
                "retrieval_debug": retrieval_debug,
                "xai": xai,
            }

        except Exception as e:
            _raise_store_http_error(e)


@app.post("/captum")
async def captum(request: ChatRequest):
    lock_key = request.conversation_id

    async with session_locks[lock_key]:
        try:
            store.get_conversation(request.conversation_id, request.user_id)

            # Colab의 XAI 전용 API(/analyze)로 분석 요청 토스
            async with httpx.AsyncClient(verify=False) as client:
                colab_captum_url = "https://api.kr-welfare-xai.com/analyze"
                
                api_response = await client.post(
                    colab_captum_url, 
                    json={"query": request.message},
                    timeout=120.0
                )
                
                if api_response.status_code == 200:
                    result = api_response.json()
                    return result
                else:
                    return {"words": ["서버", "응답", "에러"], "attributions": [0.0, 0.0, 0.0]}

        except Exception as e:
            _raise_store_http_error(e)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) # 🔄️ port 9000 => 8000


