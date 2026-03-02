"""Add security_finding_exclusions table

Revision ID: 20260302_0001
Revises: 20260301_0001
Create Date: 2026-03-02 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260302_0001"
down_revision: Union[str, None] = "20260301_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "security_finding_exclusions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False, primary_key=True),
        sa.Column("device_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("finding_title", sa.String(256), nullable=False),
        sa.Column("reason", sa.String(1024), nullable=False),
        sa.Column("created_by", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("device_id", "finding_title", name="uq_exclusion_device_title"),
    )
    op.create_index("ix_security_finding_exclusions_device_id", "security_finding_exclusions", ["device_id"])

    # Add 'excluded' to existing findings that may need it (no-op data migration)


def downgrade() -> None:
    op.drop_index("ix_security_finding_exclusions_device_id", table_name="security_finding_exclusions")
    op.drop_table("security_finding_exclusions")
