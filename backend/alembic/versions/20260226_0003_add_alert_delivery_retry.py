"""Add retry_count and next_retry_at to alert_deliveries

Revision ID: 20260226_0003
Revises: 20260226_0002
Create Date: 2026-02-26 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260226_0003"
down_revision: Union[str, None] = "20260226_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("alert_deliveries", sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("alert_deliveries", sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("alert_deliveries", "next_retry_at")
    op.drop_column("alert_deliveries", "retry_count")
