# Client Frontend

This is the extracted frontend bundle for the YS application. It is a prebuilt Vue.js bundle with no build step required.

## Configuration Change

### Modified File
- **File:** `js/app.9ba1133b.js`
- **Change:** Updated `apiURL` configuration
  - **From:** `https://soft-api.data-ys.com/api`
  - **To:** `http://127.0.0.1:8000/api`

This change redirects API calls from the production upstream service to the local backend proxy.

## Running the Client

1. **Start the local backend first:**
   ```bash
   cd backend
   ./run.sh
   ```
   The backend proxy will start on `http://127.0.0.1:8000` by default.

2. **Open the client:**
   - **Browser:** Open `file:///Users/ezreal/Documents/www/ys/ys-mac/client/index.html` in a web browser
   - **Electron:** Use the Electron wrapper to run the application (details in main project README)

3. **Real Login & API Calls:**
   All API calls now go through the local backend proxy at `http://127.0.0.1:8000/api`. The proxy forwards requests to the upstream service at `https://soft-api.data-ys.com/api`. When you log in, monitor the backend logs for:
   ```
   POST /api/auth/login -> 200
   ```
   This confirms the proxy is working and forwarding requests correctly.

## Other URLs (Unchanged)

The following URLs remain pointing to the production services and are out of scope for phase 1:
- `fileURL`: Production file service
- `chartURL`: Production chart service
- `orgLink`: Organization links

## Notes

- This is a prebuilt bundle; there is no source code or build process in this directory.
- The proxy must be running before login attempts will succeed.
- Token masking and request forwarding are handled by the backend proxy.
