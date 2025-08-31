from rest_framework import serializers
from .models import Post, Comment, Like
from .models import Notification

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

    class Meta:
        model = Post
        fields = ["id", "author", "title", "content", "created_at", "updated_at", "like_count"]  
        read_only_fields = ["id", "author", "created_at", "updated_at", "like_count"]  
