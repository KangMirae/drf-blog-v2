from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PostViewSet
from .views import RegisterView

router = DefaultRouter()
router.register(r"posts", PostViewSet)  # /api/posts/ 로 CRUD 제공

urlpatterns = [
    path("", include(router.urls)),
    path('auth/register/', RegisterView.as_view(), name='register'),
]
