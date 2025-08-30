from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth.models import User
from .models import Post
from .serializers import PostSerializer
from .permissions import IsOwnerOrReadOnly
from django.shortcuts import get_object_or_404
from .models import Comment
from .serializers import CommentSerializer


class PostCommentViewSet(viewsets.ModelViewSet):
    """
    특정 Post에 대한 댓글 목록/생성
    /api/posts/{post_id}/comments/
    """
    serializer_class = CommentSerializer
    permission_classes = [IsOwnerOrReadOnly]

    def get_queryset(self):
        post_id = self.kwargs.get("post_pk")  # URL의 캡처 이름과 일치해야 함
        return Comment.objects.filter(post_id=post_id).order_by("-id")

    def perform_create(self, serializer):
        post_id = self.kwargs.get("post_pk")
        post = get_object_or_404(Post, pk=post_id)
        serializer.save(post=post, author=self.request.user)

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


class PostViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwnerOrReadOnly]
    queryset = Post.objects.all().order_by("-id")
    serializer_class = PostSerializer
    def perform_create(self, serializer):
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

