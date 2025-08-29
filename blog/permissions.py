from rest_framework import permissions

class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    읽기는 모두 허용, 변경/삭제는 객체의 author == 요청 사용자일 때만 허용
    """
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return getattr(obj, "author_id", None) == getattr(request.user, "id", None)
