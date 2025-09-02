from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PostViewSet, RegisterView, CommentViewSet, PostCommentViewSet, NotificationViewSet

router = DefaultRouter()
router.register(r"posts", PostViewSet)  # /api/posts/ 로 CRUD 제공
router.register(r"comments", CommentViewSet)    # /api/comments/
router.register(r"notifications", NotificationViewSet)  # 추가

urlpatterns = [
    path("", include(router.urls)),
    path('auth/register/', RegisterView.as_view(), name='register'),
    # 하위 리소스: /api/posts/{post_pk}/comments/
    path("posts/<int:post_pk>/comments/", 
         PostCommentViewSet.as_view({"get": "list", "post": "create"}), 
         name="post-comments"),
    #  슬러그로 상세 보기
    # path("posts/slug/<slug:slug>/",
    #      PostViewSet.as_view({"get":"retrieve"}), name="post-detail-by-slug"),
]
