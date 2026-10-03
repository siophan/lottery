from app.security import hash_password, verify_password, new_token

def test_hash_then_verify_roundtrip():
    h, salt = hash_password("secret")
    assert verify_password("secret", salt, h) is True

def test_verify_rejects_wrong_password():
    h, salt = hash_password("secret")
    assert verify_password("nope", salt, h) is False

def test_same_password_different_salt_differs():
    h1, s1 = hash_password("secret")
    h2, s2 = hash_password("secret")
    assert s1 != s2 and h1 != h2

def test_new_token_is_unique_and_urlsafe():
    a, b = new_token(), new_token()
    assert a != b and len(a) >= 20
    assert all(c.isalnum() or c in "-_" for c in a)
