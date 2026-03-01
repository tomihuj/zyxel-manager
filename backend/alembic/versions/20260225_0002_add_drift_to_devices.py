"""Add drift fields to devices

Revision ID: 20260225_0002
Revises: 20260225_0001
Create Date: 2026-02-25 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260225_0002"
down_revision: Union[str, None] = "20260225_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "devices",
        sa.Column("drift_detected", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "devices",
        sa.Column("drift_detected_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("devices", "drift_detected_at")
    op.drop_column("devices", "drift_detected")
