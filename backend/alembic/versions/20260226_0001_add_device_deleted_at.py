"""Add deleted_at to devices for soft delete

Revision ID: 20260226_0001
Revises: 20260225_0008
Create Date: 2026-02-26 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260226_0001"
down_revision: Union[str, None] = "20260225_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("devices", "deleted_at")
