"""Add compliance_rules and compliance_results tables

Revision ID: 20260225_0006
Revises: 20260225_0005
Create Date: 2026-02-25 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql

revision: str = "20260225_0006"
down_revision: Union[str, None] = "20260225_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "compliance_rules",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("section", sa.String(64), nullable=False),
        sa.Column("key_path", sa.String(255), nullable=False),
        sa.Column("operator", sa.String(16), nullable=False),
        sa.Column("expected_value", sa.String(512), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "compliance_results",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("actual_value", sa.String(512), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rule_id"], ["compliance_rules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_compliance_results_rule_id", "compliance_results", ["rule_id"])
    op.create_index("ix_compliance_results_device_id", "compliance_results", ["device_id"])


def downgrade() -> None:
    op.drop_index("ix_compliance_results_device_id", table_name="compliance_results")
    op.drop_index("ix_compliance_results_rule_id", table_name="compliance_results")
    op.drop_table("compliance_results")
    op.drop_table("compliance_rules")
