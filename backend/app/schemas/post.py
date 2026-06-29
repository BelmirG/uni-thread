import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

FacultyTag = Optional[Literal['FMS', 'FENS', 'FASS', 'FBA', 'FLW', 'FEDU']]


class CreatePostRequest(BaseModel):
    content: str = Field(default="", max_length=10_000)
    faculty_tag: FacultyTag = None
    image_urls: list[str] = Field(default_factory=list, max_length=5)

    @model_validator(mode='after')
    def require_content_or_images(self) -> 'CreatePostRequest':
        if not self.content.strip() and not self.image_urls:
            raise ValueError('Post must have text or at least one image.')
        return self


class VoteRequest(BaseModel):
    vote_type: str  # 'up' | 'down'


class AuthorInfo(BaseModel):
    username: str
    display_name: str
    avatar_url: Optional[str] = None


class PostResponse(BaseModel):
    id: uuid.UUID
    content: str
    post_type: str
    faculty_tag: Optional[str] = None
    image_urls: list[str] = []
    author: Optional[AuthorInfo]
    upvotes: int
    downvotes: int
    current_user_vote: Optional[str]   # 'up', 'down', or None
    reply_count: int
    share_count: int = 0
    created_at: datetime
    is_deleted: bool
    is_pinned: bool = False
    parent_post_id: Optional[uuid.UUID]


class VoteResponse(BaseModel):
    upvotes: int
    downvotes: int
    current_user_vote: Optional[str]


class PostListResponse(BaseModel):
    posts: list[PostResponse]
    total: int
