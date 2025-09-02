from rest_framework import viewsets, permissions, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from .models import Post, Comment, Like, Notification
from .serializers import PostSerializer, CommentSerializer, NotificationSerializer
from .permissions import IsOwnerOrReadOnly, IsReceiverOnly

from django_filters.rest_framework import DjangoFilterBackend

class NotificationViewSet(viewsets.ModelViewSet):
    """
    /api/notifications/  (내 알림만)
    GET: 목록/조회
    PATCH: 읽음 처리 (is_read=True)
    DELETE: 삭제
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsReceiverOnly]
    queryset = Notification.objects.all()   # ★ 추가: basename 유추용 기본 queryset

    def get_queryset(self):
        # 내 알림만
        return Notification.objects.filter(user=self.request.user).order_by("-id")

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
    permission_classes = [IsOwnerOrReadOnly]

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
    permission_classes = [IsOwnerOrReadOnly]
    queryset = Post.objects.all().order_by("-id")
    serializer_class = PostSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]   # 필터
    search_fields = ["title", "content"]                               # 어떤 필드를 검색할지
    ordering_fields = ["created_at", "updated_at", "id"]               # 정렬 허용 필드
    ordering = ["-id"]                                                 # 기본 정렬
    
    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

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