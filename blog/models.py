from django.db import models
from django.conf import settings
from django.utils.text import slugify

class Category(models.Model):
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(max_length=60, unique=True)
    def __str__(self): return self.name

class Tag(models.Model):
    name = models.CharField(max_length=30, unique=True)
    slug = models.SlugField(max_length=40, unique=True)
    def __str__(self): return self.name

class Notification(models.Model):
    user = models.ForeignKey(  # 알림 수신자(글 작성자)
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    message = models.CharField(max_length=255)
    post = models.ForeignKey('Post', on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    comment = models.ForeignKey('Comment', on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-id",)

    def __str__(self):
        return f"Notification#{self.id} to {self.user} (read={self.is_read})"
    
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

    # slug
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="posts")
    tags = models.ManyToManyField(Tag, blank=True, related_name="posts")
    slug = models.SlugField(max_length=80, unique=True)

    # AI 결과 저장 필드
    summary = models.TextField(blank=True)  # 요약문 (없을 수도 있으니 blank=True)
    tags_suggested = models.JSONField(default=list, blank=True)  # 추천 태그 리스트

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.id} - {self.title}"
    
    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:70]
            candidate = base
            i = 1
            from django.db.models import Q
            while Post.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                i += 1
                candidate = f"{base}-{i}"
            self.slug = candidate
        super().save(*args, **kwargs)

