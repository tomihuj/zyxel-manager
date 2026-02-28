"""Add security_scans, security_findings, device_risk_scores tables

Revision ID: 20260228_0001
Revises: 20260226_0003
Create Date: 2026-02-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql

revision: str = "20260228_0001"
down_revision: Union[str, None] = "20260226_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "security_scans",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("triggered_by", sa.String(32), nullable=False),
        sa.Column("triggered_by_user", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="running"),
        sa.Column("findings_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("critical_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("high_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("medium_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("low_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("info_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("risk_score", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.String(1024), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "security_findings",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scan_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("description", sa.String(1024), nullable=False),
        sa.Column("recommendation", sa.String(1024), nullable=False),
        sa.Column("remediation_patch", sa.Text(), nullable=True),
        sa.Column("config_path", sa.String(256), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("suppressed_by", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("suppressed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("suppressed_reason", sa.String(512), nullable=True),
        sa.Column("compliance_refs", sa.String(512), nullable=True),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scan_id"], ["security_scans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["suppressed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_findings_device_id", "security_findings", ["device_id"])
    op.create_index("ix_security_findings_scan_id", "security_findings", ["scan_id"])
    op.create_index("ix_security_findings_severity", "security_findings", ["severity"])
    op.create_index("ix_security_findings_status", "security_findings", ["status"])

    op.create_table(
        "device_risk_scores",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("grade", sa.String(1), nullable=False, server_default="A"),
        sa.Column("critical_findings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("high_findings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("medium_findings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("low_findings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("open_findings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_device_risk_scores_device_id", "device_risk_scores", ["device_id"])
    op.create_index("ix_device_risk_scores_calculated_at", "device_risk_scores", ["calculated_at"])


def downgrade() -> None:
    op.drop_index("ix_device_risk_scores_calculated_at", table_name="device_risk_scores")
    op.drop_index("ix_device_risk_scores_device_id", table_name="device_risk_scores")
    op.drop_table("device_risk_scores")

    op.drop_index("ix_security_findings_status", table_name="security_findings")
    op.drop_index("ix_security_findings_severity", table_name="security_findings")
    op.drop_index("ix_security_findings_scan_id", table_name="security_findings")
    op.drop_index("ix_security_findings_device_id", table_name="security_findings")
    op.drop_table("security_findings")

    op.drop_table("security_scans")
