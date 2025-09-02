from rest_framework import serializers
from .models import Post, Comment, Like, Notification
from .models import Category, Tag

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "slug"]

class NotificationSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source="user.username")
    post = serializers.PrimaryKeyRelatedField(read_only=True)
    comment = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "user", "message", "post", "comment", "is_read", "created_at"]
        read_only_fields = ["id", "user", "post", "comment", "created_at"]

class CommentSerializer(serializers.ModelSerializer):
    author = serializers.ReadOnlyField(source='author.username')  # 응답 전용
    post = serializers.PrimaryKeyRelatedField(read_only=True)     # 경로(post_id)로 주입할 거라 입력받지 않음

    class Meta:
        model = Comment
        fields = ["id", "post", "author", "content", "created_at", "updated_at"]
        read_only_fields = ["id", "post", "author", "created_at", "updated_at"]

class PostSerializer(serializers.ModelSerializer):
    author = serializers.ReadOnlyField(source='author.username')
    like_count = serializers.IntegerField(source='likes.count', read_only=True)  

    # slug - category/tag
    category = serializers.SlugRelatedField(
        slug_field="slug", queryset=Category.objects.all(), allow_null=True, required=False
    )
    tags = serializers.SlugRelatedField(
        slug_field="slug", queryset=Tag.objects.all(), many=True, required=False
    )

    class Meta:
        model = Post
        fields = ["id","slug","author","title","content",
                  "category","tags",
                  "created_at","updated_at","like_count"] # 수정
        read_only_fields = ["id","slug","author","created_at","updated_at","like_count"] # 수정