from sqlmodel import create_engine, Session, SQLModel
from app.core.config import get_settings

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(
            settings.database_url,
            echo=(settings.environment == "development"),
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
    return _engine


def get_session():
    with Session(get_engine()) as session:
        yield session


def create_all_tables():
    SQLModel.metadata.create_all(get_engine())
