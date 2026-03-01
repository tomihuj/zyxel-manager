"""Add backup and audit config tables/columns

Revision ID: 20260224_0001
Revises:
Create Date: 2026-02-24 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql
import sqlmodel

revision: str = "20260224_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── config_snapshots: add triggered_by and label columns ────────────────
    op.add_column(
        "config_snapshots",
        sa.Column("triggered_by", sa.String(16), nullable=False, server_default="sync"),
    )
    op.add_column(
        "config_snapshots",
        sa.Column("label", sa.String(255), nullable=True),
    )

    # ── device_backup_settings table ─────────────────────────────────────────
    op.create_table(
        "device_backup_settings",
        sa.Column("device_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("auto_backup_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("interval_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("retention", sa.Integer(), nullable=True),
        sa.Column("last_auto_backup", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("device_id"),
    )

    # ── audit_action_configs table ────────────────────────────────────────────
    op.create_table(
        "audit_action_configs",
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("log_payload", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("action"),
    )


def downgrade() -> None:
    op.drop_table("audit_action_configs")
    op.drop_table("device_backup_settings")
    op.drop_column("config_snapshots", "label")
    op.drop_column("config_snapshots", "triggered_by")
