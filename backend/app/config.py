from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        """Force the asyncpg driver."""
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v
    redis_url: str
    secret_key: str
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    admin_key: str = "change-this-admin-key"

    environment: str = "development"

    cors_origins: str = "http://localhost:3000"

    allowed_email_domains: str = "student.ius.edu.ba"

    public_base_url: str = "http://localhost:3000"

    cookie_domain: str = ""

    data_dir: str = "/app"

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = ""

    resend_api_key: str = ""

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "UniThread <no-reply@unithread.app>"
    smtp_starttls: bool = True

    model_config = {"env_file": ".env"}

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    @property
    def push_configured(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key and self.vapid_subject)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_email_domain_list(self) -> list[str]:
        return [d.strip().lower() for d in self.allowed_email_domains.split(",") if d.strip()]

    @property
    def cookie_secure(self) -> bool:
        return self.is_production

    def validate_for_production(self) -> None:
        """Fail fast at startup if production is misconfigured with dev defaults."""
        if not self.is_production:
            return
        placeholders = {
            "dev-secret-key-change-before-production",
            "change-this-admin-key",
            "change-this-before-deploying",  # an older docker-compose default, still in git history
            "",
        }
        if self.secret_key in placeholders or len(self.secret_key) < 32:
            raise RuntimeError(
                "SECRET_KEY must be a unique random string of at least 32 chars in production."
            )
        if self.admin_key in placeholders or len(self.admin_key) < 16:
            raise RuntimeError(
                "ADMIN_KEY must be a unique random string of at least 16 chars in production."
            )


settings = Settings()
settings.validate_for_production()
