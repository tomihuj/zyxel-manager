from sqlmodel import SQLModel, Field


class AuditActionConfig(SQLModel, table=True):
    __tablename__ = "audit_action_configs"
    action: str = Field(primary_key=True, max_length=64)
    enabled: bool = Field(default=True)
    log_payload: bool = Field(default=False)
