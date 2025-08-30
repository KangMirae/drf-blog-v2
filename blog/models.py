from django.db import models
from django.conf import settings

class Like(models.Model):
    post = models.ForeignKey('Post', on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('post', 'user')  # 같은 사용자가 같은 글을 중복 좋아요 금지
        ordering = ('-id',)

    def __str__(self):
        return f"Like#{self.id} by {self.user} on Post#{self.post_id}"

class Comment(models.Model):
    post = models.ForeignKey('Post', on_delete=models.CASCADE, related_name='comments')  # 어떤 글의 댓글인가
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='comments')  # 작성자
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)   # 생성 시각
    updated_at = models.DateTimeField(auto_now=True)       # 수정 시각

    def __str__(self):
        return f"Comment#{self.id} by {self.author} on Post#{self.post_id}"

class Post(models.Model):
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='posts')
    title = models.CharField(max_length=200)                 # 글 제목(검색/리스트에 보임)
    content = models.TextField(blank=True)                   # 본문(길이 제한 없음)
    created_at = models.DateTimeField(auto_now_add=True)     # 처음 생성된 시간
    updated_at = models.DateTimeField(auto_now=True)         # 마지막 수정 시간

    def __str__(self):
        return f"{self.id} - {self.title}"

