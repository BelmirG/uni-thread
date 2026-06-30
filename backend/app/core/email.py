def send_verification_email(to_email: str, token: str) -> None:
    # Stub for local development — prints the link to stdout (visible in Docker logs).
    # In production swap this body for a real provider (Resend, SendGrid, SES, etc.)
    link = f"http://localhost:3000/verify-email?token={token}"
    separator = "=" * 60
    print(f"\n{separator}", flush=True)
    print(f"[DEV EMAIL]  To: {to_email}")
    print(f"[DEV EMAIL]  Subject: Verify your IUSConnect account")
    print(f"[DEV EMAIL]  Click to verify:")
    print(f"             {link}")
    print(f"{separator}\n", flush=True)


def send_reset_email(to_email: str, token: str) -> None:
    link = f"http://localhost:3000/reset-password?token={token}"
    separator = "=" * 60
    print(f"\n{separator}", flush=True)
    print(f"[DEV EMAIL]  To: {to_email}")
    print(f"[DEV EMAIL]  Subject: Reset your IUSConnect password")
    print(f"[DEV EMAIL]  Click to reset:")
    print(f"             {link}")
    print(f"{separator}\n", flush=True)
