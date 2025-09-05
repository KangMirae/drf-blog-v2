from django.utils.text import slugify
from rest_framework import serializers
from .models import Post, Comment, Like, Notification, Category, Tag

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
    post_id = serializers.IntegerField(source="post.id", read_only=True)
    comment_id = serializers.IntegerField(source="comment.id", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "user", "message", "post", "comment", "is_read", "created_at", "post_id", "comment_id"]
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

    # # slug - category/tag
    # category = serializers.SlugRelatedField(
    #     slug_field="slug", queryset=Category.objects.all(), allow_null=True, required=False
    # )
    # tags = serializers.SlugRelatedField(
    #     slug_field="slug", queryset=Tag.objects.all(), many=True, required=False
    # )

    # 입력/출력 모두 문자열 리스트로 처리 (["drf","jwt","새글"])
    tags = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False
    )
    # 카테고리는 slug 하나(문자열)로 받는다는 기존 규칙 유지
    category = serializers.SlugRelatedField(
        slug_field="slug",
        queryset=Category.objects.all(),
        required=False,
        allow_null=True
    )
    
    # ai
    summary = serializers.CharField(read_only=True)
    tags_suggested = serializers.ListField(child=serializers.CharField(), read_only=True)


    class Meta:
        model = Post
        fields = ["id", "slug", "author", "title", "content",
                  "category", "tags",
                  "summary", "tags_suggested",       
                  "created_at", "updated_at",
                  "like_count", "comment_count"]
        read_only_fields = ["id","slug","author","created_at","updated_at",
                            "like_count","comment_count","summary","tags_suggested"]
        
        # 공통 유틸: 들어온 문자열 리스트를 Tag 객체 리스트로 변환(+자동 생성)
    def _resolve_tags(self, tags_list):
        tag_objs = []
        for raw in tags_list:
            # 공백 제거
            raw = (raw or "").strip()
            if not raw:
                continue
            # slug 표준화: 한글도 허용
            s = slugify(raw, allow_unicode=True)
            # name은 보기용으로 raw 보존, slug는 s 사용
            obj, _ = Tag.objects.get_or_create(slug=s, defaults={"name": raw})
            tag_objs.append(obj)
        return tag_objs

    def create(self, validated_data):
        tags_list = validated_data.pop("tags", [])
        post = Post.objects.create(**validated_data)
        if tags_list:
            post.tags.set(self._resolve_tags(tags_list))
        return post

    def update(self, instance, validated_data):
        tags_list = validated_data.pop("tags", None)  # None이면 태그 변경 안 함
        instance = super().update(instance, validated_data)
        if tags_list is not None:
            instance.tags.set(self._resolve_tags(tags_list))
        return instance

    # 응답 시에도 문자열 리스트로 나가게 (["drf","jwt","새글"])
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["tags"] = list(instance.tags.values_list("slug", flat=True))
        return data