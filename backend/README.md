# Backend Proxy

## Purpose

This FastAPI backend serves as a transparent HTTP proxy that forwards client requests to the upstream data-ys.com API. It enables local development and testing by providing:

- CORS-enabled local endpoint (localhost/127.0.0.1 only)
- Request forwarding and response filtering
- Transparent token passthrough from client authentication
- Error handling for upstream connectivity issues

## Installation

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Server

Start the development server with:
```bash
./run.sh
```

The server listens on `http://127.0.0.1:8000` by default.

### Customization

Configure behavior via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Port to listen on |
| `UPSTREAM` | `https://soft-api.data-ys.com/api` | Upstream API base URL |
| `UPSTREAM_VERIFY_TLS` | `true` | Verify upstream TLS certificates (set to `false` for self-signed certs in dev) |
| `UPSTREAM_TIMEOUT` | `15.0` | Request timeout in seconds |

Example with custom port and upstream:
```bash
PORT=8080 UPSTREAM=http://localhost:3000/api ./run.sh
```

## Testing

Run the test suite:
```bash
pytest
```

Run with verbose output:
```bash
pytest -v
```

All tests verify proxy behavior in isolation without calling the real upstream API.

## Security Note

**Important:** This proxy does not initiate upstream calls on its own. All requests must originate from the client, and authentication tokens must be provided by the client's own login session:

1. Client logs in to the frontend (handles authentication)
2. Client's HTTP requests include the `token` header
3. Proxy transparently forwards the token to upstream
4. Proxy never stores, generates, or manages tokens

The proxy is designed for **local development only** (CORS restricted to localhost/127.0.0.1).
