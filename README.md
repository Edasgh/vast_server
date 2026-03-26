# 🌌 Vast Server — Real-Time Collaborative Backend

The **Vast Server** powers the infinite collaborative whiteboard, enabling **real-time updates, user management, and persistent storage** for the Vast client. It handles live collaboration via **Socket.io**, stores canvas data in **MongoDB**, and provides secure access and undo/redo management for multi-user sessions.

### ⚡ Key Responsibilities

* **Real-time Collaboration:** Broadcast canvas updates, new elements, and undo/redo actions to all connected clients.
* **Data Persistence:** Save canvas state, access requests, and user sessions in MongoDB.
* **Session Management:** Handle join requests, active collaborators, and access control.
* **Authentication:** Secure routes and actions with JWT-based authentication.

### 🛠 Tech Stack

| Layer         | Technology         |
| ------------- | ------------------ |
| **Backend**   | Node.js, Express   |
| **Real-time** | Socket.io          |
| **Database**  | MongoDB (Mongoose) |
| **Auth**      | JWT                |

### 🚀 Getting Started

1. Install dependencies: `npm install`
2. Set environment variables in `.env` (Mongo URI, JWT secret, client URL)
    ```env
    PORT=8080
    CLIENT_BASE_URL=http://localhost:5173
    
    NODE_ENV=development || production
    
    JWT_SECRET=
    
    MONGODB_PASSWORD=
    
    MONGO_URI=
    
    GOOGLE_ACCOUNT_USER=
    GOOGLE_ACCOUNT_PASS=
    GOOGLE_ACCOUNT_APP_NAME=
    ```

3. Start server:
    -  `npm run dev` (for nodejs)
    -  `npm run start` (for nodemon)

> The server works seamlessly with the [Vast Client](https://github.com/Edasgh/vast) to deliver a **massive, interactive, and collaborative workspace**.



