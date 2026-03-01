"""Extend users, bulk_jobs, api_tokens, alert_rules

Revision ID: 20260225_0007
Revises: 20260225_0006
Create Date: 2026-02-25 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260225_0007"
down_revision: Union[str, None] = "20260225_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users: TOTP
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))

    # bulk_jobs: approval + rollback
    op.add_column("bulk_jobs", sa.Column("rollback_on_failure", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("bulk_jobs", sa.Column("approved_by", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("bulk_jobs", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_bulk_jobs_approved_by", "bulk_jobs", "users", ["approved_by"], ["id"])

    # api_tokens: IP allowlist
    op.add_column("api_tokens", sa.Column("ip_allowlist", sa.String(1024), nullable=True))

    # alert_rules: delivery type + email + slack
    op.add_column("alert_rules", sa.Column("delivery_type", sa.String(16), nullable=False, server_default="webhook"))
    op.add_column("alert_rules", sa.Column("email_to", sa.String(255), nullable=True))
    op.add_column("alert_rules", sa.Column("slack_webhook_url", sa.String(2048), nullable=True))


def downgrade() -> None:
    op.drop_column("alert_rules", "slack_webhook_url")
    op.drop_column("alert_rules", "email_to")
    op.drop_column("alert_rules", "delivery_type")
    op.drop_column("api_tokens", "ip_allowlist")
    op.drop_constraint("fk_bulk_jobs_approved_by", "bulk_jobs", type_="foreignkey")
    op.drop_column("bulk_jobs", "approved_at")
    op.drop_column("bulk_jobs", "approved_by")
    op.drop_column("bulk_jobs", "rollback_on_failure")
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
