"""Settings from backend/.env. Environment variables override the file."""

import os
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic_settings import BaseSettings, SettingsConfigDict

if TYPE_CHECKING:
    import boto3

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

    @property
    def aws_client_profile(self) -> str | None:
        """The AWS CLI profile for AWS clients: aws_profile locally, None in Lambda (its role provides credentials)."""
        if os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or not self.aws_profile:
            return None
        return self.aws_profile


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def aws_session() -> "boto3.Session":
    """The one boto3 Session every AWS client comes from (bedrock-runtime, DynamoDB, Textract).

    Created on first use, so stub mode never needs AWS credentials. Like AnthropicBedrock, it keeps the
    credentials it loaded: after refreshing the finlife profile's temporary keys, restart the API.
    """
    import boto3

    settings = get_settings()
    return boto3.Session(profile_name=settings.aws_client_profile, region_name=settings.aws_region)
