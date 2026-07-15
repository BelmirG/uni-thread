import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CreateClubRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=500)
    is_private: bool = False


class ClubResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    banner_url: Optional[str]
    is_private: bool
    member_count: int
    is_member: bool
    role: Optional[str]           # 'member' | 'moderator' | 'owner' | None
    has_pending_request: bool     # current user has a pending join request
    chat_muted: bool = False      # current user muted this club's chat pushes
    created_at: datetime


class UpdateClubBannerRequest(BaseModel):
    banner_url: Optional[str] = Field(default=None, max_length=500)


class ClubListResponse(BaseModel):
    clubs: list[ClubResponse]
    total: int
