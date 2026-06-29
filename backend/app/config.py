from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    secret_key: str
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    admin_key: str = "change-this-admin-key"

    model_config = {"env_file": ".env"}


settings = Settings()
