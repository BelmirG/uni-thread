import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

FacultyTag = Optional[Literal['FMS', 'FENS', 'FASS', 'FBA', 'FLW', 'FEDU']]


class CreateQAPostRequest(BaseModel):
    content: str = Field(default="", max_length=10_000)
    faculty_tag: FacultyTag = None
    image_urls: list[str] = Field(default_factory=list, max_length=5)

    @model_validator(mode='after')
    def require_content_or_images(self) -> 'CreateQAPostRequest':
        if not self.content.strip() and not self.image_urls:
            raise ValueError('Post must have text or at least one image.')
        return self


class QAPostResponse(BaseModel):
    id: uuid.UUID
    content: str
    faculty_tag: Optional[str] = None
    image_urls: list[str] = []
    # Intentionally no `author` field — not hidden, simply absent from the schema.
    # The posts table itself has author_id = NULL for these posts.
    upvotes: int
    downvotes: int
    current_user_vote: Optional[str]
    reply_count: int
    created_at: datetime
    is_deleted: bool
    parent_post_id: Optional[uuid.UUID]
    is_own: bool = False


class QAListResponse(BaseModel):
    posts: list[QAPostResponse]
    total: int
