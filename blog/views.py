from rest_framework import viewsets, permissions, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from django.conf import settings
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count
from rest_framework.decorators import action
from .models import Post, Comment, Like, Notification
from .serializers import PostSerializer, CommentSerializer, NotificationSerializer
from .permissions import IsOwnerOrReadOnly, IsReceiverOnly, IsAdminOrOwnerOrReadOnly
from .ai import get_ai

class NotificationViewSet(viewsets.ModelViewSet):
    """
    /api/notifications/  (내 알림만)
    GET: 목록/조회
    PATCH: 읽음 처리 (is_read=True)
    DELETE: 삭제
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsReceiverOnly]
    queryset = Notification.objects.all()   # 추가: basename 유추용 기본 queryset

    def get_queryset(self):
        # 내 알림만
        return Notification.objects.filter(user=self.request.user).order_by("-id")
    
    @action(detail=False, methods=["get"])
    def unread(self, request):
        """
        GET /api/notifications/unread/
        -> 안 읽은(is_read=False) 알림만
        """
        qs = self.get_queryset().filter(is_read=False)
        page = self.paginate_queryset(qs)
        if page is not None:
            ser = self.get_serializer(page, many=True)
            return self.get_paginated_response(ser.data)
        ser = self.get_serializer(qs, many=True)
        return Response(ser.data)

    @action(detail=False, methods=["patch", "post"])
    def mark_read(self, request):
        """
        PATCH/POST /api/notifications/mark_read/
        Body 예시:
          { "ids": [1,2,3] }   -> 지정한 것만 읽음 처리
          { "all": true }      -> 내 알림 전부 읽음 처리
        """
        ids = request.data.get("ids")
        mark_all = request.data.get("all")

        qs = self.get_queryset().filter(is_read=False)
        if mark_all:
            updated = qs.update(is_read=True)
            return Response({"updated": updated}, status=status.HTTP_200_OK)

        if isinstance(ids, list) and ids:
            updated = qs.filter(id__in=ids).update(is_read=True)
            return Response({"updated": updated}, status=status.HTTP_200_OK)

        return Response({"detail": "Provide 'all': true or 'ids': [..]"},
                        status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=["patch"], url_path="read")
    def read_one(self, request, pk=None):
        n = self.get_object()
        n.is_read = True
        n.save(update_fields=["is_read"])
        return Response({"ok": True})

class PostCommentViewSet(viewsets.ModelViewSet):
    """
    특정 Post에 대한 댓글 목록/생성
    /api/posts/{post_pk}/comments/
    """
    serializer_class = CommentSerializer
    permission_classes = [IsOwnerOrReadOnly]

    def get_queryset(self):
        post_id = self.kwargs.get("post_pk")  # URL의 캡처 이름과 일치해야 함
        return Comment.objects.filter(post_id=post_id).order_by("-id")

    def perform_create(self, serializer):
        post_id = self.kwargs.get("post_pk")
        post = get_object_or_404(Post, pk=post_id)
        # 방금 생성된 댓글 객체를 변수에 담는다
        comment_obj = serializer.save(post=post, author=self.request.user)

        # 내 글에 내가 단 댓글이면 알림 만들 필요 없음
        if post.author_id != self.request.user.id:
            msg = f"{self.request.user.username}님이 '{post.title[:20]}' 글에 댓글을 달았습니다."
            Notification.objects.create(
                user=post.author,
                message=msg,
                post=post,
                comment=comment_obj,
            )

class CommentViewSet(viewsets.ModelViewSet):
    """
    개별 댓글 CRUD
    /api/comments/{id}/
    """
    queryset = Comment.objects.all().order_by("-id")
    serializer_class = CommentSerializer
    permission_classes = [IsAdminOrOwnerOrReadOnly]

    def perform_create(self, serializer):
        # 일반적으로 개별 생성은 사용하지 않지만, 혹시 대비
        serializer.save(author=self.request.user)

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]  # 누구나 회원가입 가능

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        if not username or not password:
            return Response({'detail': 'username과 password는 필수입니다.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({'detail': '이미 존재하는 username입니다.'}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=username, password=password)
        return Response({'id': user.id, 'username': user.username}, status=status.HTTP_201_CREATED)


class PostViewSet(viewsets.ModelViewSet):
    # annotate로 like/comment 집계 컬럼을 쿼리 단계에서 붙임 (성능 ↑)
    queryset = (Post.objects
                .all()
                .annotate(
                    like_count=Count("likes", distinct=True),
                    comment_count=Count("comments", distinct=True),
                )
                .order_by("-id"))
    serializer_class = PostSerializer
    permission_classes = [IsAdminOrOwnerOrReadOnly]
    # (검색/정렬/필터 기존 코드 유지)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title","content"]
    ordering_fields = ["created_at","updated_at","id","like_count","comment_count"]
    ordering = ["-id"]                                                # 기본 정렬
    
    def perform_create(self, serializer):
        # 1) 우선 글을 저장 (author 지정)
        post = serializer.save(author=self.request.user)

        # 2) AI 실행 (요약 + 태그추천). 실패해도 글은 정상 생성되도록 보호
        try:
            ai = get_ai()
            summary = ai.summarize(post.content)
            tags_suggested = ai.suggest_tags(post.content, k=5)

            # 3) 결과 저장 (partial update)
            #    DB write 1회로 줄이고 싶으면 post.summary=...; post.tags_suggested=...; post.save(update_fields=[...])
            post.summary = summary
            post.tags_suggested = tags_suggested
            post.save(update_fields=["summary", "tags_suggested"])
        except Exception:
            # 로깅만 하고 조용히 무시하여 UX 보호
            import logging
            logging.exception("AI generation failed for post_id=%s", post.id)

    def perform_update(self, serializer):
        post = serializer.save()
        try:
            ai = get_ai()
            post.summary = ai.summarize(post.content)
            post.tags_suggested = ai.suggest_tags(post.content, k=5)
            post.save(update_fields=["summary","tags_suggested"])
        except Exception:
            import logging
            logging.exception("AI update failed for post_id=%s", post.id)

    @action(detail=True, methods=["post", "delete"], permission_classes=[permissions.IsAuthenticated])
    def like(self, request, pk=None):
        """
        POST   /api/posts/{id}/like/    → 좋아요
        DELETE /api/posts/{id}/like/    → 좋아요 취소
        """
        post = self.get_object()

        if request.method.lower() == "post":
            obj, created = Like.objects.get_or_create(post=post, user=request.user)
            if created:
                return Response({"detail": "liked"}, status=status.HTTP_201_CREATED)
            return Response({"detail": "already liked"}, status=status.HTTP_200_OK)

        # DELETE
        Like.objects.filter(post=post, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], permission_classes=[permissions.AllowAny])
    def likes(self, request, pk=None):
        """
        GET /api/posts/{id}/likes/  → 좋아요 수/간단 목록
        """
        post = self.get_object()
        users = list(post.likes.select_related("user").values_list("user__username", flat=True))
        return Response({"count": len(users), "users": users})
    
    # 쿼리파라미터: ?category=backend&tags=jwt,drf
    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get("category")
        tags = self.request.query_params.get("tags")
        if category:
            qs = qs.filter(category__slug=category)
        if tags:
            slugs = [t.strip() for t in tags.split(",") if t.strip()]
            if slugs:
                qs = qs.filter(tags__slug__in=slugs).distinct()
        return qs
    
    @action(detail=True, methods=["post"], url_path="refresh_ai",
            permission_classes=[IsAdminOrOwnerOrReadOnly])
    def refresh_ai(self, request, pk=None):
        post = self.get_object()
        if not settings.AI_ENABLE:
            return Response({"detail": "AI disabled"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ai = get_ai()
            post.summary = ai.summarize(post.content)
            post.tags_suggested = ai.suggest_tags(post.content, k=5)
            post.save(update_fields=["summary", "tags_suggested"])
            return Response({"id": post.id, "summary": post.summary, "tags_suggested": post.tags_suggested})
        except Exception:
            import logging
            logging.exception("AI refresh failed for post_id=%s", post.id)
            return Response({"detail": "AI refresh failed"}, status=status.HTTP_502_BAD_GATEWAY)