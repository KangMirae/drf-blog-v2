# blog/ai.py
import json, re, logging
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from typing import List
from django.conf import settings

logger = logging.getLogger(__name__)
SAFETY_OFF = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

# -------------------------
# Fallback (Dummy provider)
# -------------------------
class DummyAI:
    def summarize(self, text: str, max_chars: int = 240) -> str:
        """간단 요약 폴백: 첫 단락을 잘라 반환"""
        if not text:
            return ""
        s = text.strip().split("\n\n", 1)[0].strip()
        logger.info("AI: Dummy summarize() used")
        return s[:max_chars]

    def suggest_tags(self, text: str, k: int = 5) -> List[str]:
        """태그 폴백: 비어있는 리스트"""
        logger.info("AI: Dummy suggest_tags() used")
        return []

# -------------------------
# Gemini provider
# -------------------------
class GeminiAI:
    def __init__(self, api_key: str, summary_model: str, tag_model: str):
        # SDK 전역 설정
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.genai = genai
        self.summary_model = summary_model or "gemini-2.5-flash"
        self.tag_model = tag_model or "gemini-2.5-flash"
        logger.info("Gemini configured: summary=%s, tags=%s", self.summary_model, self.tag_model)

    def _gen(self, model: str, system: str, user: str, *, json_mode: bool = False, max_tokens: int = 256) -> str:
        generation_config = {"max_output_tokens": max_tokens}
        if json_mode:
            generation_config["response_mime_type"] = "application/json"

        m = self.genai.GenerativeModel(
            model,
            generation_config=generation_config,
            safety_settings=SAFETY_OFF,  # ✅ 안전필터 완화
        )

        try:
            # 문자열 합치기 대신 contents 구조로 주는 것도 가능하지만, 현재 형태 유지
            resp = m.generate_content((system or "") + "\n\n" + (user or ""))

            # ✅ candidates 기반 안전 파싱
            cands = getattr(resp, "candidates", None) or []
            if not cands:
                logger.warning("Gemini: no candidates returned")
                return ""

            cand = cands[0]
            # finish_reason 1(=STOP) 외엔 대부분 차단/중단
            fr = getattr(cand, "finish_reason", None)
            if fr is not None and fr != 1:
                logger.warning("Gemini: non-STOP finish_reason=%s safety=%s", fr, getattr(cand, "safety_ratings", None))
                return ""

            parts = getattr(cand, "content", None)
            parts = getattr(parts, "parts", []) if parts else []
            texts = [p.text for p in parts if hasattr(p, "text") and isinstance(p.text, str)]
            out = " ".join(texts).strip()
            return out

        except Exception as e:
            msg = str(e)
            if "API key not valid" in msg or "Permission denied" in msg or "401" in msg:
                logger.error("Gemini 401: API 키가 유효하지 않음 (키/프로젝트/제한 확인 필요)")
            else:
                logger.exception("Gemini call failed: %s", msg)
            return ""

    # ---------- 요약 ----------
    def summarize(self, text: str, max_chars: int = 120) -> str:
        if not text:
            return ""
        system = (
            "역할: 블로그 글 요약자.\n"
            "- 두 문장 이하로 핵심만 남긴다.\n"
            "- 기능/주제 위주, 구현 세부는 제거.\n"
            "- 불필요한 중복 금지."
        )
        user = f"다음 글을 두 문장 이내, {max_chars}자 이하로 한국어로 요약해줘.\n\n글:\n{text}"
        out = self._gen(self.summary_model, system, user, json_mode=False, max_tokens=180)
        return out[:max_chars].strip()

    # ---------- 태그 ----------
    def suggest_tags(self, text: str, k: int = 5) -> List[str]:
        """JSON 우선 → 실패 시 텍스트 파싱 → 최후 폴백 키워드"""
        if not text:
            return []

        # 1) JSON-only 요청
        system = "역할: 간결한 태그 추천기. 출력은 JSON 배열만. 다른 텍스트 금지."
        user = (
            "아래 글을 보고 관련 태그를 3~7개 추천해줘.\n"
            "각 태그는 2~20자, 소문자/한글 허용, 공백·구두점 제거(하이픈 허용).\n"
            "응답은 오직 JSON 배열만 반환해.\n\n" + text
        )
        raw = self._gen(self.tag_model, system, user, json_mode=True, max_tokens=180)

        # 1-1) JSON 직파싱
        tags = self._parse_tags_json(raw, k)
        if tags:
            return tags

        # 2) 모델이 JSON 모드를 어긴 경우: 대괄호 배열 텍스트만 추출해서 재파싱
        m = re.search(r"\[[\s\S]*\]", raw)
        if m:
            tags = self._parse_tags_json(m.group(0), k)
            if tags:
                return tags

        # 3) 최후 폴백: 본문에서 단순 키워드 추출
        return self._simple_keywords(text, k)

    # ---------- 파싱/정제 ----------
    @staticmethod
    def _slugify_token(s: str) -> str:
        s = str(s).strip().lower()
        s = re.sub(r"\s+", "-", s)                           # 공백 → 하이픈
        s = re.sub(r"[^a-z0-9\-가-힣_]", "", s)               # 안전 문자만
        s = re.sub(r"-{2,}", "-", s).strip("-")              # 하이픈 정리
        return s[:30]

    def _parse_tags_json(self, raw: str, k: int) -> List[str]:
        try:
            data = json.loads(raw)
        except Exception:
            logger.warning("Gemini tag JSON parse failed: raw=%r", raw[:200])
            return []

        if isinstance(data, dict) and "tags" in data:
            arr = data.get("tags", [])
        elif isinstance(data, list):
            arr = data
        else:
            arr = []

        cleaned, seen = [], set()
        for t in arr:
            slug = self._slugify_token(t)
            if 2 <= len(slug) <= 20 and slug not in seen:
                cleaned.append(slug)
                seen.add(slug)
        return cleaned[:k]

    @staticmethod
    def _simple_keywords(text: str, k: int) -> List[str]:
        words = re.findall(r"[A-Za-z0-9가-힣_\-]{2,}", (text or "").lower())
        stop = {"그리고","하지만","그러나","the","and","that","this","with","from","for","are"}
        freq = {}
        for w in words:
            if w in stop:
                continue
            freq[w] = freq.get(w, 0) + 1
        # 빈도 내림차순 → 알파 정렬
        out = [w for w, _ in sorted(freq.items(), key=lambda x: (-x[1], x[0]))]
        # 슬러그 규칙 재확인
        out2, seen = [], set()
        for t in out:
            slug = re.sub(r"[^a-z0-9\-가-힣_]", "", t)
            if 2 <= len(slug) <= 20 and slug not in seen:
                out2.append(slug)
                seen.add(slug)
            if len(out2) >= k:
                break
        return out2
    
    def analyze(self, text: str, max_chars: int = 120, k: int = 6) -> tuple[str, List[str]]:
        """
        요약 + 태그를 한 번의 호출에서 JSON으로 받는다.
        반환: (summary, tags)
        """
        if not text:
            return "", []

        model = self.summary_model  # 같은 모델 하나로 처리
        prompt = {
            "task": "blog_summarize_and_tag",
            "lang": "ko",
            "rules": {
                "summary": f"{max_chars}자 이하, 1~2문장, 핵심만.",
                "tags": "3~7개, 2~20자, 소문자/한글, 공백 제거(하이픈 허용), JSON 배열만.",
            },
            "content": text,
            "output_format": {"type": "json", "schema": {"summary": "string", "tags": ["string"]}}
        }

        # JSON 강제 + 안전필터 완화
        m = self.genai.GenerativeModel(
            model,
            generation_config={"response_mime_type": "application/json", "max_output_tokens": 256},
            safety_settings=SAFETY_OFF,
        )
        try:
            resp = m.generate_content(json.dumps(prompt, ensure_ascii=False))
            cands = getattr(resp, "candidates", None) or []
            if not cands:
                logger.warning("Gemini analyze: no candidates")
                return "", []
            cand = cands[0]
            fr = getattr(cand, "finish_reason", None)
            if fr is not None and fr != 1:
                logger.warning("Gemini analyze: non-STOP finish_reason=%s", fr)
                return "", []

            parts = getattr(cand, "content", None)
            parts = getattr(parts, "parts", []) if parts else []
            raw = ""
            for p in parts:
                if hasattr(p, "text") and isinstance(p.text, str):
                    raw += p.text
            raw = (raw or "").strip()
            data = json.loads(raw)

            summary = (data.get("summary") or "").strip()
            tags_in = data.get("tags") or []

            # 슬러그화/중복제거
            def slugify_token(s: str) -> str:
                s = str(s).strip().lower()
                s = re.sub(r"\s+", "-", s)
                s = re.sub(r"[^a-z0-9\-가-힣_]", "", s)
                s = re.sub(r"-{2,}", "-", s).strip("-")
                return s[:30]
            seen, tags = set(), []
            for t in tags_in:
                slug = slugify_token(t)
                if 2 <= len(slug) <= 20 and slug not in seen:
                    tags.append(slug); seen.add(slug)
            return (summary[:max_chars], tags[:k])

        except Exception as e:
            logger.exception("Gemini analyze failed: %s", e)
            # 폴백: 기존 방식(요약1+태그1)로라도 반환
            return self.summarize(text, max_chars), self.suggest_tags(text, k)

# -------------------------
# Provider selector
# -------------------------
def get_ai():
    masked = (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    logger.info("Gemini key loaded: len=%d, head=%s, tail=%s",
            len(masked), masked[:4], masked[-4:])
    """환경설정에 따라 실제 AI 또는 더미 반환"""
    ai_enable = bool(getattr(settings, "AI_ENABLE", False))
    provider = (getattr(settings, "AI_PROVIDER", "dummy") or "dummy").lower()
    if ai_enable and provider == "gemini":
        api_key = (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
        if api_key:
            try:
                return GeminiAI(
                    api_key=api_key,
                    summary_model=getattr(settings, "GEMINI_SUMMARY_MODEL", "gemini-2.5-flash"),
                    tag_model=getattr(settings, "GEMINI_TAG_MODEL", "gemini-2.5-flash"),
                )
            except Exception as e:
                logger.exception("Gemini init failed: %s", e)
    # 폴백
    logger.warning("AI -> Dummy (enable=%s, provider=%s)", ai_enable, provider)
    return DummyAI()