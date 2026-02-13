# Deploying the AI Agent Server (server.py)

This guide documents how to deploy the `server.py` Python application, which serves as the AI Agent execution backend.

## 1. Prerequisites

The server requires Python 3.9+ and the following dependencies.

### Install Dependencies
```bash
pip install -r requirements.txt
```

## 2. Environment Variables

Create a `.env` file or configure these environment variables in your deployment platform (AWS, Replit, etc.).

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | The port to run the server on (default: 8000) | No |
| `ANTHROPIC_API_KEY` | Key for Claude models | Yes (if using Claude) |
| `OPENAI_API_KEY` | Key for OpenAI models | Yes (if using GPT) |
| `GOOGLE_API_KEY` | Key for Gemini models | Yes (if using Gemini) |
| `SUPABASE_URL` | Your Supabase Project URL | **Yes** (New) |
| `SUPABASE_SERVICE_KEY` | Your Supabase **Service Role Key** (for bypassing RLS) | **Yes** (New) |
| `LANGCHAIN_API_KEY` | Optional: For LangSmith tracing | No |

**Important:** 
The `SUPABASE_SERVICE_KEY` allows the server to write logs and chat history natively without being restricted by user-level Row Level Security (RLS) policies. **Do not expose this key to the frontend client.**

## 3. Running Locally

```bash
uvicorn server:app --reload
```
The server will start at `http://localhost:8000`.

## 4. Deploying to Replit

1. Create a new Repl.
2. Upload `server.py`, `requirements.txt`, and the `custom_tools/` folder.
3. In the "Secrets" tab (lock icon), add all the environment variables listed above.
4. In the "Shell" or `.replit` config, set the run command:
   ```bash
   uvicorn server:app --host 0.0.0.0 --port 8000
   ```
5. Click "Run". Your server URL will be displayed in the web view.

## 5. Deploying to AWS (EC2/Lambda)

### EC2 (Typical)
1. Launch an Ubuntu instance.
2. Clone your repo or upload files.
3. Install Python 3 and pip.
4. `pip install -r requirements.txt`.
5. Run using `uvicorn` (recommend using `gunicorn` with uvicorn workers for production, or `systemd` to keep it running).
6. Ensure Security Groups allow inbound traffic on port 8000 (or use Nginx to reverse proxy port 80).

## 6. Verification

To verify the database integration:
1. Send a request to the `/api/chat` endpoint with a `chat_id`.
2. Check the `chat_messages` table in Supabase.
3. You should see a new message with `role: assistant` containing the final response and a "Thinking Process" log section.
