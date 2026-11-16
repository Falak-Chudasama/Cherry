# Fruit Application Developer Guide (`Fruits.md`)

This guide serves as the authoritative, comprehensive manual for developing, integrating, and running Fruit applications within the Basket ecosystem. It covers all exposed APIs, reverse proxy routing, central authentication, real-time WebSockets, and database access via Basket's shared MongoDB cluster.

---

## 1. Architecture and Ecosystem Topology

Basket acts as the central control plane, AI engine hub, and reverse proxy coordinator for all fruit applications. Each fruit is an autonomous service with its own frontend and backend, integrating with Basket for intelligence, authentication, and database storage.

```
                           +------------------------+
                           |  Browser / Client Apps  |
                           +-----------+------------+
                                       |
                   HTTPS (*.jam) / WSS | Port 80, 443
                                       v
               +------------------------------------------------+
               |            Nginx Edge Reverse Proxy            |
               +---+--------------+--------------+------------+-+
                   |              |              |            |
+------------------v---+ +--------v-------+ +----v----+ +-----v-------+
|        Basket        | |      Plum      | |  Kiwi   | |   Banana    |
| Core API: 127.0.0.1  | | API: 127.0.0.2 | |  API:   | |    API:     |
|   Port: 10010 (API)  | |  Port: 10000   | |127.0.0.3| |  127.0.0.4  |
|   Port: 10020 (Ctrl) | |  WS:   10010   | |Port:10000|Port: 10000   |
+----------+-----------+ +--------+-------+ +----+----+ +-----+-------+
           |                      |              |            |
           +----------------------+--------------+------------+
                                  |
                                  v
                +------------------------------------+
                |       Central MongoDB Server       |
                |       127.0.0.1:10000              |
                | Databases: basket, plum, kiwi...   |
                +------------------------------------+
```

### 1.1 Local Subnet & Port Convention

All services run locally on specific loopback IP aliases (`127.0.0.X`) to avoid port collisions and provide clean process isolation:

| Fruit / Service | Frontend URL | API / Gateway URL | Loopback IP & Port | Type |
| :--- | :--- | :--- | :--- | :--- |
| **Basket (AI Core)** | `https://basket.jam` | `https://api.basket.jam` | `127.0.0.1:10010` | FastAPI |
| **Basket (Control)** | — | `http://127.0.0.1:10020` | `127.0.0.1:10020` | FastAPI |
| **Plum** | `https://plum.jam` | `https://api.plum.jam` | `127.0.0.2:10000` (WS: `10010`) | Node / Express |
| **Kiwi** | `https://kiwi.jam` | `https://api.kiwi.jam` | `127.0.0.3:10000` | Python / FastAPI |
| **Banana** | `https://banana.jam` | `https://api.banana.jam` | `127.0.0.4:10000` | Python / FastAPI |
| **Quince** | `https://quince.jam` | `https://api.quince.jam` | `127.0.0.5:10000` (MCP: `10010`) | Python / FastAPI |
| **Lemon** | `https://lemon.jam` | `https://api.lemon.jam` | `127.0.0.6:10000` | Python / FastAPI |
| **Cherry** | `https://cherry.jam` | `https://api.cherry.jam` | `127.0.0.7:10000` | Python / FastAPI |

### 1.2 Underlying AI Model Endpoints (Managed by Basket)

- **LLM Engine (llama.cpp / LM Studio / Groq)**: `http://127.0.0.1:10030`
- **STT Engine (Qwen3-ASR)**: `http://127.0.0.1:10040`
- **TTS Engine (PocketTTS / Kokoro)**: `http://127.0.0.1:10050`
- **Vector DB (ChromaDB)**: Embedded `/chromadb` managed by Basket

---

## 2. MongoDB Database Guide for Fruits

Basket manages a centralized, high-performance MongoDB instance listening on:

```
mongodb://127.0.0.1:10000/
```

### 2.1 Database Namespace Isolation

Every fruit application owns its dedicated database namespace. A fruit MUST connect to its assigned database and NEVER write to or modify another fruit's database.

- **Plum**: `mongodb://127.0.0.1:10000/plum`
- **Kiwi**: `mongodb://127.0.0.1:10000/kiwi`
- **Banana**: `mongodb://127.0.0.1:10000/banana`
- **Lemon**: `mongodb://127.0.0.1:10000/lemon`
- **Quince**: `mongodb://127.0.0.1:10000/quince`
- **Cherry**: `mongodb://127.0.0.1:10000/cherry`
- **Basket**: `mongodb://127.0.0.1:10000/basket` (internal orchestrator state & auth tickets)

### 2.2 Connection Examples

#### Python (PyMongo & Motor Async)

```python
import os
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:10000/myfruit")

# Synchronous PyMongo Client
sync_client = MongoClient("mongodb://127.0.0.1:10000/")
db = sync_client["myfruit"]
users_collection = db["users"]

# Asynchronous Motor Client (Recommended for FastAPI / AsyncIO)
async_client = AsyncIOMotorClient(MONGO_URI)
async_db = async_client.get_default_database()

async def get_user(email: str):
    return await async_db.users.find_one({"email": email})
```

#### Node.js / TypeScript (Mongoose & Native MongoDB Driver)

```typescript
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:10000/plum';

// Option A: Mongoose
export async function connectMongoose(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to Fruit MongoDB via Mongoose');
}

// Option B: Native MongoDB Client
export const mongoClient = new MongoClient(MONGO_URI);
export async function getDb() {
  await mongoClient.connect();
  return mongoClient.db();
}
```

### 2.3 Indexing & TTL Rules

1. **Transient Sessions / Tickets**: Use MongoDB TTL (Time-To-Live) indexes for temporary data (e.g. auth handoffs, cache entries, short-lived jobs):
   ```python
   db.temporary_jobs.create_index("created_at", expireAfterSeconds=300)
   ```
2. **Compound & Unique Constraints**: Always enforce unique indexes at the database level for emails, usernames, and resource hashes.
3. **No Database Dropping**: Fruits must never call `client.drop_database()` on initialization; only collections owned by that fruit may be created or cleared.

---

## 3. Basket APIs Exposed for Fruits

All fruit backends interact with Basket's Core API directly or via Nginx:

- **Direct Internal URL**: `http://127.0.0.1:10010`
- **Reverse Proxy URL**: `https://api.basket.jam`

### Standard Request Headers

Every request sent from a fruit service to Basket should include:

```http
Content-Type: application/json
X-Basket-Application: <fruit_id>    # e.g., "plum", "kiwi", "banana"
X-Request-ID: <uuid>               # Unique request tracing identifier
```

---

### 3.1 LLM & AI Model Inference (`/llm`)

Basket provides unified, hardware-accelerated LLM inference (powered by local llama.cpp or cloud backends).

#### A. Chat Completion (`POST /llm/chat`)
OpenAI-compatible chat completion supporting both streaming (SSE) and non-streaming responses.

```http
POST /llm/chat HTTP/1.1
Host: api.basket.jam
X-Basket-Application: plum
Content-Type: application/json

{
  "model": "qwen/qwen3.8-27b",
  "messages": [
    {"role": "system", "content": "You are Plum Mail Assistant."},
    {"role": "user", "content": "Summarize my unread emails."}
  ],
  "temperature": 0.7,
  "top_p": 0.95,
  "max_tokens": 1024,
  "stream": false
}
```

**Response (Non-streaming)**:
```json
{
  "id": "chatcmpl-91f8a2d3",
  "object": "chat.completion",
  "created": 1731678900,
  "model": "qwen/qwen3.8-27b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "You have 3 unread messages..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 45,
    "completion_tokens": 30,
    "total_tokens": 75
  }
}
```

#### B. Dense Vector Embeddings (`POST /llm/embeddings`)
Generates high-dimensional semantic embeddings using `jinaai/jina-embeddings-v5-text-nano` (or Qwen3-Embedding).

```http
POST /llm/embeddings HTTP/1.1
Host: api.basket.jam
X-Basket-Application: banana
Content-Type: application/json

{
  "input": ["Track 1: Classical Symphony", "Track 2: Ambient Forest Sounds"]
}
```

**Response**:
```json
{
  "object": "list",
  "data": [
    {"object": "embedding", "index": 0, "embedding": [0.0412, -0.0195, ...]},
    {"object": "embedding", "index": 1, "embedding": [0.0128, -0.0541, ...]}
  ],
  "model": "jina-embeddings-v5-text-nano"
}
```

#### C. Model Inventory & VRAM Management
- `GET /llm/models`: Returns list of currently active and loaded models.
- `POST /llm/load?model_id=<id>&context_length=16000`: Explicitly loads a model into GPU memory.
- `POST /llm/unload?instance_id=<id>`: Unloads an active model.
- `POST /llm/unload-all`: Frees all loaded models from VRAM.

---

### 3.2 Speech-to-Text Transcription (`/stt`)

High-speed local audio transcription powered by Qwen3-ASR (0.6B / 1.7B).

#### Transcription (`POST /stt/transcribe`)
Send raw audio file via `multipart/form-data`:

```http
POST /stt/transcribe HTTP/1.1
Host: api.basket.jam
X-Basket-Application: lemon
Content-Type: multipart/form-data; boundary=---Boundary

---Boundary
Content-Disposition: form-data; name="file"; filename="voice_note.wav"
Content-Type: audio/wav

<binary audio bytes>
---Boundary
Content-Disposition: form-data; name="prompt"

Optional guidance prompt for vocabulary / punctuation.
---Boundary--
```

**Response**:
```json
{
  "text": "Transcribed voice command output from the audio.",
  "duration_sec": 2.45
}
```

---

### 3.3 Text-to-Speech Voice Synthesis (`/tts`)

Natural voice synthesis powered by PocketTTS / Kokoro.

#### Voice Synthesis (`POST /tts/synthesize`)
```http
POST /tts/synthesize HTTP/1.1
Host: api.basket.jam
X-Basket-Application: quince
Content-Type: application/json

{
  "text": "Your export has completed successfully.",
  "voice": "jane",
  "temperature": 0.75,
  "speed": 1.0
}
```

**Response**:
Returns an HTTP 200 stream with `Content-Type: audio/wav` containing synthesized audio bytes.

---

### 3.4 Multi-Modal Chat & Agent Pipeline (`/chat`)

Unified agentic pipeline that performs RAG memory retrieval, runs Quince MCP tool calls, generates reasoning, and optionally synthesizes speech in a single Server-Sent Events (SSE) stream.

#### Text Input Endpoint (`POST /chat` or `POST /chat/text`)
```http
POST /chat/text HTTP/1.1
Host: api.basket.jam
Content-Type: application/json

{
  "text": "Send an email to John confirming tomorrow's meeting",
  "application": "plum",
  "synthesize_speech": false,
  "llm": {
    "system_prompt": "You are Plum agent.",
    "temperature": 0.7
  }
}
```

**Response (Server-Sent Events Stream)**:
```
event: context
data: {"retrieved_chunks": [...]}

event: delta
data: {"content": "I am drafting "}

event: delta
data: {"content": "the confirmation email..."}

event: done
data: {"finish_reason": "stop"}
```

---

### 3.5 Shared Context & Application Memory (`/context`)

Allows fruit applications to store persistent key facts, commands, and semantic memories in Basket's central vector and metadata store.

- `POST /context/memory/add`:
  ```json
  {
    "application": "quince",
    "memory": "User prefers dark mode and concise summaries",
    "is_temporary": false
  }
  ```
- `POST /context/memory/get`: Retrieve memory by `{"application": "quince", "memory_id": "..."}`.
- `POST /context/memory/get_all`: Retrieve all memories for `{"application": "quince"}`.
- `DELETE /context/memory/delete`: Delete memory by `{"application": "quince", "memory_id": "..."}`.
- `POST /context/command/add`: Register semantic macro command.
- `POST /context/command/get_all`: Retrieve registered commands.

---

### 3.6 Central Google OAuth & Auth Tickets (`/auth`)

Basket centralizes Google OAuth 2.0 authentication for all fruits. This eliminates the need to configure separate Google Cloud credentials, scopes, and redirect URIs in every fruit.

```
+------------+        1. GET /auth/url?fruit=plum        +------------+
| Plum Client| ----------------------------------------> | Basket API |
|            | <---------------------------------------- |            |
|            |        2. Returns Google OAuth URL        +------------+
+-----+------+
      |
      | 3. Redirects browser to Google
      v
+------------+
| Google Auth|
+-----+------+
      |
      | 4. User signs in -> Redirects to Basket Callback
      v
+------------+        5. Exchanges code for tokens        +------------+
| Basket API | ----------------------------------------> |   Google   |
|            | <---------------------------------------- |   OAuth    |
|            |        6. Writes 180s Ticket to Mongo     +------------+
|            |
|            | 7. 302 Redirect to https://api.plum.jam/user/auth/handoff?ticket=XYZ
+------------+
      |
      v
+------------+        8. POST /auth/ticket/redeem         +------------+
| Plum API   | ----------------------------------------> | Basket API |
|            | <---------------------------------------- | (Deletes   |
|            |        9. Returns Tokens & User Profile   |  ticket)   |
+------------+                                           +------------+
```

#### Step 1: Request Google Auth URL (`GET /auth/url`)
```http
GET /auth/url?fruit=plum&action=login HTTP/1.1
Host: api.basket.jam
```

**Response**:
```json
{
  "success": true,
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=http://localhost:10010/user/auth/callback&response_type=code&scope=...&state=eyJmcnVpdCI6ICJwbHVtIiwgImFjdGlvbiI6ICJsb2dpbiJ9"
}
```

#### Step 2: Google Redirects to Basket Callback
User authorizes permissions. Google redirects to:
`http://localhost:10010/user/auth/callback?code=...&state=...`

Basket:
1. Exchanges `code` for Google `access_token`, `refresh_token`, and user profile.
2. Generates an atomic `ticket_id` (cryptographically random hex).
3. Stores ticket in MongoDB `basket.auth_tickets` with an automatic 180-second TTL index.
4. Redirects the user's browser to the target fruit:
   ```
   302 Found
   Location: https://api.plum.jam/user/auth/handoff?ticket=<ticket_id>
   ```

#### Step 3: Fruit Backend Redeems Ticket (`POST /auth/ticket/redeem`)
The fruit backend intercepts the ticket on its `/user/auth/handoff` route and immediately redeems it with Basket:

```http
POST /auth/ticket/redeem HTTP/1.1
Host: api.basket.jam
Content-Type: application/json

{
  "ticket_id": "4a7b9c1d2e3f..."
}
```

*(Alternatively: `GET /auth/ticket/{ticket_id}`)*

**Response**:
```json
{
  "success": true,
  "ticket": {
    "ticket_id": "4a7b9c1d2e3f...",
    "fruit": "plum",
    "action": "login",
    "user_info": {
      "id": "1082374628...",
      "email": "user@gmail.com",
      "name": "Jane Doe",
      "picture": "https://lh3.googleusercontent.com/..."
    },
    "tokens": {
      "access_token": "ya29.a0AfH6...",
      "refresh_token": "1//04hW...",
      "expires_in": 3599,
      "token_type": "Bearer"
    },
    "created_at": "2026-11-15T14:30:00Z"
  }
}
```

*Note: The ticket is atomic and single-use (`find_one_and_delete`). It is permanently destroyed upon redemption.*

---

### 3.7 Real-Time Voice WebSocket (`/ws`)

For fruits requiring full-duplex conversational voice interaction (e.g. voice assistants, voice notes):

- **WebSocket URL**: `wss://basket.jam/ws` or `ws://127.0.0.1:10010/ws`

#### Protocol Flow:
1. **Initialize Session**:
   ```json
   {
     "type": "voice_start",
     "application": "plum",
     "synthesize_speech": true,
     "voice": "jane",
     "system_prompt": "You are Plum voice email assistant."
   }
   ```
2. **Stream Audio**: Send binary PCM audio frames (`16000Hz, 16-bit, mono`).
3. **Receive Events from Basket**:
   - `{"type": "partial_transcript", "data": "send email..."}`
   - `{"type": "final_transcript", "data": "Send email to Sarah."}`
   - `{"type": "llm_delta", "data": "Sending confirmation..."}`
   - Binary TTS audio chunks streamed back to the client for immediate playback.
4. **End Session**:
   ```json
   {"type": "voice_stop"}
   ```

---

## 4. Control Plane & Orchestration APIs (Port 10020)

Basket's control server (`http://127.0.0.1:10020`) orchestrates the lifecycle of all fruit applications, Nginx routing, and system telemetry:

- `GET /api/overview`: Ecosystem dashboard metrics (CPU, RAM, GPU, active fruits, running services, routes).
- `GET /api/system/telemetry`: Real-time hardware telemetry.
- `GET /api/fruits`: List all fruits, icon paths, and health statuses.
- `POST /api/fruits/{fruit_id}/start`: Start a fruit's backend and frontend processes.
- `POST /api/fruits/{fruit_id}/end`: Stop a fruit's running processes.
- `POST /api/fruits/{fruit_id}/restart`: Gracefully restart a fruit.
- `GET /api/logs/{service_id}`: Real-time tailed logs for a specific service.
- `POST /api/nginx/reload`: Hot-reload Nginx configuration without dropping connections.
- `POST /api/nginx/validate`: Validate `nginx -t` syntax.

---

## 5. Blueprint: Adding a New Fruit Application

Follow these steps to build and integrate a new fruit app (e.g., `Mango`):

1. **Design System & Accent**:
   - Create `mango-icon.svg`.
   - Run OKLCH Accent Derivation per `DESIGN.md` Section 3. Record tokens in `DESIGN.md`.
2. **Assign Subnet & Port**:
   - Choose loopback IP: `127.0.0.8`.
   - Backend API port: `10000`.
   - Nginx local domains: `mango.jam` (frontend) and `api.mango.jam` (API).
3. **Connect to MongoDB**:
   - Connection URI: `mongodb://127.0.0.1:10000/mango`.
4. **Integrate AI & Auth**:
   - Point AI calls to `https://api.basket.jam/llm/chat` with `X-Basket-Application: mango`.
   - Point OAuth to `https://api.basket.jam/auth/url?fruit=mango`.
5. **Register in Basket Ecosystem**:
   - Add entry to `FRUITS` dictionary in `src/control/server.py`.
   - Add routes in `ROUTES` table for Nginx reverse proxying.
