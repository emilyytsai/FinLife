from app.config import Settings, aws_session, get_settings


def test_local_runs_use_the_cli_profile(monkeypatch):
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    assert Settings(aws_profile="finlife").aws_client_profile == "finlife"


def test_lambda_ignores_the_cli_profile(monkeypatch):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "finlife-api")
    assert Settings(aws_profile="finlife").aws_client_profile is None


def test_blank_profile_uses_default_credentials(monkeypatch):
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    assert Settings(aws_profile="").aws_client_profile is None


def test_aws_session_uses_the_configured_region(monkeypatch):
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "finlife-api")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    get_settings.cache_clear()
    aws_session.cache_clear()
    try:
        assert aws_session().region_name == "us-east-1"
    finally:
        get_settings.cache_clear()
        aws_session.cache_clear()
