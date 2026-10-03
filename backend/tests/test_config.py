from app.config import load_settings

def test_defaults():
    s = load_settings({})
    assert s.port == 8000
    assert s.upstream == "https://soft-api.data-ys.com/api"
    assert s.verify_tls is True
    assert s.timeout == 15.0

def test_env_override():
    s = load_settings({"PORT": "9000", "UPSTREAM": "http://x/api",
                       "UPSTREAM_VERIFY_TLS": "false", "UPSTREAM_TIMEOUT": "5"})
    assert s.port == 9000
    assert s.upstream == "http://x/api"
    assert s.verify_tls is False
    assert s.timeout == 5.0

def test_load_settings_reads_middleware_fields():
    env = {
        "DATA_YS_CODE": "ABC1234", "DATA_YS_PASSWORD": "pw",
        "DATA_YS_DEVICE_ID": "srv-1", "DATA_YS_FROM_ID": "1004",
        "ADMIN_KEY": "k", "DB_PATH": "/tmp/x.db",
        "SESSION_TTL": "3600", "DATA_YS_TOKEN_TTL": "600",
    }
    s = load_settings(env)
    assert s.dayys_code == "ABC1234"
    assert s.dayys_password == "pw"
    assert s.dayys_device_id == "srv-1"
    assert s.from_id == "1004"
    assert s.admin_key == "k"
    assert s.db_path == "/tmp/x.db"
    assert s.session_ttl == 3600
    assert s.dayys_token_ttl == 600

def test_load_settings_defaults_for_middleware_fields():
    s = load_settings({})
    assert s.from_id == "1004"
    assert s.db_path.endswith("app.db")
    assert s.session_ttl == 604800
    assert s.dayys_token_ttl == 3600
    assert s.dayys_code == "" and s.dayys_password == ""

def test_admin_console_settings_defaults():
    from app.config import load_settings
    s = load_settings({})
    assert s.admin_session_ttl == 86400
    assert s.admin_cookie_secure is True
    assert s.admin_cookie_name == "admin_session"

def test_admin_console_settings_from_env():
    from app.config import load_settings
    s = load_settings({"ADMIN_SESSION_TTL": "60",
                       "ADMIN_COOKIE_SECURE": "false",
                       "ADMIN_COOKIE_NAME": "ac"})
    assert s.admin_session_ttl == 60
    assert s.admin_cookie_secure is False
    assert s.admin_cookie_name == "ac"
