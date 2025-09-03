# blog/ai.py
import json, re
from typing import List
from django.conf import settings

# (옵션) 아주 간단한 폴백
class DummyAI:
    def summarize(self, text: str, max_chars: int = 240) -> str:
        if not text: return ""
        s = text.strip().split("\n\n", 1)[0].strip()
        return s[:max_chars]
    def suggest_tags(self, text: str, k: int = 5) -> List[str]:
        return []

class GeminiAI:
    def __init__(self, api_key: str):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.genai = genai

    def _gen(self, model: str, system: str, user: str, *, json_mode: bool = False, max_tokens: int = 256) -> str:
        m = self.genai.GenerativeModel(
            model,
            # JSON 강제 모드: 태그 추천처럼 구조적 응답이 필요한 경우 사용
            generation_config={"response_mime_type": "application/json"} if json_mode else None,
        )
        # 간단화를 위해 system을 user 앞에 붙임
        resp = m.generate_content(system + "\n\n" + user)
        # text가 없을 수도 있어 안전 처리
        return (getattr(resp, "text", None) or "").strip()

    def summarize(self, text: str, max_chars: int = 100) -> str:
        if not text: return ""
        system = "역할: 블로그 글 요약자. 규칙: - 두 문장 이하로 핵심만 남긴다. - 기능 이름/주제만 남기고 세부 구현은 제거한다. - 불필요한 반복 표현은 쓰지 않는다."
        user = f"다음 글을 두 문장 이내, {max_chars}자 이하로 요약해줘.\n\n글:\n{text}"
        return self._gen(settings.GEMINI_SUMMARY_MODEL, system, user, max_tokens=120)

    def suggest_tags(self, text: str, k: int = 5) -> List[str]:
        if not text:
            return []
        system = "역할: 간결한 태그 추천기. 출력은 JSON 배열 문자열만."
        user = (
            "아래 글을 보고 관련 태그를 3~7개 추천해줘. "
            "각 태그는 2~20자, 소문자/한글 가능, 공백·구두점 제거. "
            "응답은 오직 JSON 배열 문자열로만 반환해.\n\n"
            f"{text}"
        )
        raw = self._gen(settings.GEMINI_TAG_MODEL, system, user, json_mode=True, max_tokens=150)

        # 1) JSON 직파싱
        tags = self._parse_tags(raw, k)
        if tags:
            return tags

        # 2) 혹시 모델이 JSON 모드를 무시했을 수도 있으니, 대괄호 배열만 추출 시도
        m = re.search(r"\[[\s\S]*\]", raw)
        if m:
            tags = self._parse_tags(m.group(0), k)
            if tags:
                return tags

        # 3) 폴백: 아주 단순 키워드 추출
        return self._simple_keywords(text, k)

    @staticmethod
    def _parse_tags(raw: str, k: int) -> List[str]:
        try:
            data = json.loads(raw)
            tags = []
            for t in data:
                t = str(t).strip().lower()
                # 불필요한 공백/구두점 제거
                t = re.sub(r"[^\w가-힣\-#@]+", "", t)
                if 2 <= len(t) <= 20:
                    tags.append(t)
            # 중복 제거
            seen, uniq = set(), []
            for t in tags:
                if t not in seen:
                    seen.add(t)
                    uniq.append(t)
            return uniq[:k]
        except Exception:
            return []

    @staticmethod
    def _simple_keywords(text: str, k: int) -> List[str]:
        words = re.findall(r"[A-Za-z0-9가-힣#@_\-]{2,}", text.lower())
        stop = {"그리고","하지만","그러나","the","and","that","this","with","from","for","are"}
        freq = {}
        for w in words:
            if w in stop: 
                continue
            freq[w] = freq.get(w, 0) + 1
        return [w for w,_ in sorted(freq.items(), key=lambda x:(-x[1], x[0]))[:k]]

def get_ai():
    # 플래그로 켜진 경우에만 외부 호출
    if getattr(settings, "AI_ENABLE", False):
        provider = getattr(settings, "AI_PROVIDER", "dummy").lower()
        if provider == "gemini" and getattr(settings, "GEMINI_API_KEY", ""):
            return GeminiAI(api_key=settings.GEMINI_API_KEY)
    # 폴백
    return DummyAI()