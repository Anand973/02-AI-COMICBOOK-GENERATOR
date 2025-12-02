# AI Comic Generator

A web app to generate AI-based comics (images + story) using **Google Gemini AI** and **Stability AI**.  
Users can signup, login, create comics, and view a gallery. All data is stored in **MongoDB**.

---

## Features

- User Authentication (Signup/Login)
- Generate AI Comics
- Store comics in MongoDB
- Gallery of generated comics
- Responsive UI

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone
```
```bash
cd your-repo
```

---
### 2. Install Dependencies
```bash
npm install
```

Dependencies include: Express, Mongoose, EJS, Axios, Cookie-parser, dotenv, bcrypt, @google/genai.

---

### 3. Create .env File

In the project root, create a .env file:

 .env
 ---
 Add the following structure:
```bash
PORT=3000

NODE_ENV=development

GEMINI_API_KEY=your_gemini_api_key

STABILITY_API_KEY=your_stability_api_key

MONGODB_URI=your_mongodb_connection_string

```
---

### 4. Generate API Keys

Google Gemini AI: Go to Google Cloud Console
, create a project, enable Gemini AI, generate API key.

Stability AI: Go to Stability AI
, create account, generate API key.

MongoDB Atlas: Go to MongoDB Atlas
, create a free cluster, create a DB user, copy connection string.

Add the keys and URL to your .env file.
---
---

### 5. Run the Project
```bash
node ch.js
```

or with nodemon:
```bash
nodemon ch.js
```

Open in browser: http://localhost:3000

---

### 6. Usage

Go to /user/signup → Create a new account.

Go to /user/login → Login.

Go to /create → Generate AI comic.

Go to /gallery → View all comics.

---

### Notes:

Do not commit .env to GitHub.

Keep API keys and DB credentials private.

MongoDB Atlas must allow your IP to connect.

---

### Tech Stack

Node.js, Express

MongoDB / Mongoose

EJS Templates

Google Gemini AI

Stability AI

Tailwind CSS (optional for styling)



