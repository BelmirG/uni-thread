from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        """Force the asyncpg driver. Managed hosts (Railway, Render, Heroku) inject
        DATABASE_URL as 'postgres://' or 'postgresql://', but SQLAlchemy async needs
        the '+asyncpg' driver — normalize whatever we're given so the app and Alembic
        both work with the host's URL untouched."""
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v
    redis_url: str
    secret_key: str
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    admin_key: str = "change-this-admin-key"

    # "development" (default) or "production". Production flips secure cookies on
    # and refuses to boot with placeholder secrets — see validate_for_production().
    environment: str = "development"

    # Comma-separated list of origins allowed to make credentialed requests.
    # In production set this to your real domain, e.g. "https://unithread.app".
    cors_origins: str = "http://localhost:3000"

    # Comma-separated list of email domains allowed to register, WITHOUT the "@".
    # Defaults to the thesis's real constraint. Widen temporarily for a friend/beta
    # test (e.g. "student.ius.edu.ba,gmail.com") and narrow it back afterward —
    # this is the only place that gate lives, so flipping it back fully restores
    # the campus-only rule with no code change.
    allowed_email_domains: str = "student.ius.edu.ba"

    # Public base URL used to build links in emails (verification, reset).
    # Must be the address students' browsers reach, e.g. "https://unithread.app".
    public_base_url: str = "http://localhost:3000"

    # Cookie domain. Empty = host-only (correct for localhost). In production set to
    # the shared parent domain with a leading dot, e.g. ".unithread.app", so the
    # session cookie is sent to both the app and the api subdomain — this is what
    # lets WebSockets (which connect straight to the api subdomain) stay authenticated.
    cookie_domain: str = ""

    # Root directory for uploaded files (images + documents). Defaults to /app so
    # local dev is unchanged. On Railway set DATA_DIR=/data and mount a persistent
    # volume there so uploads survive redeploys.
    data_dir: str = "/app"

    # Web Push (VAPID). The public key is handed to browsers when they subscribe;
    # the private key signs every push so push services can verify it's us.
    # The private key is stored base64-encoded PEM so it fits in one env line.
    # All three empty = browser push is disabled (the app works fine without it).
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = ""  # "mailto:you@example.com" — required by push services

    # SMTP for real email delivery. Leave smtp_host empty to use the dev stub
    # (prints links to stdout). Works with any provider: Gmail, Brevo, SES, etc.
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
        # HTTPS-only cookies in production; plain HTTP is fine for local dev.
        return self.is_production

    def validate_for_production(self) -> None:
        """Fail fast at startup if production is misconfigured with dev defaults.

        A leaked or placeholder SECRET_KEY lets anyone forge login sessions, and a
        placeholder ADMIN_KEY hands over the moderation panel — so we refuse to run
        production with either.
        """
        if not self.is_production:
            return
        placeholders = {"dev-secret-key-change-before-production", "change-this-admin-key", ""}
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
