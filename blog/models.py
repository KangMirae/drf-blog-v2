from django.db import models
from django.conf import settings

class Post(models.Model):
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='posts')
    title = models.CharField(max_length=200)                 # 글 제목(검색/리스트에 보임)
    content = models.TextField(blank=True)                   # 본문(길이 제한 없음)
    created_at = models.DateTimeField(auto_now_add=True)     # 처음 생성된 시간
    updated_at = models.DateTimeField(auto_now=True)         # 마지막 수정 시간

    def __str__(self):
        return f"{self.id} - {self.title}"
