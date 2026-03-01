"""Add scheduled fields to bulk_jobs

Revision ID: 20260225_0003
Revises: 20260225_0002
Create Date: 2026-02-25 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260225_0003"
down_revision: Union[str, None] = "20260225_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bulk_jobs",
        sa.Column("cron_expression", sa.String(64), nullable=True),
    )
    op.add_column(
        "bulk_jobs",
        sa.Column("schedule_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("bulk_jobs", "schedule_enabled")
    op.drop_column("bulk_jobs", "cron_expression")
