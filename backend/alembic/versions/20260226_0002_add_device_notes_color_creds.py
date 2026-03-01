"""Add notes, label_color, credentials_updated_at to devices

Revision ID: 20260226_0002
Revises: 20260226_0001
Create Date: 2026-02-26 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260226_0002"
down_revision: Union[str, None] = "20260226_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("devices", sa.Column("label_color", sa.String(16), nullable=True))
    op.add_column("devices", sa.Column("credentials_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("devices", "credentials_updated_at")
    op.drop_column("devices", "label_color")
    op.drop_column("devices", "notes")
