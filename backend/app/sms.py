"""短信发送：可插拔 sender。log 仅打印（开发/测试），aliyun 走 Dysmsapi SendSms。"""
import base64, hashlib, hmac, json, sys, uuid
from datetime import datetime, timezone
from urllib.parse import quote
import httpx

ALIYUN_ENDPOINT = "https://dysmsapi.aliyuncs.com/"


class SmsError(Exception):
    """短信发送失败（调用方捕获后统一提示，不向用户暴露细节）。"""


def _percent_encode(v: str) -> str:
    # RFC3986：仅 A-Za-z0-9-_.~ 不编码；空格 -> %20，* -> %2A，~ 保留
    return quote(str(v), safe="-_.~")


def _canonical_query(params: dict) -> str:
    return "&".join(f"{_percent_encode(k)}={_percent_encode(params[k])}"
                    for k in sorted(params) if k != "Signature")


def aliyun_signature(params: dict, secret: str) -> str:
    """阿里云 RPC 签名 V1：HMAC-SHA1(secret+"&", "GET&%2F&" + 编码后的规范查询串) 的 base64。"""
    string_to_sign = "GET&%2F&" + _percent_encode(_canonical_query(params))
    digest = hmac.new((secret + "&").encode(), string_to_sign.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


class LogSmsSender:
    async def send_code(self, phone: str, code: str) -> None:
        print(f"[sms] {phone} code={code}")


class AliyunSmsSender:
    def __init__(self, client: httpx.AsyncClient, access_key_id: str, access_key_secret: str,
                 sign_name: str, template_code: str, endpoint: str = ALIYUN_ENDPOINT):
        self.client = client
        self.access_key_id = access_key_id
        self.access_key_secret = access_key_secret
        self.sign_name = sign_name
        self.template_code = template_code
        self.endpoint = endpoint

    async def send_code(self, phone: str, code: str) -> None:
        params = {
            "AccessKeyId": self.access_key_id,
            "Action": "SendSms",
            "Format": "JSON",
            "PhoneNumbers": phone,
            "RegionId": "cn-hangzhou",
            "SignName": self.sign_name,
            "SignatureMethod": "HMAC-SHA1",
            "SignatureNonce": str(uuid.uuid4()),
            "SignatureVersion": "1.0",
            "TemplateCode": self.template_code,
            "TemplateParam": json.dumps({"code": code}, separators=(",", ":")),
            "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "Version": "2017-05-25",
        }
        params["Signature"] = aliyun_signature(params, self.access_key_secret)
        # 自己拼查询串，保证与签名用的编码完全一致；endpoint 为绝对 URL，覆盖 client.base_url
        url = self.endpoint + "?" + "&".join(
            f"{_percent_encode(k)}={_percent_encode(v)}" for k, v in sorted(params.items()))
        try:
            r = await self.client.get(url)
        except httpx.HTTPError as e:
            raise SmsError(f"aliyun sms request failed: {type(e).__name__}") from e
        if r.status_code != 200:
            raise SmsError(f"aliyun sms http {r.status_code}")
        try:
            body = r.json()
        except ValueError as e:
            raise SmsError("aliyun sms invalid response") from e
        if not isinstance(body, dict) or body.get("Code") != "OK":
            code_ = body.get("Code") if isinstance(body, dict) else None
            msg = body.get("Message") if isinstance(body, dict) else None
            raise SmsError(f"aliyun sms rejected: {code_} {msg}")


def build_sms_sender(settings, client):
    """aliyun 且四项配置齐全 -> AliyunSmsSender；否则退回 LogSmsSender（aliyun 配置不全时告警）。"""
    if settings.sms_provider == "aliyun":
        if all([settings.sms_aliyun_access_key_id, settings.sms_aliyun_access_key_secret,
                settings.sms_aliyun_sign_name, settings.sms_aliyun_template_code]):
            return AliyunSmsSender(client, settings.sms_aliyun_access_key_id,
                                   settings.sms_aliyun_access_key_secret,
                                   settings.sms_aliyun_sign_name,
                                   settings.sms_aliyun_template_code)
        print("[sms] WARNING: SMS_PROVIDER=aliyun but config incomplete, falling back to log sender",
              file=sys.stderr)
    return LogSmsSender()
