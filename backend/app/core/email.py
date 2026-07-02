"""Email delivery.

When SMTP is configured (see Settings.smtp_*), sends real mail through any
standard provider — Gmail, Brevo, Amazon SES, etc. When it isn't, falls back to
printing the link to stdout so local development needs no mail account. Sends are
best-effort: a provider outage logs an error rather than failing the request, so a
verification email hiccup never blocks account creation itself.
"""

import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings


def _send(to_email: str, subject: str, heading: str, body_line: str, button_text: str, link: str) -> None:
    if not settings.email_configured:
        _print_stub(to_email, subject, link)
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg.set_content(f"{heading}\n\n{body_line}\n\n{button_text}: {link}\n")
    msg.add_alternative(_html(heading, body_line, button_text, link), subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_starttls:
                server.starttls(context=ssl.create_default_context())
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
    except Exception as exc:  # noqa: BLE001 — never let mail failure break the flow
        print(f"[EMAIL ERROR] Could not send to {to_email}: {exc}", flush=True)


def _html(heading: str, body_line: str, button_text: str, link: str) -> str:
    return f"""\
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1d1d1f">
  <div style="font-size:22px;font-weight:700;margin-bottom:8px">IUSConnect</div>
  <h1 style="font-size:20px;font-weight:600;margin:16px 0 8px">{heading}</h1>
  <p style="font-size:15px;line-height:1.5;color:#6e6e73;margin:0 0 24px">{body_line}</p>
  <a href="{link}" style="display:inline-block;background:#1d1d1f;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:9999px">{button_text}</a>
  <p style="font-size:13px;color:#86868b;margin:24px 0 0">If the button doesn't work, paste this link into your browser:<br>{link}</p>
</div>"""


def _print_stub(to_email: str, subject: str, link: str) -> None:
    separator = "=" * 60
    print(f"\n{separator}", flush=True)
    print(f"[DEV EMAIL]  To: {to_email}")
    print(f"[DEV EMAIL]  Subject: {subject}")
    print(f"[DEV EMAIL]  Link:")
    print(f"             {link}")
    print(f"{separator}\n", flush=True)


def send_verification_email(to_email: str, token: str) -> None:
    link = f"{settings.public_base_url}/verify-email?token={token}"
    _send(
        to_email,
        subject="Verify your IUSConnect account",
        heading="Confirm your email",
        body_line="Welcome to IUSConnect — the private network for IUS students. Confirm this address to finish setting up your account.",
        button_text="Verify email",
        link=link,
    )


def send_reset_email(to_email: str, token: str) -> None:
    link = f"{settings.public_base_url}/reset-password?token={token}"
    _send(
        to_email,
        subject="Reset your IUSConnect password",
        heading="Reset your password",
        body_line="We received a request to reset your password. This link expires in one hour. If you didn't ask for this, you can ignore this email.",
        button_text="Reset password",
        link=link,
    )
