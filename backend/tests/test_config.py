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
