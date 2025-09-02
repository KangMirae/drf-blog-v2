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
    # annotate로 붙여온 값을 그대로 읽기전용으로 노출
    like_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True)

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
                  "created_at","updated_at",
                  "like_count","comment_count"]
        read_only_fields = ["id","slug","author","created_at","updated_at","like_count","comment_count"]