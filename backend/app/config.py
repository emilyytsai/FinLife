"""Settings from backend/.env. Environment variables override the file."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    aws_region: str = "us-west-2"
    aws_profile: str = ""
    bedrock_model_id: str = ""
    bedrock_fallback_model_id: str = ""
    guardrail_id: str = ""
    guardrail_version: str = ""
    briefs_table: str = ""
    audit_table: str = ""
    frontend_url: str = "http://localhost:3000"
    allowed_origins: str = "http://localhost:3000"
    finlife_stub_ai: str = "1"
    finlife_local_dir: str = ".local"

    @property
    def stub_ai(self) -> bool:
        """Canned coach replies when stub mode is on or no model is configured."""
        return self.finlife_stub_ai == "1" or not self.bedrock_model_id

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def local_dir(self) -> Path:
        """Folder for local briefs and audit lines, relative to backend/ unless absolute."""
        path = Path(self.finlife_local_dir)
        return path if path.is_absolute() else BACKEND_DIR / path


@lru_cache
def get_settings() -> Settings:
    return Settings()
