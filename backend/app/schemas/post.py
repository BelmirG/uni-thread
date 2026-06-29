import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

FacultyTag = Optional[Literal['FMS', 'FENS', 'FASS', 'FBA', 'FLW', 'FEDU']]


class CreatePostRequest(BaseModel):
    content: str = Field(default="", max_length=10_000)
    faculty_tag: FacultyTag = None
    image_urls: list[str] = Field(default_factory=list, max_length=5)
    poll_options: list[str] = Field(default_factory=list)
    poll_expires_at: Optional[datetime] = None

    @model_validator(mode='after')
    def validate_post(self) -> 'CreatePostRequest':
        if not self.content.strip() and not self.image_urls and not self.poll_options:
            raise ValueError('Post must have text, image, or poll.')
        if self.poll_options:
            if len(self.poll_options) < 2 or len(self.poll_options) > 4:
                raise ValueError('Poll must have 2 to 4 options.')
            if any(not o.strip() for o in self.poll_options):
                raise ValueError('Poll options cannot be empty.')
        return self


class VoteRequest(BaseModel):
    vote_type: str  # 'up' | 'down'


class PollVoteRequest(BaseModel):
    option_id: uuid.UUID


class AuthorInfo(BaseModel):
    username: str
    display_name: str
    avatar_url: Optional[str] = None


class PollOptionResponse(BaseModel):
    id: uuid.UUID
    text: str
    votes: int


class PollResponse(BaseModel):
    options: list[PollOptionResponse]
    total_votes: int
    user_vote_option_id: Optional[uuid.UUID]
    expires_at: Optional[datetime]
    is_expired: bool


class PostResponse(BaseModel):
    id: uuid.UUID
    content: str
    post_type: str
    faculty_tag: Optional[str] = None
    image_urls: list[str] = []
    author: Optional[AuthorInfo]
    upvotes: int
    downvotes: int
    current_user_vote: Optional[str]
    reply_count: int
    share_count: int = 0
    poll: Optional[PollResponse] = None
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
