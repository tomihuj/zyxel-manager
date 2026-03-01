"""Add celery_task_id to security_scans

Revision ID: 20260301_0001
Revises: 20260228_0001
Create Date: 2026-03-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260301_0001"
down_revision: Union[str, None] = "20260228_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "security_scans",
        sa.Column("celery_task_id", sa.String(256), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("security_scans", "celery_task_id")
