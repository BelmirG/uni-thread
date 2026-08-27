import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

FacultyTag = Optional[Literal['FMS', 'FENS', 'FASS', 'FBA', 'FLW', 'FEDU']]


class FileAttachment(BaseModel):
    url: str
    name: str
    size: int
    mime_type: str


class CreatePostRequest(BaseModel):
    content: str = Field(default="", max_length=10_000)
    faculty_tag: FacultyTag = None
    image_urls: list[str] = Field(default_factory=list, max_length=5)
    file_attachments: list[FileAttachment] = Field(default_factory=list, max_length=5)
    poll_options: list[str] = Field(default_factory=list)
    poll_expires_at: Optional[datetime] = None
    poll_public_votes: bool = False
    event_starts_at: Optional[datetime] = None
    event_ends_at: Optional[datetime] = None
    event_location: Optional[str] = Field(default=None, max_length=200)

    @model_validator(mode='after')
    def validate_post(self) -> 'CreatePostRequest':
        has_event = self.event_starts_at is not None
        if not self.content.strip() and not self.image_urls and not self.poll_options and not self.file_attachments and not has_event:
            raise ValueError('Post must have text, image, file, poll, or event.')
        if self.poll_options:
            if len(self.poll_options) < 2 or len(self.poll_options) > 4:
                raise ValueError('Poll must have 2 to 4 options.')
            if any(not o.strip() for o in self.poll_options):
                raise ValueError('Poll options cannot be empty.')
        if not has_event and (self.event_ends_at or self.event_location):
            raise ValueError('An event needs a start time.')
        if has_event and self.event_ends_at and self.event_ends_at <= self.event_starts_at:
            raise ValueError('Event must end after it starts.')
        return self


class EditPostRequest(BaseModel):
    content: str = Field(max_length=10_000)

    @model_validator(mode='after')
    def validate_edit(self) -> 'EditPostRequest':
        if not self.content.strip():
            raise ValueError('Post content cannot be empty.')
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
    public_votes: bool = False


class EventResponse(BaseModel):
    starts_at: datetime
    ends_at: Optional[datetime] = None
    location: Optional[str] = None
    going_count: int = 0
    interested_count: int = 0
    user_status: Optional[str] = None
    is_past: bool = False


class RSVPRequest(BaseModel):
    status: Literal['going', 'interested']


class PostResponse(BaseModel):
    id: uuid.UUID
    content: str
    post_type: str
    faculty_tag: Optional[str] = None
    image_urls: list[str] = []
    file_attachments: list[FileAttachment] = []
    author: Optional[AuthorInfo]
    upvotes: int
    downvotes: int
    current_user_vote: Optional[str]
    reply_count: int
    share_count: int = 0
    poll: Optional[PollResponse] = None
    event: Optional[EventResponse] = None
    created_at: datetime
    edited_at: Optional[datetime] = None
    is_deleted: bool
    is_pinned: bool = False
    is_bookmarked: bool = False
    parent_post_id: Optional[uuid.UUID]


class VoteResponse(BaseModel):
    upvotes: int
    downvotes: int
    current_user_vote: Optional[str]


class PostListResponse(BaseModel):
    posts: list[PostResponse]
    total: int
