
# DRF Blog API with Frontend

This is a Django REST Framework-based backend + Vanilla JS frontend project aimed at building a smart blog platform.  
It includes JWT authentication, post/comment/like/notification features, and is demo-ready as a functional service.

---

## Tech Stack

- Backend: Python, Django, Django REST Framework, SimpleJWT
- Frontend: Vanilla JS (Fetch API), HTML, CSS
- Database: SQLite (for local development)
- Etc: Git, VSCode, Python v3.12

---

## Features

### User Authentication
- JWT-based signup / login / logout
- Access / Refresh token handling
- Login persistence via LocalStorage

### Post Features
- Create / Read / Update / Delete (CRUD)
- Tag autocomplete
- AI-based tag suggestions / summary (planned)

### Comments & Likes
- Add/delete comments on posts
- Post likes (prevents duplicates)

### Notifications
- Real-time alerts for comments on user’s posts
- Mark notifications as read
- Display unread notification count in UI

---

## Project Structure

```bash
├── blog/               # Django app (models, viewsets, serializers)
├── frontend/           # HTML + JS + CSS (fetch API integration)
├── config/             # Django project settings
├── manage.py
```

---

## How to Run

### 1. Start Backend
```bash
python manage.py runserver
```

### 2. Start Frontend
```bash
cd frontend
python -m http.server 5500
```

### 3. Access URLs
- Backend: http://127.0.0.1:8000
- Frontend: http://127.0.0.1:5500

---

## Planned Improvements

- AI-based content summarization
- Tag suggestion integration
- Admin/User role distinction
- Comment likes
- Search (by title, content, tags)

---

## Developer

- Name: Mirae Kang
- Position: Aspiring Backend Developer

---
