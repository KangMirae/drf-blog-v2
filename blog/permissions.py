from rest_framework import permissions

class IsAdminOrOwnerOrReadOnly(permissions.BasePermission):
    """
    SAFE_METHODS(GET, HEAD, OPTIONS): 모두 허용
    쓰기/수정/삭제: 작성자 또는 is_staff(True)만 허용
    """
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        if getattr(request.user, "is_staff", False):
            return True
        return getattr(obj, "author_id", None) == getattr(request.user, "id", None)
    
class IsReceiverOnly(permissions.BasePermission):
    """
    알림 객체의 소유자(수신자)만 접근 허용
    """
    def has_object_permission(self, request, view, obj):
        return getattr(obj, "user_id", None) == getattr(request.user, "id", None)
    
class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    읽기는 모두 허용, 변경/삭제는 객체의 author == 요청 사용자일 때만 허용
    """
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return getattr(obj, "author_id", None) == getattr(request.user, "id", None)
