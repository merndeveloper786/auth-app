# Backend API - Authentication System

This is the backend API for the authentication system built with Express.js, TypeScript, Prisma, and PostgreSQL.

## Features

- ✅ User registration and login
- ✅ Google OAuth integration
- ✅ JWT token authentication
- ✅ Profile management
- ✅ Image upload with Cloudinary
- ✅ Rate limiting
- ✅ Input validation
- ✅ Secure password hashing
- ✅ User listing and profile viewing

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# Database
DATABASE_URL="your_supabase_connection_string_here"

# JWT Secret
JWT_SECRET="your_super_secret_jwt_key_here"

# Cloudinary
CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name"
CLOUDINARY_API_KEY="your_cloudinary_api_key"
CLOUDINARY_API_SECRET="your_cloudinary_api_secret"

# Google OAuth (Optional for now)
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"

# Server
PORT=5000
NODE_ENV=development
```

### 3. Database Setup

#### Supabase Setup:
1. Go to [https://app.supabase.com/](https://app.supabase.com/)
2. Create a new project
3. Go to Settings > Database
4. Copy the connection string
5. Replace `your_supabase_connection_string_here` in `.env`

#### Run Database Migrations:
```bash
npx prisma migrate dev --name init
```

### 4. Cloudinary Setup

1. Go to [https://cloudinary.com/](https://cloudinary.com/)
2. Create a free account
3. Get your Cloud Name, API Key, and API Secret
4. Add them to your `.env` file

### 5. Generate Prisma Client

```bash
npx prisma generate
```

### 6. Run the Server

#### Development:
```bash
npm run dev
```

#### Production:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication Routes (`/api/auth`)

- `POST /signup` - Register a new user
- `POST /login` - Login with email/password
- `POST /google` - Google OAuth login
- `POST /logout` - Logout (client-side token removal)
- `GET /me` - Get current user

### User Routes (`/api/users`)

- `GET /` - Get all users (authenticated)
- `GET /profile` - Get current user's profile
- `PUT /profile` - Update current user's profile
- `GET /:userId` - Get user by ID
- `DELETE /profile/picture` - Delete profile picture

## Request Examples

### Signup
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "age": 25,
    "gender": "male"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Update Profile (with image)
```bash
curl -X PUT http://localhost:5000/api/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "name=John Updated" \
  -F "age=26" \
  -F "gender=male" \
  -F "profilePicture=@/path/to/image.jpg"
```

## Security Features

- ✅ Password hashing with bcrypt
- ✅ JWT token authentication
- ✅ Rate limiting
- ✅ Input validation
- ✅ CORS protection
- ✅ File upload restrictions
- ✅ XSS protection
- ✅ CSRF protection (via JWT)

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message here"
}
```

## Rate Limiting

- General routes: 100 requests per 15 minutes
- Auth routes: 5 requests per 15 minutes
- Upload routes: 10 requests per 15 minutes

## File Upload

- Supported formats: JPG, PNG, GIF, WebP
- Maximum file size: 5MB
- Images are automatically resized to 400x400px
- Stored in Cloudinary with optimization

## Next Steps

1. Set up your environment variables
2. Run the database migrations
3. Start the server
4. Test the endpoints
5. Move to frontend setup

The server will run on `http://localhost:5000` by default. 
