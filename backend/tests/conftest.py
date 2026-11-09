# 单设备登录上线后，登录接口拒绝不带设备码的请求、业务请求要求设备码与会话一致。
# 新版客户端主进程给发往我方接口的每个请求都加 X-Device-Id；这里让所有 TestClient 默认也带上，
# 既有用例因此按「新版客户端」运行。需要模拟旧版 / 另一台设备的用例在请求里显式覆盖该请求头。
import pytest
from starlette.testclient import TestClient

TEST_DEVICE = "testdevice0000000000000000000001"

@pytest.fixture(autouse=True)
def _default_device_header(monkeypatch):
    orig = TestClient.__init__

    def init(self, *args, **kwargs):
        headers = dict(kwargs.pop("headers", None) or {})
        headers.setdefault("X-Device-Id", TEST_DEVICE)
        orig(self, *args, headers=headers, **kwargs)

    monkeypatch.setattr(TestClient, "__init__", init)
